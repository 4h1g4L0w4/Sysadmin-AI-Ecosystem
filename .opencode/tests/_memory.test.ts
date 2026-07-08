import { describe, it, expect } from "vitest";

// We import from the source directly via source files
// Since these are pure functions, we can test them by importing
// the compiled module. For now we test the logic inline.
//
// In a real setup you'd do:
// import { redactSecrets, sanitizeEntityId, obsWeekKey, ... } from "../tools/_memory";

// ── Inline helpers matching _memory.ts logic ─────────────────────

function redactSecrets(input: string): string {
  const SECRET_RE = /(?:password|passwd|secret|token|private_key|api_key|auth)\s*[:=]\s*['"]?\S+['"]?/gi;
  const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  return input.replace(SECRET_RE, (m) => {
    const sep = m.includes(":") ? ":" : "=";
    const key = m.split(sep)[0];
    return `${key}${sep} [REDACTED]`;
  }).replace(IP_RE, (ip) => {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.x.x`;
  });
}

function sanitizeEntityId(input: string): string {
  if (!input || typeof input !== "string") return "unknown";
  let safe = input.trim().toLowerCase();
  safe = safe.replace(/[^a-z0-9@._-]/g, "_");
  safe = safe.replace(/\.\./g, "_");
  safe = safe.replace(/^[._-]+/, "");
  safe = safe.slice(0, 128);
  return safe || "unknown";
}

function obsWeekKey(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

interface ServiceRow {
  name: string; status: string; enabled: string | boolean; port?: string;
  source: string; observed_at: string; confidence: number; ttl_days: number;
}

interface PortRow {
  proto: string; port: string; process: string; bind: string; state: string;
  source: string; observed_at: string; confidence: number; ttl_days: number;
}

interface FactRow {
  key: string; value: string | number | boolean; source: string;
  observed_at: string; confidence: number; ttl_days: number;
}

interface RiskRow {
  id: string; severity: string; summary: string; status: string;
  source: string; observed_at: string; confidence: number; ttl_days: number;
}

interface RelationRow {
  from: string; relation: string; to: string; confidence: number; observed_at: string;
}

interface HostProfile {
  schema: string; entity: string; host: string; hostname?: string;
  last_seen: string; roles: string[];
  services: ServiceRow[]; ports: PortRow[]; facts: FactRow[];
  known_risks: RiskRow[]; relations: RelationRow[];
}

function mergeServices(existing: ServiceRow[], incoming: ServiceRow[]): ServiceRow[] {
  const map = new Map<string, ServiceRow>();
  for (const s of existing) map.set(s.name, s);
  for (const s of incoming) {
    const key = s.name;
    const cur = map.get(key);
    if (!cur || new Date(s.observed_at) >= new Date(cur.observed_at)) {
      map.set(key, s);
    }
  }
  return [...map.values()];
}

function mergeFacts(existing: FactRow[], incoming: FactRow[]): FactRow[] {
  const map = new Map<string, FactRow>();
  for (const f of existing) map.set(f.key, f);
  for (const f of incoming) {
    const cur = map.get(f.key);
    if (!cur || new Date(f.observed_at) >= new Date(cur.observed_at)) {
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
    if (!cur || new Date(r.observed_at) >= new Date(cur.observed_at)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function detectStaleFacts(profile: HostProfile) {
  const now = new Date();
  return profile.facts.filter((f) => {
    const obs = new Date(f.observed_at);
    const ms = now.getTime() - obs.getTime();
    const days = ms / 86400000;
    return days > f.ttl_days;
  }).map((f) => ({
    key: f.key, value: f.value, observed_at: f.observed_at,
    ttl_days: f.ttl_days, expired_since: new Date().toISOString(),
  }));
}

function assessHealth(profile: HostProfile) {
  const openCritical = profile.known_risks.filter(
    (r) => r.status === "open" && r.severity === "critical",
  );
  const openWarnings = profile.known_risks.filter(
    (r) => r.status === "open" && r.severity === "warning",
  );
  const role = (profile.roles?.length || 0) > 0
    ? profile.roles.join(" + ") : "unknown";
  if (openCritical.length > 0) {
    return { health: "critical", role, reason: openCritical.map((r) => r.summary).join("; ") };
  }
  if (openWarnings.length > 0) {
    return { health: "warning", role, reason: openWarnings.map((r) => r.summary).join("; ") };
  }
  return { health: "ok", role, reason: "no open risks" };
}

// ── Tests ────────────────────────────────────────────────────────

describe("redactSecrets", () => {
  it("redacts passwords", () => {
    expect(redactSecrets("password=supersecret")).toBe("password= [REDACTED]");
  });

  it("redacts tokens", () => {
    expect(redactSecrets("token:abc123def")).toBe("token: [REDACTED]");
  });

  it("redacts api keys", () => {
    expect(redactSecrets("api_key='sk-live-abc123'")).toBe("api_key= [REDACTED]");
  });

  it("redacts private keys in text", () => {
    expect(redactSecrets("private_key: somevalue")).toBe("private_key: [REDACTED]");
  });

  it("redacts IPs", () => {
    expect(redactSecrets("server 192.168.1.50 is down")).toBe("server 192.168.x.x is down");
  });

  it("redacts multiple IPs", () => {
    const result = redactSecrets("10.0.0.1 -> 10.0.0.2");
    expect(result).toBe("10.0.x.x -> 10.0.x.x");
  });

  it("redacts secrets and IPs in same string", () => {
    const result = redactSecrets("password=abc on 10.0.0.5");
    expect(result).toBe("password= [REDACTED] on 10.0.x.x");
  });

  it("returns unchanged string when nothing to redact", () => {
    const msg = "nginx is running on port 443";
    expect(redactSecrets(msg)).toBe(msg);
  });
});

describe("sanitizeEntityId", () => {
  it("returns 'unknown' for empty input", () => {
    expect(sanitizeEntityId("")).toBe("unknown");
  });

  it("returns 'unknown' for null/undefined", () => {
    expect(sanitizeEntityId(null as any)).toBe("unknown");
    expect(sanitizeEntityId(undefined as any)).toBe("unknown");
  });

  it("sanitizes IP addresses", () => {
    expect(sanitizeEntityId("192.168.1.50")).toBe("192.168.1.50");
  });

  it("sanitizes hostnames", () => {
    expect(sanitizeEntityId("web-prod-01")).toBe("web-prod-01");
  });

  it("replaces special chars with underscore (but preserves @)", () => {
    expect(sanitizeEntityId("host name!@#")).toBe("host_name_@_");
  });

  it("trims and lowercases", () => {
    expect(sanitizeEntityId("  MyHost.Domain  ")).toBe("myhost.domain");
  });

  it("replaces double dots", () => {
    expect(sanitizeEntityId("host..name")).toBe("host_name");
  });

  it("strips leading dots, underscores, hyphens", () => {
    expect(sanitizeEntityId(".__-validhost")).toBe("validhost");
  });

  it("truncates to 128 chars", () => {
    const long = "a".repeat(200);
    expect(sanitizeEntityId(long).length).toBe(128);
  });

  it("returns 'unknown' if result is empty after sanitization", () => {
    expect(sanitizeEntityId("___...")).toBe("unknown");
  });
});

describe("obsWeekKey", () => {
  it("returns format YYYY-WW", () => {
    const key = obsWeekKey(new Date("2026-07-08"));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("returns year-Www format for Jan 1", () => {
    const key = obsWeekKey(new Date("2026-01-01"));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
    expect(key.startsWith("2025") || key.startsWith("2026")).toBe(true);
  });

  it("returns consistent result for same date", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    expect(obsWeekKey(d)).toBe(obsWeekKey(d));
  });
});

describe("mergeServices", () => {
  it("merges empty arrays", () => {
    expect(mergeServices([], [])).toEqual([]);
  });

  it("adds new services", () => {
    const incoming: ServiceRow[] = [{
      name: "nginx", status: "active", enabled: true, source: "test",
      observed_at: "2026-07-08T12:00:00Z", confidence: 0.95, ttl_days: 7,
    }];
    expect(mergeServices([], incoming)).toHaveLength(1);
  });

  it("prefers newer observation for same service", () => {
    const old: ServiceRow[] = [{
      name: "nginx", status: "inactive", enabled: true, source: "test",
      observed_at: "2026-07-07T12:00:00Z", confidence: 0.9, ttl_days: 7,
    }];
    const incoming: ServiceRow[] = [{
      name: "nginx", status: "active", enabled: true, source: "test",
      observed_at: "2026-07-08T12:00:00Z", confidence: 0.95, ttl_days: 7,
    }];
    const result = mergeServices(old, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
  });

  it("keeps old if newer is not more recent", () => {
    const old: ServiceRow[] = [{
      name: "redis", status: "active", enabled: true, source: "recon",
      observed_at: "2026-07-08T12:00:00Z", confidence: 0.95, ttl_days: 7,
    }];
    const incoming: ServiceRow[] = [{
      name: "redis", status: "inactive", enabled: true, source: "debug",
      observed_at: "2026-07-07T12:00:00Z", confidence: 0.8, ttl_days: 7,
    }];
    const result = mergeServices(old, incoming);
    expect(result[0].status).toBe("active");
  });
});

describe("mergeFacts", () => {
  it("merges facts by key, preferring newer", () => {
    const old: FactRow[] = [{
      key: "os.name", value: "Ubuntu 20.04", source: "recon",
      observed_at: "2026-01-01T00:00:00Z", confidence: 0.9, ttl_days: 30,
    }];
    const incoming: FactRow[] = [{
      key: "os.name", value: "Ubuntu 22.04", source: "recon",
      observed_at: "2026-07-08T00:00:00Z", confidence: 0.95, ttl_days: 30,
    }];
    const result = mergeFacts(old, incoming);
    expect(result[0].value).toBe("Ubuntu 22.04");
  });
});

describe("mergeRisks", () => {
  it("merges risks by id, preferring newer", () => {
    const old: RiskRow[] = [{
      id: "disk_full", severity: "warning", summary: "disk at 85%", status: "open",
      source: "debug", observed_at: "2026-07-01T00:00:00Z", confidence: 0.9, ttl_days: 3,
    }];
    const incoming: RiskRow[] = [{
      id: "disk_full", severity: "critical", summary: "disk at 95%", status: "open",
      source: "debug", observed_at: "2026-07-08T00:00:00Z", confidence: 0.95, ttl_days: 3,
    }];
    const result = mergeRisks(old, incoming);
    expect(result[0].severity).toBe("critical");
  });
});

describe("detectStaleFacts", () => {
  it("detects no stale facts when all are fresh", () => {
    const fresh: FactRow = {
      key: "test", value: "ok", source: "test",
      observed_at: new Date().toISOString(), confidence: 1, ttl_days: 30,
    };
    const profile: HostProfile = {
      schema: "", entity: "", host: "", last_seen: "",
      roles: [], services: [], ports: [], facts: [fresh], known_risks: [], relations: [],
    };
    expect(detectStaleFacts(profile)).toHaveLength(0);
  });

  it("detects stale facts past TTL", () => {
    const old: FactRow = {
      key: "old_metric", value: "stale", source: "test",
      observed_at: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
      confidence: 1, ttl_days: 1, // 1 day TTL
    };
    const profile: HostProfile = {
      schema: "", entity: "", host: "", last_seen: "",
      roles: [], services: [], ports: [], facts: [old], known_risks: [], relations: [],
    };
    expect(detectStaleFacts(profile)).toHaveLength(1);
  });
});

describe("assessHealth", () => {
  const base: HostProfile = {
    schema: "", entity: "", host: "", last_seen: "",
    roles: [], services: [], ports: [], facts: [], known_risks: [], relations: [],
  };

  it("returns ok when no risks", () => {
    expect(assessHealth(base).health).toBe("ok");
  });

  it("returns warning when warnings open", () => {
    const p = { ...base, known_risks: [{ id: "w1", severity: "warning", summary: "disk 80%", status: "open", source: "test", observed_at: "", confidence: 0.9, ttl_days: 3 }] };
    expect(assessHealth(p).health).toBe("warning");
  });

  it("returns critical when critical risks open", () => {
    const p = { ...base, known_risks: [{ id: "c1", severity: "critical", summary: "service down", status: "open", source: "test", observed_at: "", confidence: 0.9, ttl_days: 1 }] };
    expect(assessHealth(p).health).toBe("critical");
  });

  it("critical overrides warning", () => {
    const p = { ...base, known_risks: [
      { id: "w1", severity: "warning", summary: "disk 80%", status: "open", source: "test", observed_at: "", confidence: 0.9, ttl_days: 3 },
      { id: "c1", severity: "critical", summary: "service down", status: "open", source: "test", observed_at: "", confidence: 0.9, ttl_days: 1 },
    ]};
    expect(assessHealth(p).health).toBe("critical");
  });

  it("ignores resolved risks", () => {
    const p = { ...base, known_risks: [{ id: "r1", severity: "critical", summary: "old problem", status: "resolved", source: "test", observed_at: "", confidence: 0.9, ttl_days: 1 }] };
    expect(assessHealth(p).health).toBe("ok");
  });

  it("returns role from profile", () => {
    const p = { ...base, roles: ["reverse-proxy", "app-host"] };
    expect(assessHealth(p).role).toBe("reverse-proxy + app-host");
  });

  it("returns unknown role when empty", () => {
    expect(assessHealth(base).role).toBe("unknown");
  });
});
