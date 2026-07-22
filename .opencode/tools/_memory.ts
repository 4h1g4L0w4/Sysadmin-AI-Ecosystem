import { encode as toonEncode, decode as toonDecode } from "@toon-format/toon";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import { projectRoot } from "./_root";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Observation {
  id: string;
  entity: string;
  key: string;
  value: string | number | boolean;
  source: string;
  observed_at: string;
  confidence: number;
  ttl_days: number;
  evidence?: string;
}

export interface ServiceRow {
  name: string;
  status: string;
  enabled: string | boolean;
  port?: string;
  source: string;
  observed_at: string;
  confidence: number;
  ttl_days: number;
}

export interface PortRow {
  proto: string;
  port: string;
  process: string;
  bind: string;
  state: string;
  source: string;
  observed_at: string;
  confidence: number;
  ttl_days: number;
}

export interface FactRow {
  key: string;
  value: string | number | boolean;
  source: string;
  observed_at: string;
  confidence: number;
  ttl_days: number;
}

export interface RiskRow {
  id: string;
  severity: string;
  summary: string;
  status: string;
  source: string;
  observed_at: string;
  confidence: number;
  ttl_days: number;
}

export interface RelationRow {
  from: string;
  relation: string;
  to: string;
  confidence: number;
  observed_at: string;
}

export interface HostProfile {
  schema: string;
  entity: string;
  host: string;
  hostname?: string;
  last_seen: string;
  roles: string[];
  services: ServiceRow[];
  ports: PortRow[];
  facts: FactRow[];
  known_risks: RiskRow[];
  relations: RelationRow[];
}

export interface HostServiceView {
  name: string;
  status: string;
  port: string;
  last_seen: string;
}

export interface HostPortView {
  proto: string;
  port: string;
  process: string;
  state: string;
  last_seen: string;
}

export interface HostRiskView {
  id: string;
  severity: string;
  summary: string;
  last_seen: string;
}

export interface StaleFactView {
  key: string;
  value: string | number | boolean;
  observed_at: string;
  ttl_days: number;
  expired_since: string;
}

export interface HostContext {
  schema: string;
  entity: string;
  generated_at: string;
  summary: { health: string; role: string; reason: string };
  current_services: HostServiceView[];
  current_ports: HostPortView[];
  open_risks: HostRiskView[];
  stale_facts: StaleFactView[];
  recommended_next_tools: string[];
}

export interface Conflict {
  type: string;
  severity: string;
  description: string;
  entity: string;
  sources: string[];
}

/* ── Paths ──────────────────────────────────────────────────────── */

const ROOT = projectRoot();

const DIRS = {
  hosts: () => path.join(ROOT, "memoria", "entities", "hosts"),
  services: () => path.join(ROOT, "memoria", "entities", "services"),
  clusters: () => path.join(ROOT, "memoria", "entities", "clusters"),
  observations: () => path.join(ROOT, "memoria", "events", "observations"),
  incidents: () => path.join(ROOT, "memoria", "events", "incidents"),
  changes: () => path.join(ROOT, "memoria", "events", "changes"),
  views: () => path.join(ROOT, "memoria", "views", "host-context"),
  schemas: () => path.join(ROOT, "memoria", "schemas"),
};

/* ── Helpers ────────────────────────────────────────────────────── */

