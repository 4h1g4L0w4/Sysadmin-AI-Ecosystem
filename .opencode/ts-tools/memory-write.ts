import { tool } from "@opencode-ai/plugin";
import {
  appendObservations,
  upsertHostProfile,
  renderHostContext,
  validateObservations,
} from "./_memory";

export default tool({
  description:
    "Store observations about a host in TOON persistent memory. Automatically updates the host entity (consolidated state) and regenerates the compact context view. Run AFTER every diagnostic tool to persist findings.",
  args: {
    host: tool.schema
      .string()
      .describe("Hostname or IP address the observations refer to"),
    observations: tool.schema
      .string()
      .describe(
        "JSON array of Observation objects. Each must have: id, key, value, source, observed_at (ISO), confidence (0-1), ttl_days. Optional: entity, evidence.",
      ),
  },
  async execute(args) {
    if (!args.host) return "ERROR: 'host' is required";
    if (!args.observations) return "ERROR: 'observations' is required (JSON array)";

    let obs: any[];
    try {
      obs = JSON.parse(args.observations);
    } catch {
      return "ERROR: 'observations' must be valid JSON array";
    }

    const err = validateObservations(obs, args.host);
    if (err) return err;

    await appendObservations(obs);
    await upsertHostProfile(args.host, obs);
    await renderHostContext(args.host);

    return `Written ${obs.length} observations for ${args.host}. Entity and view updated.`;
  },
});
