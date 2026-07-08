import { tool } from "@opencode-ai/plugin";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

const ROOT = findRoot();

function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "AGENTS.md"))) return dir;
    const p = path.dirname(dir);
    if (p === dir) break;
    dir = p;
  }
  return process.cwd();
}

function ok(label: string, detail?: string): string {
  return `  ✓ ${label}${detail ? ` (${detail})` : ""}`;
}

function fail(label: string, detail?: string): string {
  return `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
}

export default tool({
  description:
    "Verify the Sysadmin AI Ecosystem setup. Checks SSH keys, memory layout, configuration files, and tool registration. Run this to diagnose issues with the ecosystem itself.",
  args: {},
  async execute() {
    const lines: string[] = [];
    lines.push(`=== Sysadmin AI Ecosystem — Self Check ===`);
    lines.push(`Project root: ${ROOT}`);
    lines.push("");

    // opencode.json
    lines.push(`--- Configuration ---`);
    const configPath = path.join(ROOT, "opencode.json");
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
        const toolCount = Object.keys(cfg.tools || {}).length;
        const skillCount = (cfg.skills || []).length;
        lines.push(ok("opencode.json", `${toolCount} tools, ${skillCount} skills`));
      } catch {
        lines.push(fail("opencode.json", "invalid JSON"));
      }
    } else {
      lines.push(fail("opencode.json", "not found"));
    }

    const envPath = path.join(ROOT, ".env");
    if (existsSync(envPath)) {
      lines.push(ok(".env present"));
    } else {
      lines.push(ok(".env", "optional, not found"));
    }

    // SSH keys
    lines.push("");
    lines.push(`--- SSH Keys ---`);
    const sshDir = path.join(ROOT, "ssh-keys");
    if (existsSync(sshDir)) {
      const entries = readdirSync(sshDir);
      const keys = entries.filter((f) => !f.endsWith(".pub") && !f.startsWith("."));
      const pubs = entries.filter((f) => f.endsWith(".pub"));
      if (keys.length > 0) {
        lines.push(ok(`ssh-keys/`, `${keys.length} private key(s): ${keys.join(", ")}`));
      } else {
        lines.push(fail("ssh-keys/", "no private keys found (only .pub or dotfiles)"));
      }
      if (pubs.length > 0) {
        lines.push(ok(`  public keys: ${pubs.join(", ")}`));
      }
    } else {
      lines.push(fail("ssh-keys/ directory", "not found"));
    }

    // Memory layout
    lines.push("");
    lines.push(`--- TOON Memory ---`);
    const memDirs: [string, string][] = [
      ["entities/hosts/", path.join(ROOT, "memoria", "entities", "hosts")],
      ["entities/services/", path.join(ROOT, "memoria", "entities", "services")],
      ["entities/clusters/", path.join(ROOT, "memoria", "entities", "clusters")],
      ["events/observations/", path.join(ROOT, "memoria", "events", "observations")],
      ["events/incidents/", path.join(ROOT, "memoria", "events", "incidents")],
      ["events/changes/", path.join(ROOT, "memoria", "events", "changes")],
      ["views/host-context/", path.join(ROOT, "memoria", "views", "host-context")],
      ["schemas/", path.join(ROOT, "memoria", "schemas")],
    ];

    for (const [label, dir] of memDirs) {
      if (existsSync(dir)) {
        const count = readdirSync(dir).length;
        lines.push(ok(`memoria/${label}`, `${count} file(s)`));
      } else {
        lines.push(fail(`memoria/${label}`, "directory not found"));
      }
    }

    // Legacy markdown
    const legacyHosts = path.join(ROOT, "memoria", "hosts");
    if (existsSync(legacyHosts)) {
      const count = readdirSync(legacyHosts).filter((f) => f.endsWith(".md")).length;
      lines.push(ok(`memoria/hosts/ (legacy)`, `${count} markdown file(s)`));
    }

    const legacyIncidents = path.join(ROOT, "memoria", "incidentes");
    if (existsSync(legacyIncidents)) {
      const count = readdirSync(legacyIncidents).length;
      lines.push(ok(`memoria/incidentes/ (legacy)`, `${count} file(s)`));
    }

    // Tool files
    lines.push("");
    lines.push(`--- Tools (source files) ---`);
    const toolDir = path.join(ROOT, ".opencode", "tools");
    if (existsSync(toolDir)) {
      const tools = readdirSync(toolDir).filter((f) => f.endsWith(".ts") && !f.startsWith("_"));
      for (const t of tools.sort()) {
        lines.push(ok(t));
      }
    } else {
      lines.push(fail(".opencode/tools/", "directory not found"));
    }

    // AGENTS.md
    lines.push("");
    lines.push(`--- Workflow ---`);
    if (existsSync(path.join(ROOT, "AGENTS.md"))) {
      lines.push(ok("AGENTS.md"));
    } else {
      lines.push(fail("AGENTS.md", "not found — routing rules missing"));
    }

    const summaryOk = lines.filter((l) => l.startsWith("  ✓")).length;
    const summaryFail = lines.filter((l) => l.startsWith("  ✗")).length;
    lines.push("");
    lines.push(`Result: ${summaryOk} ok, ${summaryFail} issues`);

    return lines.join("\n");
  },
});