const SECRET_RE = /(?:password|passwd|secret|token|private_key|api_key|auth)\s*[:=]\s*['"]?\S+['"]?/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export function redactSecrets(input: string): string {
  return input.replace(SECRET_RE, (m) => {
    const sep = m.includes(":") ? ":" : "=";
    const key = m.split(sep)[0];
    return `${key}${sep} [REDACTED]`;
  }).replace(IP_RE, (ip) => {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.x.x`;
  });
}

export function sanitizeEntityId(input: string): string {
  if (!input || typeof input !== "string") return "unknown";
  let safe = input.trim().toLowerCase();
  safe = safe.replace(/[^a-z0-9@._-]/g, "_");
  safe = safe.replace(/\.\./g, "_");
  safe = safe.replace(/^[._-]+/, "");
  safe = safe.slice(0, 128);
  return safe || "unknown";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function obsWeekKey(date?: Date): string {
  const d = date || new Date();
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  // ISO week: Thursday-based. Find the Thursday of the same week.
  const day = target.getDay() || 7; // Mon=1 .. Sun=7
  target.setDate(target.getDate() + 4 - day); // Thursday of the same ISO week
  const year = target.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((target.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}



/* ── TOON File I/O ─────────────────────────────────────────────── */

export async function readToonFile<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  const raw = await readFile(filePath, "utf-8");
  if (!raw.trim()) return fallback;
  try {
    const decoded = toonDecode(raw);
    return decoded as T;
  } catch (err: any) {
    throw new Error(
      `Corrupt TOON file: ${filePath} — ${err?.message || err}. Fix or delete manually.`,
    );
  }
}

export async function writeToonFile(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const toon = toonEncode(data);
  const tmp = filePath + ".tmp";
  await writeFile(tmp, toon, "utf-8");
  try {
    renameSync(tmp, filePath);
  } catch {
    await rename(tmp, filePath);
  }
}

/* ── Layout ─────────────────────────────────────────────────────── */

export async function ensureMemoryLayout(): Promise<void> {
  for (const d of Object.values(DIRS)) {
    const dir = d();
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  }
}

const MAX_EVIDENCE_LENGTH = 5_000;

/* ── Observations ───────────────────────────────────────────────── */

export async function appendObservations(observations: Observation[]): Promise<void> {
  if (observations.length === 0) return;

  const cleaned: Observation[] = observations.map((o) => ({
    ...o,
    evidence: o.evidence
      ? redactSecrets(o.evidence).slice(0, MAX_EVIDENCE_LENGTH)
      : undefined,
  }));

  const week = obsWeekKey();
  const filePath = path.join(DIRS.observations(), `${week}.toon`);

  let existing: { observations: Observation[] } = { observations: [] };
  try {
    existing = await readToonFile<{ observations: Observation[] }>(filePath, { observations: [] });
  } catch {
    // if corrupt, start fresh
  }

  const seen = new Set(existing.observations.map((o) => o.id));
  for (const o of cleaned) {
    if (!seen.has(o.id)) {
      existing.observations.push(o);
      seen.add(o.id);
    }
  }

  await writeToonFile(filePath, existing);
}

/* ── Host entity helpers (inside the upsert / merge logic) ──────── */

function newerOrBetter(incDate: string, curDate: string, incConf: number, curConf: number): boolean {
  const inc = new Date(incDate).getTime();
  const cur = new Date(curDate).getTime();
  return inc > cur || (inc === cur && incConf > curConf);
}

function mergeServices(
  existing: ServiceRow[],
  incoming: ServiceRow[],
): ServiceRow[] {
  const map = new Map<string, ServiceRow>();
  for (const s of existing) map.set(s.name, s);
  for (const s of incoming) {
    const key = s.name;
    const cur = map.get(key);
    if (!cur || newerOrBetter(s.observed_at, cur.observed_at, s.confidence, cur.confidence)) {
      map.set(key, s);
    }
  }
  return [...map.values()];
}

function mergePorts(existing: PortRow[], incoming: PortRow[]): PortRow[] {
  const map = new Map<string, PortRow>();
  for (const p of existing) map.set(`${p.proto}:${p.port}`, p);
  for (const p of incoming) {
    const key = `${p.proto}:${p.port}`;
    const cur = map.get(key);
    if (!cur || newerOrBetter(p.observed_at, cur.observed_at, p.confidence, cur.confidence)) {
      map.set(key, p);
    }
  }
  return [...map.values()];
}

function mergeFacts(existing: FactRow[], incoming: FactRow[]): FactRow[] {
  const map = new Map<string, FactRow>();
  for (const f of existing) map.set(f.key, f);
  for (const f of incoming) {
    const cur = map.get(f.key);
    if (!cur || newerOrBetter(f.observed_at, cur.observed_at, f.confidence, cur.confidence)) {
      map.set(f.key, f);
    }
  }
  return [...map.values()];
}

function mergeRisks(existing: RiskRow[], incoming: RiskRow[]): RiskRow[] {
  const map = new Map<string, RiskRow>();
  for (const r of existing) map.set(r.id, r);
  for (const r of incoming) {
    const cur = map.get(r.id);
    if (!cur || newerOrBetter(r.observed_at, cur.observed_at, r.confidence, cur.confidence)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function mergeRelations(
  existing: RelationRow[],
  incoming: RelationRow[],
): RelationRow[] {
  const map = new Map<string, RelationRow>();
  for (const r of existing) map.set(`${r.from}|${r.relation}|${r.to}`, r);
  for (const r of incoming) {
    const key = `${r.from}|${r.relation}|${r.to}`;
    const cur = map.get(key);
    if (!cur || newerOrBetter(r.observed_at, cur.observed_at, r.confidence, cur.confidence)) {
      map.set(key, r);
    }
  }
  return [...map.values()];
}

function obsToService(o: Observation): ServiceRow | null {
  if (!o.key.startsWith("service.")) return null;
  return {
    name: o.key.replace("service.", ""),
    status: String(o.value),
    enabled: "unknown",
    port: "",
    source: o.source,
    observed_at: o.observed_at,
    confidence: o.confidence,
    ttl_days: o.ttl_days,
  };
}

function obsToPort(o: Observation): PortRow | null {
  if (!o.key.startsWith("port.")) return null;
  const parts = o.key.split(".");
  const proto = parts[1] || "tcp";
  const port = parts[2] || String(o.value);
  return {
    proto,
    port,
    process: "",
    bind: "",
    state: String(o.value),
    source: o.source,
    observed_at: o.observed_at,
    confidence: o.confidence,
    ttl_days: o.ttl_days,
  };
}

function obsToFact(o: Observation): FactRow {
  return {
    key: o.key,
    value: o.value,
    source: o.source,
    observed_at: o.observed_at,
    confidence: o.confidence,
    ttl_days: o.ttl_days,
  };
}

function obsToRisk(o: Observation): RiskRow | null {
  if (!o.key.startsWith("risk.")) return null;
  return {
    id: o.key.replace("risk.", ""),
    severity: "warning",
    summary: String(o.value),
    status: "open",
    source: o.source,
    observed_at: o.observed_at,
    confidence: o.confidence,
    ttl_days: o.ttl_days,
  };
}

/* ── Role derivation ────────────────────────────────────────────── */

const SERVICE_ROLE_MAP: Record<string, string> = {
  nginx: "reverse-proxy",
  apache2: "reverse-proxy",
  httpd: "reverse-proxy",
  caddy: "reverse-proxy",
  traefik: "reverse-proxy",
  haproxy: "reverse-proxy",
  docker: "container-host",
  containerd: "container-host",
  kubelet: "kubernetes-node",
  kubectl: "kubernetes-node",
  postgresql: "database-host",
  mysqld: "database-host",
  mariadb: "database-host",
  mongod: "database-host",
  redis: "cache-host",
  "redis-server": "cache-host",
  memcached: "cache-host",
  jenkins: "ci-cd",
  prometheus: "monitoring",
  node_exporter: "monitoring",
  grafana: "monitoring",
  influxdb: "monitoring",
  telegraf: "monitoring",
};

function deriveRoles(services: ServiceRow[], existingRoles: string[]): string[] {
  if (existingRoles.length > 0) return existingRoles;
  const derived = new Set<string>();
  for (const s of services) {
    const role = SERVICE_ROLE_MAP[s.name];
    if (role) derived.add(role);
  }
  if (derived.size === 0) return [];
  // If hosting apps + database, call it "app-host" instead of the individual roles
  const hasDb = derived.has("database-host") || derived.has("cache-host");
  const hasProxy = derived.has("reverse-proxy");
  const hasContainers = derived.has("container-host") || derived.has("kubernetes-node");
  if (hasProxy && hasContainers && hasDb) return ["app-host"];
  return [...derived].sort();
}

/* ── upsertHostProfile ───────────────────────────────────────────── */

export async function upsertHostProfile(
  host: string,
  observations: Observation[],
): Promise<HostProfile> {
  const safeHost = sanitizeEntityId(host);
  const filePath = path.join(DIRS.hosts(), `${safeHost}.toon`);

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

  try {
    profile = await readToonFile<HostProfile>(filePath, profile);
  } catch (err: any) {
    return `ERROR: ${err.message}` as any;
  }

  profile.last_seen = nowIso();

  const newServices: ServiceRow[] = [];
  const newPorts: PortRow[] = [];
  const newFacts: FactRow[] = [];
  const newRisks: RiskRow[] = [];

  for (const o of observations) {
    const svc = obsToService(o);
    if (svc) newServices.push(svc);
    const port = obsToPort(o);
    if (port) newPorts.push(port);
    newFacts.push(obsToFact(o));
    const risk = obsToRisk(o);
    if (risk) newRisks.push(risk);
  }

  profile.services = mergeServices(profile.services, newServices);
  profile.ports = mergePorts(profile.ports, newPorts);
  profile.facts = mergeFacts(profile.facts, newFacts);
  profile.known_risks = mergeRisks(profile.known_risks, newRisks);
  profile.roles = deriveRoles(profile.services, profile.roles);

  await writeToonFile(filePath, profile);
  return profile;
}

/* ── Health assessment ───────────────────────────────────────────── */

export function assessHealth(profile: HostProfile): {
  health: string;
  role: string;
  reason: string;
} {
  const openCritical = profile.known_risks.filter(
    (r) => r.status === "open" && r.severity === "critical",
  );
  const openWarnings = profile.known_risks.filter(
    (r) => r.status === "open" && r.severity === "warning",
  );

  const role = (profile.roles?.length || 0) > 0
    ? profile.roles.join(" + ")
    : "unknown";

  if (openCritical.length > 0) {
    return {
      health: "critical",
      role,
      reason: openCritical.map((r) => r.summary).join("; "),
    };
  }
  if (openWarnings.length > 0) {
    return {
      health: "warning",
      role,
      reason: openWarnings.map((r) => r.summary).join("; "),
    };
  }
  return { health: "ok", role, reason: "no open risks" };
}

/* ── Stale facts ─────────────────────────────────────────────────── */

export function detectStaleFacts(profile: HostProfile): StaleFactView[] {
  const now = new Date();
  return profile.facts.filter((f) => {
    const obs = new Date(f.observed_at);
    const ms = now.getTime() - obs.getTime();
    const days = ms / 86400000;
    return days > f.ttl_days;
  }).map((f) => ({
    key: f.key,
    value: f.value,
    observed_at: f.observed_at,
    ttl_days: f.ttl_days,
    expired_since: nowIso(),
  }));
}

/* ── Conflicts ───────────────────────────────────────────────────── */

export function detectConflicts(profile: HostProfile): Conflict[] {
  const conflicts: Conflict[] = [];

  const svcPortMap = new Map<string, ServiceRow>();
  for (const s of profile.services) {
    if (s.port) svcPortMap.set(s.port, s);
  }

  for (const p of profile.ports) {
    const svc = svcPortMap.get(p.port);
    if (svc && p.state !== "listening") {
      conflicts.push({
        type: "service_port_mismatch",
        severity: "warning",
        description: `service ${svc.name} is "${svc.status}" on port ${p.port} but port state is "${p.state}"`,
        entity: profile.entity,
        sources: [svc.source, p.source],
      });
    }
  }

  const resolvedIds = new Set(
    profile.known_risks
      .filter((r) => r.status === "resolved")
      .map((r) => r.id),
  );

  for (const r of profile.known_risks) {
    if (r.status === "open" || r.status === "mitigated") continue;
    for (const f of profile.facts) {
      if (f.key === `risk.resolved.${r.id}` && resolvedIds.has(r.id)) {
        conflicts.push({
          type: "risk_already_resolved",
          severity: "info",
          description: `risk "${r.id}" is still open but fact indicates resolution`,
          entity: profile.entity,
          sources: [r.source, f.source],
        });
      }
    }
  }

  return conflicts;
}

/* ── Context generation ──────────────────────────────────────────── */

export async function renderHostContext(host: string): Promise<void> {
  const safeHost = sanitizeEntityId(host);
  const profilePath = path.join(DIRS.hosts(), `${safeHost}.toon`);
  const viewPath = path.join(DIRS.views(), `${safeHost}.toon`);

  let profile: HostProfile;
  try {
    profile = await readToonFile<HostProfile>(profilePath, null!);
  } catch {
    return;
  }
  if (!profile) return;

  const health = assessHealth(profile);
  const stale = detectStaleFacts(profile);

  const ctx: HostContext = {
    schema: "sysadmin.host-context.v1",
    entity: `host:${host}`,
    generated_at: nowIso(),
    summary: health,
    current_services: profile.services.map((s) => ({
      name: s.name,
      status: s.status,
      port: s.port || "",
      last_seen: s.observed_at,
    })),
    current_ports: profile.ports.map((p) => ({
      proto: p.proto,
      port: p.port,
      process: p.process,
      state: p.state,
      last_seen: p.observed_at,
    })),
    open_risks: profile.known_risks
      .filter((r) => r.status === "open")
      .map((r) => ({
        id: r.id,
        severity: r.severity,
        summary: r.summary,
        last_seen: r.observed_at,
      })),
    stale_facts: stale,
    recommended_next_tools: recommendTools(health.health, stale, profile),
  };

  await writeToonFile(viewPath, ctx);
}

function recommendTools(
  health: string,
  stale: StaleFactView[],
  profile: HostProfile,
): string[] {
  const tools: string[] = [];
    if (health === "critical" || health === "warning") {
    tools.push("debug");
  }
  if (stale.length > 0) tools.push("recon");
  if (profile.services.length > 0) tools.push("proxy-debug", "docker-debug");
  if (tools.length === 0) tools.push("debug");
  return [...new Set(tools)];
}

/* ── getHostContext ──────────────────────────────────────────────── */

export async function getHostTextContext(host: string): Promise<string> {
  const safeHost = sanitizeEntityId(host);
  const viewPath = path.join(DIRS.views(), `${safeHost}.toon`);
  const hostPath = path.join(DIRS.hosts(), `${safeHost}.toon`);

  let content = "";

  if (existsSync(viewPath)) {
    content = await readFile(viewPath, "utf-8");
  } else if (existsSync(hostPath)) {
    await renderHostContext(host);
    if (existsSync(viewPath)) {
      content = await readFile(viewPath, "utf-8");
    }
  }

  if (!content) {
    return (
      `# Auto-generated minimal context\n` +
      `schema: sysadmin.host-context.v1\n` +
      `entity: host:${host}\n` +
      `generated_at: ${nowIso()}\n` +
      `\n` +
      `summary:\n` +
      `  health: unknown\n` +
      `  role: unknown\n` +
      `  reason: no memory for this host\n`
    );
  }

  // Append stale fact warning if any exist
  try {
    if (existsSync(hostPath)) {
      const profile = await readToonFile<HostProfile>(hostPath, null!);
      if (profile) {
        const stale = detectStaleFacts(profile);
        if (stale.length > 0) {
          content += `\n# ⚠ Stale facts detected: ${stale.length}\n`;
          for (const f of stale.slice(0, 5)) {
            content += `#   ${f.key} = ${f.value} (TTL ${f.ttl_days}d, expired ${f.expired_since})\n`;
          }
          if (stale.length > 5) {
            content += `#   ... and ${stale.length - 5} more. Run memory-stale host=${host} to see all.\n`;
          }
          content += `# Run recon or the relevant tool to refresh these facts.\n`;
        }
      }
    }
  } catch {
    // stale check is a best-effort enhancement
  }

  return content;
}

