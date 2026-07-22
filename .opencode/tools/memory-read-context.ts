import { tool } from "@opencode-ai/plugin";
import { getHostTextContext } from "./_memory";
import { projectRoot } from "./_root";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";

export default tool({
  description:
    "Read the persistent TOON memory context for a host. Returns the compact host context view (health, services, ports, risks, stale facts). Used BEFORE running any diagnostic tool to understand what is already known about the server.",
  args: {
    host: tool.schema
      .string()
      .describe("Hostname or IP address to read context for"),
  },
  async execute(args) {
    if (!args.host) return "ERROR: 'host' is required";

    const ctx = await getHostTextContext(args.host);

    const safeHost = args.host.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_").slice(0, 128);
    const root = projectRoot();
    const toonViewPath = path.join(root, "memoria", "views", "host-context", `${safeHost}.toon`);
    if (!existsSync(toonViewPath)) {
      const markdownPath = path.join(root, "memoria", "hosts", `${args.host}.md`);
      if (existsSync(markdownPath)) {
        try {
          const md = await readFile(markdownPath, "utf-8");
          return `# Legacy Markdown context (no TOON yet)\n\n${md}`;
        } catch {}
      }
    }

    return ctx;
  },
});
