import { tool } from "@opencode-ai/plugin";
import { conflictsHost } from "./_memory";

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
    return await conflictsHost(args.host);
  },
});