/* ── Validation ──────────────────────────────────────────────────── */

const REQUIRED_OBS_FIELDS = ["id", "key", "value", "source", "observed_at", "confidence", "ttl_days"];

export function validateObservations(obs: any[], host: string): string | null {
  if (!Array.isArray(obs) || obs.length === 0) {
    return "ERROR: 'observations' must be a non-empty array";
  }

  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const missing = REQUIRED_OBS_FIELDS.filter((f) => o[f] === undefined || o[f] === null);
    if (missing.length > 0) {
      return `ERROR: observation #${i} (id='${o.id || "?"}') missing required fields: ${missing.join(", ")}`;
    }
    if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
      return `ERROR: observation #${i} confidence must be a number between 0 and 1, got ${o.confidence}`;
    }
    if (typeof o.ttl_days !== "number" || o.ttl_days < 0) {
      return `ERROR: observation #${i} ttl_days must be a non-negative number, got ${o.ttl_days}`;
    }
  }

  for (const o of obs) {
    if (!o.entity) o.entity = `host:${host}`;
  }

  return null;
}

/* ── Formatters ─────────────────────────────────────────────────── */

export async function staleHostFacts(host: string): Promise<string> {
  const safeHost = sanitizeEntityId(host);
  const profilePath = path.join(DIRS.hosts(), `${safeHost}.toon`);
  if (!existsSync(profilePath)) {
    return `No profile found for ${host}. Run write-observation first.`;
  }
  const profile = await readToonFile<HostProfile>(profilePath, null!);
  if (!profile) return `Cannot read profile for ${host}.`;
  const stale = detectStaleFacts(profile);
  if (stale.length === 0) return `No stale facts for ${host}.`;
  const lines = stale.map(
    (f) => `  ${f.key} = ${f.value} (observed ${f.observed_at}, TTL ${f.ttl_days}d, expired)`,
  );
  return `Stale facts for ${host} (${stale.length}):\n${lines.join("\n")}`;
}

