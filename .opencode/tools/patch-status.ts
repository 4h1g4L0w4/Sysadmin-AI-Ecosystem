import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

function extractSection(output: string, name: string): string[] {
  const re = new RegExp(`==${name}==\n([\\s\\S]*?)(?=\\n==|$)`);
  const m = output.match(re);
  if (!m) return [];
  return m[1].trim().split("\n").filter(Boolean);
}

function parseAptUpgradable(lines: string[]): { pkg: string; from: string; to: string; repo: string }[] {
  const pkgs: { pkg: string; from: string; to: string; repo: string }[] = [];
  for (const line of lines) {
    if (line.startsWith("Listing")) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    const pkg = parts[0];
    const arch = parts[1] || "";
    const upgradable = parts[2] || "";

    let repo = "";
    let from = "";
    const f = line.match(/\[upgradable from: ([^\]]+)\]/);
    if (f) from = f[1];

    const r = line.match(/\/.*? /);
    if (r) {
      repo = r[0].replace(/\/| /g, "");
    }

    pkgs.push({ pkg, from, to: `${pkg}/${repo} ${arch}`, repo });
  }
  return pkgs;
}

export default tool({
  description:
    "Check patch status of a remote server via SSH (read-only). Shows how outdated the host is, number of pending updates (total and security), packages that would break on upgrade, orphaned/held packages, and reboot requirement. Detects apt (Debian/Ubuntu), dnf (Fedora/RHEL), and yum (CentOS 7).",
  args: {
    host: tool.schema
      .string()
      .describe("Remote server hostname or IP address"),
    port: tool.schema
      .number()
      .optional()
      .describe("SSH port (default: 22)"),
    username: tool.schema
      .string()
      .optional()
      .describe("SSH username (default: current user)"),
    identityFile: tool.schema
      .string()
      .optional()
      .describe("Path to SSH private key (auto-detected from ssh-keys/ if omitted)"),
    mode: tool.schema
      .string()
      .optional()
      .describe(
        "Output mode: 'summary' (default, totals + top issues) or 'full' (complete package list) or 'security' (security updates only)",
      ),
  },
  async execute(args, context) {
    const mode = args.mode || "summary";
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile:
        args.identityFile ||
        resolveSshKey(context.directory || context.worktree),
    };

    const cmd = [
      `if command -v apt-get >/dev/null 2>&1; then`,
      `  echo "PM=apt"`,
      `  echo "OS=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"`,
      `  echo "==UPGRADABLE=="`,
      `  apt list --upgradable 2>/dev/null`,
      `  echo "==SECURITY=="`,
      `  apt list --upgradable 2>/dev/null | grep -i security 2>/dev/null || true`,
      `  echo "==SIMULATE=="`,
      `  apt-get -s dist-upgrade 2>/dev/null | grep -E "^Remv |^Inst " | head -100 || true`,
      `  echo "==HELD=="`,
      `  apt-mark showhold 2>/dev/null || true`,
      `  echo "==ORPHANED=="`,
      `  apt list '~o' 2>/dev/null || true`,
      `  echo "==REBOOT=="`,
      `  [ -f /var/run/reboot-required ] && echo "YES" || echo "NO"`,
      `elif command -v dnf >/dev/null 2>&1; then`,
      `  echo "PM=dnf"`,
      `  echo "OS=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"`,
      `  echo "==UPGRADABLE=="`,
      `  dnf check-update --quiet 2>/dev/null || true`,
      `  echo "==SECURITY=="`,
      `  dnf updateinfo list security --quiet 2>/dev/null || true`,
      `  echo "==SIMULATE=="`,
      `  dnf distro-sync --assumeno 2>/dev/null | grep -E "^Removing|^Installing|^Upgrading|^Downgrading" | head -100 || true`,
      `  echo "==HELD=="`,
      `  dnf versionlock list --quiet 2>/dev/null || true`,
      `  echo "==ORPHANED=="`,
      `  dnf list extras --quiet 2>/dev/null || true`,
      `  echo "==REBOOT=="`,
      `  [ -f /var/run/reboot-required ] && echo "YES" || echo "NO"`,
      `elif command -v yum >/dev/null 2>&1; then`,
      `  echo "PM=yum"`,
      `  echo "OS=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"`,
      `  echo "==UPGRADABLE=="`,
      `  yum check-update --quiet 2>/dev/null || true`,
      `  echo "==SECURITY=="`,
      `  yum updateinfo list security --quiet 2>/dev/null || true`,
      `  echo "==SIMULATE=="`,
      `  yum distro-sync --assumeno 2>/dev/null | grep -E "^Removing|^Installing|^Upgrading" | head -100 || true`,
      `  echo "==HELD=="`,
      `  yum versionlock list --quiet 2>/dev/null || true`,
      `  echo "==ORPHANED=="`,
      `  yum list extras --quiet 2>/dev/null || true`,
      `  echo "==REBOOT=="`,
      `  [ -f /var/run/reboot-required ] && echo "YES" || echo "NO"`,
      `else`,
      `  echo "PM=unknown"`,
      `  echo "OS=unknown"`,
      `  echo "NEEDS_INVESTIGATION"`,
      `fi`,
    ];

    const output = sshExec(sshOpts, cmd, 90_000);

    if (output.includes("NEEDS_INVESTIGATION")) {
      return "ERROR: unknown package manager (neither apt, dnf, nor yum detected).";
    }

    const pmMatch = output.match(/PM=(\w+)/);
    const osMatch = output.match(/OS=(.+)/);
    const pm = pmMatch ? pmMatch[1] : "?";
    const os = osMatch ? osMatch[1] : "?";

    const upgradable = extractSection(output, "UPGRADABLE");
    const securityRaw = extractSection(output, "SECURITY");
    const simulate = extractSection(output, "SIMULATE");
    const held = extractSection(output, "HELD");
    const orphaned = extractSection(output, "ORPHANED");
    const rebootRaw = extractSection(output, "REBOOT");
    const reboot = rebootRaw.includes("YES");

    const security = securityRaw.filter(
      (l) => !l.startsWith("Listing") && !l.startsWith("Last") && !l.startsWith("Security:"),
    );

    const totalUpdates = upgradable.length;
    const securityCount = security.length;
    const removedUpgrade = simulate.filter((l) => l.startsWith("Remv") || l.startsWith("Removing")).length;
    const heldCount = held.filter(Boolean).length;
    const orphanedCount = orphaned.filter(Boolean).length;

    const totalSimulate = simulate.length;

    if (mode === "security") {
      const lines: string[] = [];
      lines.push(`=== Security Updates: ${args.host} ===`);
      lines.push(`OS: ${os}`);
      lines.push(``);
      if (securityCount === 0) {
        lines.push(`No security updates pending.`);
      } else {
        lines.push(`Total: ${securityCount}`);
        for (const s of security) {
          lines.push(`  - ${s}`);
        }
      }
      return lines.join("\n");
    }

    if (mode === "full") {
      const lines: string[] = [];
      lines.push(`=== Patch Status (full): ${args.host} ===`);
      lines.push(`OS: ${os} | PM: ${pm}`);
      lines.push(`Updates: ${totalUpdates} (${securityCount} security) | Reboot: ${reboot ? "YES" : "no"}`);
      lines.push(``);
      lines.push(`--- Upgradable (${totalUpdates}) ---`);
      if (upgradable.length === 0) lines.push(`(none)`);
      for (const p of upgradable) lines.push(`  ${p}`);
      lines.push(``);
      lines.push(`--- Simulated dist-upgrade (${totalSimulate}) ---`);
      if (simulate.length === 0) lines.push(`(no changes)`);
      for (const s of simulate) lines.push(`  ${s}`);
      if (held.length > 0) {
        lines.push(``);
        lines.push(`--- Held ---`);
        for (const h of held) lines.push(`  ${h}`);
      }
      if (orphaned.length > 0) {
        lines.push(``);
        lines.push(`--- Orphaned ---`);
        for (const o of orphaned) lines.push(`  ${o}`);
      }
      return lines.join("\n");
    }

    const lines: string[] = [];
    lines.push(`=== Patch Status: ${args.host} ===`);
    lines.push(`OS: ${os}`);
    lines.push(`Package Manager: ${pm}`);
    lines.push(`Updates available: ${totalUpdates} (${securityCount} security, ${totalUpdates - securityCount} regular)`);
    lines.push(`Reboot required: ${reboot ? "YES (kernel/pending update)" : "no"}`);

    if (removedUpgrade > 0) {
      lines.push(`Packages that would be REMOVED on upgrade: ${removedUpgrade}`);
    } else {
      lines.push(`Upgrade risk: no packages would be removed`);
    }

    if (heldCount > 0) lines.push(`Held/pinned packages: ${heldCount}`);
    if (orphanedCount > 0) lines.push(`Orphaned packages: ${orphanedCount}`);

    if (security.length > 0) {
      lines.push(``);
      lines.push(`--- Security updates (top 10) ---`);
      const top = pm === "apt" ? security.slice(0, 10).map((s) => s.replace(/\s+/g, " ").trim()) : security.slice(0, 10);
      for (const s of top) {
        lines.push(`  - ${s}`);
      }
      if (security.length > 10) lines.push(`  ... and ${security.length - 10} more`);
    }

    const removed = simulate.filter((l) => l.startsWith("Remv") || l.startsWith("Removing")).slice(0, 10);
    if (removed.length > 0) {
      lines.push(``);
      lines.push(`--- Packages that would be removed (top 10) ---`);
      for (const r of removed) {
        lines.push(`  - ${r.replace(/^Remv\s+/, "").replace(/^Removing\s+/, "").trim()}`);
      }
      if (removedUpgrade > 10) lines.push(`  ... and ${removedUpgrade - 10} more`);
    }

    if (held.length > 0) {
      lines.push(``);
      lines.push(`--- Held / pinned ---`);
      for (const h of held.slice(0, 10)) {
        lines.push(`  - ${h}`);
      }
      if (held.length > 10) lines.push(`  ... and ${held.length - 10} more`);
    }

    if (orphaned.length > 0) {
      lines.push(``);
      lines.push(`--- Orphaned ---`);
      for (const o of orphaned.slice(0, 10)) {
        lines.push(`  - ${o}`);
      }
      if (orphaned.length > 10) lines.push(`  ... and ${orphaned.length - 10} more`);
    }

    lines.push(``);
    lines.push(`Use mode='full' for complete list, mode='security' for security-only.`);

    return lines.join("\n");
  },
});
