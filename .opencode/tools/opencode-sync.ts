import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import path from "path";
import { projectRoot } from "./_root";

const SELF = "opencode-sync.ts";
const TOOLS_PREFIX = "./.opencode/tools/";

export default tool({
  description:
    "Sincroniza opencode.json con las tools y skills reales en disco. Ejecuta git pull (opcional), detecta tools nuevas/faltantes y actualiza el registro automáticamente.",
  args: {
    pull: {
      type: "boolean",
      description: "Ejecutar git pull --ff-only antes de sincronizar (default: true)",
      required: false,
    },
    apply: {
      type: "boolean",
      description: "Aplicar cambios en opencode.json (default: false, solo muestra diff)",
      required: false,
    },
    branch: {
      type: "string",
      description: "Rama para git pull (default: main)",
      required: false,
    },
  },
  async execute({ pull = true, apply = false, branch = "main" }) {
    const ROOT = projectRoot();
    const lines: string[] = [];
    lines.push("=== Sync Tools & Skills ===");
    lines.push(`Project: ${ROOT}`);
    lines.push("");

    if (pull) {
      lines.push("--- Git pull ---");
      try {
        execSync("git --version", { cwd: ROOT, stdio: "pipe" });
        const status = execSync("git status --porcelain", { cwd: ROOT, stdio: "pipe" }).toString().trim();
        if (status.length > 0) {
          lines.push("  \u26a0 Working tree has uncommitted changes — skipping pull");
        } else {
          const result = execSync(`git pull origin ${branch} --ff-only`, {
            cwd: ROOT,
            stdio: "pipe",
            timeout: 30000,
          }).toString().trim();
          lines.push(`  \u2713 ${result || "Already up to date"}`);
        }
      } catch (e: any) {
        const msg = e.stderr?.toString().trim() || e.message || "unknown error";
        if (msg.includes("not a git command") || msg.includes("not found")) {
          lines.push("  \u26a0 Git not available — skipping pull");
        } else if (msg.includes("Not possible to fast-forward")) {
          lines.push("  \u2717 Merge conflict — aborting sync. Resolve conflicts manually.");
          lines.push("");
          lines.push("Result: sync aborted (merge conflict)");
          return lines.join("\n");
        } else {
          lines.push(`  \u26a0 Git pull failed: ${msg}`);
        }
      }
      lines.push("");
    }

    lines.push("--- Scanning filesystem ---");
    const toolDir = path.join(ROOT, ".opencode", "tools");
    const skillDir = path.join(ROOT, ".opencode", "skills");

    const diskTools: string[] = [];
    if (existsSync(toolDir)) {
      for (const f of readdirSync(toolDir).sort()) {
        if (f.endsWith(".ts") && !f.startsWith("_")) {
          diskTools.push(f);
        }
      }
    }
    lines.push(`  Tools on disk: ${diskTools.length}`);

    const diskSkills: string[] = [];
    if (existsSync(skillDir)) {
      for (const d of readdirSync(skillDir).sort()) {
        const sp = path.join(skillDir, d, "SKILL.md");
        if (statSync(path.join(skillDir, d)).isDirectory() && existsSync(sp)) {
          diskSkills.push(d);
        }
      }
    }
    lines.push(`  Skills on disk: ${diskSkills.length}`);

    const configPath = path.join(ROOT, "opencode.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const currentPlugins: string[] = config.plugin || [];

    const registeredTools = new Set<string>();
    for (const entry of currentPlugins) {
      if (entry.startsWith(TOOLS_PREFIX)) {
        registeredTools.add(entry.slice(TOOLS_PREFIX.length));
      }
    }

    const diskToolSet = new Set(diskTools);
    const toAdd = diskTools.filter((f) => !registeredTools.has(f));
    const toRemove = Array.from(registeredTools).filter((f) => !diskToolSet.has(f) && f !== SELF);
    const needsUpdate = toAdd.length > 0 || toRemove.length > 0;

    lines.push("");
    lines.push("--- Diff ---");
    if (toAdd.length > 0) {
      for (const f of toAdd) {
        lines.push(`  + ${TOOLS_PREFIX}${f}`);
      }
    }
    if (toRemove.length > 0) {
      for (const f of toRemove) {
        lines.push(`  - ${TOOLS_PREFIX}${f}`);
      }
    }
    if (!needsUpdate) {
      lines.push("  No changes needed");
    }

    lines.push("");
    lines.push("--- Skills ---");
    const currentSkills: string[] = config.skills?.paths || [];
    const repoSkillDir = `./.opencode/skills/`;
    const missingSkills = diskSkills.filter(
      (d) => !currentSkills.some((p) => p === repoSkillDir + d || p === repoSkillDir),
    );
    if (missingSkills.length > 0) {
      for (const s of missingSkills) {
        lines.push(`  ! Skill directory '${s}' not registered`);
      }
    } else {
      lines.push(`  All ${diskSkills.length} skills registered`);
    }

    if (apply && needsUpdate) {
      const newPlugins = currentPlugins.filter(
        (entry: string) =>
          !(entry.startsWith(TOOLS_PREFIX) && toRemove.includes(entry.slice(TOOLS_PREFIX.length))),
      );
      for (const f of toAdd) {
        newPlugins.push(`${TOOLS_PREFIX}${f}`);
      }
      if (!newPlugins.includes(`${TOOLS_PREFIX}${SELF}`)) {
        newPlugins.push(`${TOOLS_PREFIX}${SELF}`);
      }
      newPlugins.sort((a: string, b: string) => {
        const aIsTool = a.startsWith(TOOLS_PREFIX);
        const bIsTool = b.startsWith(TOOLS_PREFIX);
        if (aIsTool && bIsTool) return a.localeCompare(b);
        if (aIsTool) return 1;
        if (bIsTool) return -1;
        return 0;
      });

      config.plugin = newPlugins;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      lines.push("");
      lines.push("  \u2713 opencode.json updated");
    } else if (apply && !needsUpdate) {
      lines.push("");
      lines.push("  \u2713 opencode.json already in sync");
    } else if (!apply && needsUpdate) {
      lines.push("");
      lines.push("  \u2139 Run with apply=true to apply these changes");
    }

    lines.push("");
    const changes = toAdd.length + toRemove.length;
    const status =
      changes === 0 ? "synced" : apply ? `${changes} change(s) applied` : `${changes} change(s) pending`;
    lines.push(`Result: ${status}`);

    return lines.join("\n");
  },
});
