import { tool } from "@opencode-ai/plugin";
import path from "path";
import fs from "fs";

function loadEnv(baseDir?: string): Record<string, string> {
  const env: Record<string, string> = {};
  const candidates = [
    baseDir,
    process.env.OPENCODE_DIRECTORY,
    process.cwd(),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const p = path.join(dir, ".env");
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    break;
  }
  return env;
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  const h = Math.round(sec / 3600);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

function fmtTraffic(bps: number): string {
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1e6) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${(bps / 1e6).toFixed(1)} Mbps`;
}

async function apiFetch(
  host: string,
  port: number,
  endpoint: string,
  user: string,
  pass: string,
): Promise<any> {
  const url = `http://${host}:${port}${endpoint}?AuthUser=${user}&AuthPass=${pass}&ResponseFormat=JSON`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

function matchFilter(val: string | undefined, filter: string): boolean {
  if (!val) return false;
  return val.toLowerCase().includes(filter);
}

export default tool({
  description:
    "Consulta el estado de un servidor Digifort (NVR) por HTTP. Obtiene uso del servidor (CPU/memoria/tráfico/conexiones), listado de cámaras y estado de grabación. Soporta filtro por nombre, IP o descripción para ahorrar tokens en respuestas largas. Lee credenciales de .env (DIGIFORT_USER, DIGIFORT_PASS).",
  args: {
    host: tool.schema
      .string()
      .describe("IP del servidor Digifort (ej: 10.10.10.10)"),
    port: tool.schema
      .number()
      .optional()
      .describe("Puerto HTTP (default: 8601)"),
    username: tool.schema
      .string()
      .optional()
      .describe("Usuario Digifort (default: DIGIFORT_USER del .env)"),
    password: tool.schema
      .string()
      .optional()
      .describe("Password Digifort (default: DIGIFORT_PASS del .env)"),
    action: tool.schema
      .string()
      .optional()
      .describe("'usage' / 'cameras' / 'cameras-status' / 'all' (default)"),
    filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filtro por nombre, IP o descripción de cámara. Si se omite, solo muestra cantidad + 5.",
      ),
  },
  async execute(args, context) {
    const env = loadEnv(context.directory || context.worktree);
    const user = args.username || env["DIGIFORT_USER"] || "";
    const pass = args.password || env["DIGIFORT_PASS"] || "";
    const port = args.port || 8601;
    const action = args.action || "all";
    const filter = args.filter
      ? args.filter.trim().toLowerCase()
      : undefined;

    if (!user) return "ERROR: no se especificó username y no hay DIGIFORT_USER en .env";
    if (!pass) return "ERROR: no se especificó password y no hay DIGIFORT_PASS en .env";

    const out: string[] = [
      `====== DIGIFORT ${args.host}:${port} ======`,
    ];

    try {
      if (action === "usage" || action === "all") {
        const json = await apiFetch(args.host, port, "/Interface/Server/GetUsage", user, pass);
        const d = json?.Response?.Data?.Stats;
        if (d) {
          out.push(
            `--- Servidor ---`,
            `CPU:        ${d.Processor}%`,
            `Mem Total:  ${fmtBytes(d.GlobalMemory)}`,
            `Mem Server: ${fmtBytes(d.ServerMemory)}`,
            `Conexiones: ${d.Connections}`,
            `Clientes:   ${d.Clients}`,
            `Tráfico In: ${fmtTraffic(d.InputTraffic * 8)}`,
            `Tráfico Out:${fmtTraffic(d.OutputTraffic * 8)}`,
          );
        } else {
          out.push(`ERROR: respuesta inesperada en GetUsage`);
        }
      }

      if (action === "cameras" || action === "all") {
        const json = await apiFetch(args.host, port, "/Interface/Cameras/GetCameras", user, pass);
        const raw: any[] = json?.Response?.Data?.Cameras || json?.Response?.Data || [];
        if (!Array.isArray(raw)) {
          if (raw.length === undefined) {
            out.push(`--- Cámaras: sin datos ---`);
          }
        } else {
          const filtered = filter
            ? raw.filter(
                (c) =>
                  matchFilter(c.Name, filter) ||
                  matchFilter(c.Description, filter) ||
                  matchFilter(c.ConnectionAddress, filter),
              )
            : raw;

          out.push(`--- Cámaras (${filtered.length}${filter ? ` de ${raw.length}` : ""}) ---`);

          if (filtered.length === 0) {
            out.push(`  (ninguna coincide con "${filter}")`);
          } else {
            const show = filter ? filtered : filtered.slice(0, 5);
            for (const c of show) {
              const ip = c.ConnectionAddress || "?";
              const status = c.Active ? "activa" : "inactiva";
              out.push(`  ${c.Name || "?"}  (${ip}:${c.ConnectionPort || "?"})  [${status}]`);
            }
            if (!filter && filtered.length > 5) {
              out.push(`  ... y ${filtered.length - 5} más. Usá filter=nombre para ver una.`);
            }
          }
        }
      }

      if (action === "cameras-status" || action === "all") {
        const json = await apiFetch(args.host, port, "/Interface/Cameras/GetStatus", user, pass);
        const raw: any[] = json?.Response?.Data?.Cameras || json?.Response?.Data || [];
        if (!Array.isArray(raw)) {
          if (raw.length === undefined) {
            out.push(`--- Estado cámaras: sin datos ---`);
          }
        } else {
          const filtered = filter
            ? raw.filter((c) => matchFilter(c.Name, filter))
            : raw;

          out.push(`--- Estado cámaras (${filtered.length}${filter ? ` de ${raw.length}` : ""}) ---`);

          if (filtered.length === 0) {
            out.push(`  (ninguna coincide con "${filter}")`);
          } else {
            const show = filter ? filtered : filtered.slice(0, 5);
            for (const c of show) {
              const status = c.Working ? "ok" : "falla";
              const activo = c.Active ? `activo ${fmtTime(c.ActiveTime || 0)}` : "inactivo";
              const disco = c.UsedDiskSpace ? `disco ${fmtBytes(c.UsedDiskSpace)}` : "";
              const grab = c.RecordingHours ? `grab ${c.RecordingHours}h` : "";
              out.push(`  ${c.Name || "?"}  [${status}]  ${activo}${grab ? ` | ${grab}` : ""}${disco ? ` | ${disco}` : ""}`);
            }
            if (!filter && filtered.length > 5) {
              out.push(`  ... y ${filtered.length - 5} más. Usá filter=nombre para ver una.`);
            }
          }
        }
      }

      out.push(`====== FIN ======`);
      return out.join("\n");
    } catch (e: any) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        return `ERROR: timeout conectando a ${args.host}:${port} (60s)`;
      }
      if (e.message?.includes("ECONNREFUSED")) {
        return `ERROR: conexión rechazada a ${args.host}:${port}`;
      }
      if (e.message?.includes("fetch failed")) {
        return `ERROR: no se pudo conectar a ${args.host}:${port}. Verificá que Digifort esté corriendo.`;
      }
      return `ERROR: ${e.message || e}`;
    }
  },
});
