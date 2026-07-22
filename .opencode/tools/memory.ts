import { tool } from "@opencode-ai/plugin";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import {
  ensureMemoryLayout,
  appendObservations,
  getHostTextContext,
  upsertHostProfile,
  renderHostContext,
  compactHostFromObservations,
  validateObservations,
  staleHostFacts,
  conflictsHost,
  memoryPaths,
} from "./_memory";

export default tool({
  description:
    "TOON-based persistent memory for server diagnostics. Stores observations, consolidates host profiles, and generates compact host context views for the AI.",
  args: {
    action: tool.schema
      .string()
      .describe(
        "Action: 'init', 'read-host-context', 'write-observation', 'compact-host', 'render-host-context', 'stale', 'conflicts'",
      ),
    host: tool.schema
      .string()
      .optional()
      .describe("Hostname or IP address (required for most actions)"),
    observations: tool.schema
      .string()
      .optional()
      .describe("JSON-encoded array of Observation objects (for write-observation)"),
  },
  async execute(args, context) {
    const { action, host, observations: obsRaw } = args;

    try {
      switch (action) {
        /* ── init ──────────────────────────────────── */
        case "init": {
          await ensureMemoryLayout();
          const dirs = [
            memoryPaths.hosts(),
            memoryPaths.services(),
            memoryPaths.clusters(),
            memoryPaths.observations(),
            memoryPaths.incidents(),
            memoryPaths.changes(),
            memoryPaths.views(),
            memoryPaths.schemas(),
          ];
          let count = 0;
          for (const d of dirs) {
            if (existsSync(d)) count++;
          }
          return (
            `Memory layout initialized.\n` +
            `  entities/hosts/  ${existsSync(memoryPaths.hosts()) ? "✓" : "✗"}\n` +
            `  entities/services/  ${existsSync(memoryPaths.services()) ? "✓" : "✗"}\n` +
            `  entities/clusters/  ${existsSync(memoryPaths.clusters()) ? "✓" : "✗"}\n` +
            `  events/observations/  ${existsSync(memoryPaths.observations()) ? "✓" : "✗"}\n` +
            `  events/incidents/  ${existsSync(memoryPaths.incidents()) ? "✓" : "✗"}\n` +
            `  events/changes/  ${existsSync(memoryPaths.changes()) ? "✓" : "✗"}\n` +
            `  views/host-context/  ${existsSync(memoryPaths.views()) ? "✓" : "✗"}\n` +
            `  schemas/  ${existsSync(memoryPaths.schemas()) ? "✓" : "✗"}\n` +
            `\nSchema files (${count} files present):\n` +
            (await listSchemas())
          );
        }

        /* ── read-host-context ──────────────────────── */
        case "read-host-context": {
          if (!host) return "ERROR: 'host' is required for read-host-context";
          const ctx = await getHostTextContext(host);
          return ctx;
        }

        /* ── write-observation ──────────────────────── */
        case "write-observation": {
          if (!host) return "ERROR: 'host' is required for write-observation";
          let obs: any[];
          try {
            obs = obsRaw ? JSON.parse(obsRaw) : [];
          } catch {
            return "ERROR: 'observations' must be valid JSON array of Observation objects";
          }
          const err = validateObservations(obs, host);
          if (err) return err;
          await appendObservations(obs);
          await upsertHostProfile(host, obs);
          await renderHostContext(host);
          return `Written ${obs.length} observations for ${host}. Entity and view updated.`;
        }

        /* ── compact-host ───────────────────────────── */
        case "compact-host": {
          if (!host) return "ERROR: 'host' is required for compact-host";
          const result = await compactHostFromObservations(host);
          await renderHostContext(host);
          return result;
        }

        /* ── render-host-context ────────────────────── */
        case "render-host-context": {
          if (!host) return "ERROR: 'host' is required for render-host-context";
          await renderHostContext(host);
          const ctx = await getHostTextContext(host);
          return `Host context rendered for ${host}:\n\n${ctx}`;
        }

        /* ── stale ──────────────────────────────────── */
        case "stale": {
          if (!host) return "ERROR: 'host' is required for stale";
          return await staleHostFacts(host);
        }

        /* ── conflicts ──────────────────────────────── */
        case "conflicts": {
          if (!host) return "ERROR: 'host' is required for conflicts";
          return await conflictsHost(host);
        }

        default:
          return (
            `Unknown action '${action}'. Available actions:\n` +
            `  init                    — create directory layout + verify schemas\n` +
            `  read-host-context       — get TOON context for a host\n` +
            `  write-observation       — store observations, update entity & view\n` +
            `  compact-host            — rebuild entity from this week's observations\n` +
            `  render-host-context     — regenerate the host context view\n` +
            `  stale                   — list expired facts for a host\n` +
            `  conflicts               — list detected contradictions for a host`
          );
      }
    } catch (err: any) {
      return `MEMORY ERROR: ${err?.message || err}`;
    }
  },
});

async function listSchemas(): Promise<string> {
  const dir = memoryPaths.schemas();
  if (!existsSync(dir)) return "  (no schemas directory)";
  const files = await readdir(dir);
  const toonFiles = files.filter((f) => f.endsWith(".toon"));
  if (toonFiles.length === 0) return "  (no schema files)";
  return toonFiles.map((f) => `  ${f}`).join("\n");
}
