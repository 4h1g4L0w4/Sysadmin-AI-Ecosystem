import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Run CISOfy Lynis security audit on a remote server via SSH (read-only). Downloads Lynis to /tmp if not installed. Returns hardening index, warnings, and suggestions. No sudo, no modifications on the remote host.",
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
        "Output mode: 'quick' (default, summary with top warnings/suggestions) or 'full' (raw report)",
      ),
  },
  async execute(args, context) {
    const mode = args.mode || "quick";
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile:
        args.identityFile ||
        resolveSshKey(context.directory || context.worktree),
    };

    const cmd = [
      `LYNIS_BIN=""`,
      `if [ -x /tmp/lynis/lynis ]; then`,
      `  LYNIS_BIN=/tmp/lynis/lynis`,
      `elif command -v lynis >/dev/null 2>&1; then`,
      `  LYNIS_BIN=lynis`,
      `else`,
      `  DOWNLOADER=""`,
      `  command -v curl >/dev/null 2>&1 && DOWNLOADER="curl -sL -o /tmp/lynis.tar.gz"`,
      `  [ -z "$DOWNLOADER" ] && command -v wget >/dev/null 2>&1 && DOWNLOADER="wget -q -O /tmp/lynis.tar.gz"`,
      `  if [ -z "$DOWNLOADER" ]; then echo "NEED_CURL_OR_WGET"; exit 1; fi`,
      `  $DOWNLOADER https://api.github.com/repos/CISOfy/lynis/tarball || { echo "DOWNLOAD_FAILED"; exit 1; }`,
      `  tar xzf /tmp/lynis.tar.gz -C /tmp 2>/dev/null || { echo "EXTRACT_FAILED"; exit 1; }`,
      `  rm -f /tmp/lynis.tar.gz`,
      `  DIR=$(ls -d /tmp/CISOfy-lynis-* 2>/dev/null | head -1)`,
      `  [ -n "$DIR" ] && mv "$DIR" /tmp/lynis`,
      `  [ -x /tmp/lynis/lynis ] && LYNIS_BIN=/tmp/lynis/lynis || { echo "EXTRACT_FAILED"; exit 1; }`,
      `fi`,
      `"$LYNIS_BIN" audit system --quick --no-colors --report-file /tmp/lynis-report.dat >/dev/null 2>&1 || true`,
      `echo "==REPORT=="`,
      `cat /tmp/lynis-report.dat 2>/dev/null || cat /var/log/lynis-report.dat 2>/dev/null || echo "NO_REPORT"`,
    ];

    const output = sshExec(sshOpts, cmd, 120_000);

    if (output.includes("NEED_CURL_OR_WGET")) {
      return "ERROR: no curl or wget on server. Install one or install Lynis manually.";
    }
    if (output.includes("DOWNLOAD_FAILED")) {
      return "ERROR: failed to download Lynis from GitHub.";
    }
    if (output.includes("EXTRACT_FAILED")) {
      return "ERROR: failed to extract Lynis tarball.";
    }

    const reportMatch = output.match(/==REPORT==\n([\s\S]*)/);
    if (!reportMatch) {
      return `ERROR: no Lynis report produced.\n\nRaw output:\n${output.slice(0, 2000)}`;
    }

    const reportText = reportMatch[1].trim();
    if (!reportText || reportText === "NO_REPORT") {
      return `ERROR: Lynis did not produce a report.\n\nRaw output:\n${output.slice(0, 2000)}`;
    }

    if (mode === "full") {
      return reportText;
    }

    const hardeningMatch = reportText.match(/hardening_index\s*=\s*(\d+)/);
    const warnings = reportText.match(/warning\[\d+\]\s*=\s*(.+)/g) || [];
    const suggestions =
      reportText.match(/suggestion\[\d+\]\s*=\s*(.+)/g) || [];

    const lines: string[] = [];
    lines.push(`=== Lynis Security Audit ===`);
    lines.push(`Hardening Index: ${hardeningMatch ? hardeningMatch[1] : "N/A"}`);
    lines.push(`Warnings: ${warnings.length}`);
    lines.push(`Suggestions: ${suggestions.length}`);

    if (warnings.length > 0) {
      lines.push("");
      lines.push("--- Warnings ---");
      for (const w of warnings.slice(0, 10)) {
        const text = w.replace(/^warning\[\d+\]\s*=\s*/, "").trim();
        lines.push(`  - ${text}`);
      }
      if (warnings.length > 10) {
        lines.push(`  ... and ${warnings.length - 10} more`);
      }
    }

    if (suggestions.length > 0) {
      lines.push("");
      lines.push("--- Suggestions ---");
      for (const s of suggestions.slice(0, 10)) {
        const text = s.replace(/^suggestion\[\d+\]\s*=\s*/, "").trim();
        lines.push(`  - ${text}`);
      }
      if (suggestions.length > 10) {
        lines.push(`  ... and ${suggestions.length - 10} more`);
      }
    }

    lines.push("");
    lines.push("Use mode='full' for the complete report.");

    return lines.join("\n");
  },
});