export async function conflictsHost(host: string): Promise<string> {
  const safeHost = sanitizeEntityId(host);
  const profilePath = path.join(DIRS.hosts(), `${safeHost}.toon`);
  if (!existsSync(profilePath)) {
    return `No profile found for ${host}. Run write-observation first.`;
  }
  const profile = await readToonFile<HostProfile>(profilePath, null!);
  if (!profile) return `Cannot read profile for ${host}.`;
  const conflicts = detectConflicts(profile);
  if (conflicts.length === 0) return `No conflicts detected for ${host}.`;
  const lines = conflicts.map(
    (c) => `  [${c.severity}] ${c.description} (sources: ${c.sources.join(", ")})`,
  );
  return `Conflicts for ${host} (${conflicts.length}):\n${lines.join("\n")}`;
}

/* ── Redundancy detection ────────────────────────────────────────── */

export function hasRedundantObservations(profile: HostProfile, observations: Observation[]): boolean {
  if (observations.length === 0) return false;
  let redundant = 0;
  for (const o of observations) {
    const existing = profile.facts.find((f) => f.key === o.key && f.value === o.value);
    if (existing) redundant++;
  }
  return redundant > observations.length / 2;
}

/* ── Exports for external integration ────────────────────────────── */

export const memoryPaths = DIRS;

export async function compactHostFromObservations(host: string): Promise<string> {
  const safeHost = sanitizeEntityId(host);
  const week = obsWeekKey();
  const obsPath = path.join(DIRS.observations(), `${week}.toon`);

  const obsFile = await readToonFile<{ observations: Observation[] }>(obsPath, { observations: [] });
  const hostObs = obsFile.observations.filter(
    (o) => o.entity === host || o.entity === `host:${host}`,
  );

  if (hostObs.length === 0) return `No observations found for ${host} this week.`;

  const profile = await upsertHostProfile(host, hostObs);
  const health = assessHealth(profile);
  const stale = detectStaleFacts(profile);
  const conflicts = detectConflicts(profile);

  let output = `Compact host ${host}: ${profile.services.length} services, ${profile.ports.length} ports, ${profile.facts.length} facts, ${profile.known_risks.length} risks\n`;
  output += `Health: ${health.health} | ${health.reason}\n`;
  if (stale.length > 0) output += `Stale facts: ${stale.length}\n`;
  if (conflicts.length > 0) output += `Conflicts: ${conflicts.length}\n`;
  return output;
}
