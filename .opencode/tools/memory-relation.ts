import { tool } from "@opencode-ai/plugin";
import {
  readToonFile,
  writeToonFile,
  sanitizeEntityId,
  memoryPaths,
  nowIso,
  HostProfile,
  RelationRow,
} from "./_memory";
import { existsSync } from "fs";
import path from "path";

const VALID_RELATIONS = ["proxiesa", "depende-de", "conecta-a", "balancea-a", "es-clon-de"];

export default tool({
  description:
    "Register or list relationships between hosts. Relationships are persisted in the host profile and shown in the host context view for future diagnostics.",
  args: {
    action: tool.schema
      .string()
      .describe("Action: 'add' (register a new relation) or 'list' (show relations for a host)"),
    from: tool.schema
      .string()
      .optional()
      .describe("Source host for the relation (required for 'add')"),
    relation: tool.schema
      .string()
      .optional()
      .describe("Type of relation: 'proxiesa', 'depende-de', 'conecta-a', 'balancea-a', 'es-clon-de'"),
    to: tool.schema
      .string()
      .optional()
      .describe("Target host for the relation (required for 'add')"),
    host: tool.schema
      .string()
      .optional()
      .describe("Host to list relations for (required for 'list')"),
  },
  async execute(args) {
    switch (args.action) {
      case "add": {
        if (!args.from) return "ERROR: 'from' is required to add a relation";
        if (!args.relation) return "ERROR: 'relation' is required";
        if (!args.to) return "ERROR: 'to' is required";

        const r = args.relation.toLowerCase();
        if (!VALID_RELATIONS.includes(r)) {
          return `ERROR: invalid relation '${r}'. Valid: ${VALID_RELATIONS.join(", ")}`;
        }

        const relation: RelationRow = {
          from: args.from,
          relation: r,
          to: args.to,
          confidence: 0.9,
          observed_at: nowIso(),
        };

        // Update both hosts' profiles
        for (const host of [args.from, args.to]) {
          const safeHost = sanitizeEntityId(host);
          const filePath = path.join(memoryPaths.hosts(), `${safeHost}.toon`);

          let profile: HostProfile = {
            schema: "sysadmin.host-profile.v1",
            entity: `host:${host}`,
            host,
            last_seen: nowIso(),
            roles: [],
            services: [],
            ports: [],
            facts: [],
            known_risks: [],
            relations: [],
          };

          if (existsSync(filePath)) {
            try {
              profile = await readToonFile<HostProfile>(filePath, profile);
            } catch {
              // start fresh if corrupt
            }
          }

          profile.last_seen = nowIso();
          // Avoid duplicates
          const existing = profile.relations.findIndex(
            (rel) => rel.from === args.from && rel.relation === r && rel.to === args.to,
          );
          if (existing >= 0) {
            profile.relations[existing] = relation;
          } else {
            profile.relations.push(relation);
          }

          await writeToonFile(filePath, profile);
        }

        return `Relation registered: ${args.from} —${r}→ ${args.to}`;
      }

      case "list": {
        if (!args.host) return "ERROR: 'host' is required to list relations";

        const safeHost = sanitizeEntityId(args.host);
        const filePath = path.join(memoryPaths.hosts(), `${safeHost}.toon`);

        if (!existsSync(filePath)) {
          return `No profile found for ${args.host}.`;
        }

        let profile: HostProfile;
        try {
          profile = await readToonFile<HostProfile>(filePath, null!);
        } catch {
          return `Cannot read profile for ${args.host}.`;
        }
        if (!profile) return `Cannot read profile for ${args.host}.`;

        if (profile.relations.length === 0) {
          return `No relations registered for ${args.host}.`;
        }

        const lines = profile.relations.map(
          (rel) => `  ${rel.from} —${rel.relation}→ ${rel.to} (since ${rel.observed_at})`,
        );
        return `Relations for ${args.host} (${profile.relations.length}):\n${lines.join("\n")}`;
      }

      default:
        return (
          `Unknown action '${args.action}'. Available:\n` +
          `  add from=<host> relation=<type> to=<host>  — register a new relation\n` +
          `  list host=<host>                            — show relations for a host`
        );
    }
  },
});
