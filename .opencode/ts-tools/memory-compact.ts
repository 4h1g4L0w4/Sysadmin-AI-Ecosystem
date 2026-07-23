import { tool } from "@opencode-ai/plugin";
import {
  ensureMemoryLayout,
  compactHostFromObservations,
  renderHostContext,
  getHostTextContext,
  memoryPaths,
} from "./_memory";
import { existsSync } from "fs";

export default tool({
  description:
    "Initialize the TOON memory directory layout, compact a host's observations into its entity profile, or regenerate the host context view. Maintenance actions for persistent memory.",
  args: {
    action: tool.schema
      .string()
      .describe("Action: 'init' (create directories), 'compact-host' (rebuild entity from observations), 'render-host-context' (regenerate view)"),
    host: tool.schema
      .string()
      .optional()
      .describe("Hostname or IP address (required for compact-host and render-host-context)"),
  },
  async execute(args) {
    switch (args.action) {
      case "init": {
        await ensureMemoryLayout();
        const check = (d: string, label: string) => `${label} ${existsSync(d) ? "✓" : "✗"}`;
        return (
          `Memory layout initialized:\n` +
          check(memoryPaths.hosts(), "  entities/hosts/") + "\n" +
          check(memoryPaths.services(), "  entities/services/") + "\n" +
          check(memoryPaths.clusters(), "  entities/clusters/") + "\n" +
          check(memoryPaths.observations(), "  events/observations/") + "\n" +
          check(memoryPaths.incidents(), "  events/incidents/") + "\n" +
          check(memoryPaths.changes(), "  events/changes/") + "\n" +
          check(memoryPaths.views(), "  views/host-context/") + "\n" +
          check(memoryPaths.schemas(), "  schemas/")
        );
      }

      case "compact-host": {
        if (!args.host) return "ERROR: 'host' is required for compact-host";
        const result = await compactHostFromObservations(args.host);
        await renderHostContext(args.host);
        return result;
      }

      case "render-host-context": {
        if (!args.host) return "ERROR: 'host' is required for render-host-context";
        await renderHostContext(args.host);
        const ctx = await getHostTextContext(args.host);
        return `Host context rendered for ${args.host}:\n\n${ctx}`;
      }

      default:
        return (
          `Unknown action '${args.action}'. Available:\n` +
          `  init                    — create directory layout\n` +
          `  compact-host            — rebuild entity from this week's observations\n` +
          `  render-host-context     — regenerate the host context view`
        );
    }
  },
});
