import { tool } from "@opencode-ai/plugin";
import {
  readToonFile,
  detectConflicts,
  sanitizeEntityId,
  memoryPaths,
  HostProfile,
} from "./_memory";
import { existsSync } from "fs";
import path from "path";

export default tool({
  description:
    "Detect contradictions in host memory. For example: a service reported as active but its port is closed, or a risk that was resolved but still marked open. Run to verify data consistency.",
  args: {
    host: tool.schema
      .string()
      .describe("Hostname or IP address to check for conflicts"),
  },
  async execute(args) {
    if (!args.host) return "ERROR: 'host' is required";

    const safeHost = sanitizeEntityId(args.host);
    const profilePath = path.join(memoryPaths.hosts(), `${safeHost}.toon`);

    if (!existsSync(profilePath)) {
      return `No profile found for ${args.host}. Run memory-write first.`;
    }

    const profile = await readToonFile<HostProfile>(profilePath, null!);
    if (!profile) return `Cannot read profile for ${args.host}.`;

    const conflicts = detectConflicts(profile);
    if (conflicts.length === 0) return `No conflicts detected for ${args.host}.`;

    const lines = conflicts.map(
      (c) => `  [${c.severity}] ${c.description} (sources: ${c.sources.join(", ")})`,
    );
    return `Conflicts for ${args.host} (${conflicts.length}):\n${lines.join("\n")}`;
  },
});
