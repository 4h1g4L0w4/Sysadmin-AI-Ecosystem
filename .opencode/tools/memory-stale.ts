import { tool } from "@opencode-ai/plugin";
import {
  readToonFile,
  detectStaleFacts,
  sanitizeEntityId,
  memoryPaths,
  HostProfile,
} from "./_memory";
import { existsSync } from "fs";
import path from "path";

export default tool({
  description:
    "List expired (stale) facts for a host. Facts past their ttl_days are stale. Run before reusing old facts to avoid basing decisions on outdated information.",
  args: {
    host: tool.schema
      .string()
      .describe("Hostname or IP address to check for stale facts"),
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

    const stale = detectStaleFacts(profile);
    if (stale.length === 0) return `No stale facts for ${args.host}.`;

    const lines = stale.map(
      (f) => `  ${f.key} = ${f.value} (observed ${f.observed_at}, TTL ${f.ttl_days}d, expired)`,
    );
    return `Stale facts for ${args.host} (${stale.length}):\n${lines.join("\n")}`;
  },
});
