import { tool } from "@opencode-ai/plugin";
import { staleHostFacts } from "./_memory";

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
    return await staleHostFacts(args.host);
  },
});
