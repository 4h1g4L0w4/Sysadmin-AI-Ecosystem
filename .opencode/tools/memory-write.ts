import { tool } from "@opencode-ai/plugin";
import {
  appendObservations,
  upsertHostProfile,
  renderHostContext,
  Observation,
} from "./_memory";

const REQUIRED_OBS_FIELDS = ["id", "key", "value", "source", "observed_at", "confidence", "ttl_days"];

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

    let obs: Observation[];
    try {
      obs = JSON.parse(args.observations);
    } catch {
      return "ERROR: 'observations' must be valid JSON array";
    }

    if (!Array.isArray(obs) || obs.length === 0) {
      return "ERROR: 'observations' must be a non-empty array";
    }

    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const missing = REQUIRED_OBS_FIELDS.filter((f) => o[f] === undefined || o[f] === null);
      if (missing.length > 0) {
        return `ERROR: observation #${i} (id='${o.id || "?"}') missing: ${missing.join(", ")}`;
      }
      if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
        return `ERROR: observation #${i} confidence must be 0-1, got ${o.confidence}`;
      }
      if (typeof o.ttl_days !== "number" || o.ttl_days < 0) {
        return `ERROR: observation #${i} ttl_days must be non-negative, got ${o.ttl_days}`;
      }
    }

    for (const o of obs) {
      if (!o.entity) o.entity = `host:${args.host}`;
    }

    await appendObservations(obs);
    await upsertHostProfile(args.host, obs);
    await renderHostContext(args.host);

    return `Written ${obs.length} observations for ${args.host}. Entity and view updated.`;
  },
});
