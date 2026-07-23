import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

interface ProxyPaths {
  configDirs: string[];
  configFiles: string[];
  errorLogs: string[];
  accessLogs: string[];
  unitName: string;
}

const DEFAULT_PATHS: Record<string, ProxyPaths> = {
  nginx: {
    configDirs: ["/etc/nginx/sites-enabled", "/etc/nginx/conf.d"],
    configFiles: ["/etc/nginx/nginx.conf"],
    errorLogs: ["/var/log/nginx/error.log", "/var/log/nginx/error.log.1", "/usr/local/nginx/logs/error.log"],
    accessLogs: ["/var/log/nginx/access.log", "/var/log/nginx/access.log.1"],
    unitName: "nginx",
  },
  apache: {
    configDirs: ["/etc/apache2/sites-enabled", "/etc/httpd/conf.d", "/etc/apache2/conf-enabled"],
    configFiles: [],
    errorLogs: ["/var/log/apache2/error.log", "/var/log/httpd/error_log", "/var/log/apache2/error.log.1"],
    accessLogs: ["/var/log/apache2/access.log", "/var/log/httpd/access_log", "/var/log/apache2/access.log.1"],
    unitName: "apache2",
  },
  caddy: {
    configDirs: [],
    configFiles: ["/etc/caddy/Caddyfile", "~/Caddyfile"],
    errorLogs: [],
    accessLogs: [],
    unitName: "caddy",
  },
  traefik: {
    configDirs: [],
    configFiles: ["/etc/traefik/traefik.yml", "/etc/traefik/traefik.toml", "/etc/traefik/traefik.yaml"],
    errorLogs: [],
    accessLogs: [],
    unitName: "traefik",
  },
  haproxy: {
    configDirs: [],
    configFiles: ["/etc/haproxy/haproxy.cfg"],
    errorLogs: ["/var/log/haproxy.log", "/var/log/haproxy/access.log"],
    accessLogs: [],
    unitName: "haproxy",
  },
};

function buildVersionCmd(proxy: string): string {
  const cmds: Record<string, string> = {
    nginx: `echo "==NGINX_VERSION=="\nnginx -V 2>&1 || true`,
    apache: `echo "==APACHE_VERSION=="\napache2ctl -V 2>/dev/null || httpd -V 2>/dev/null || true`,
    caddy: `echo "==CADDY_VERSION=="\ncaddy version 2>/dev/null || true`,
    traefik: `echo "==TRAEFIK_VERSION=="\ntraefik version 2>/dev/null || true`,
    haproxy: `echo "==HAPROXY_VERSION=="\nhaproxy -v 2>/dev/null || true`,
  };
  return cmds[proxy] || "";
}

function buildConfigTestCmd(proxy: string, paths: ProxyPaths): string {
  switch (proxy) {
    case "nginx":
      return `echo "==NGINX_CONFIGTEST=="\nnginx -t 2>&1 || true`;
    case "apache":
      return `echo "==APACHE_CONFIGTEST=="\napache2ctl -t 2>/dev/null || httpd -t 2>/dev/null || true`;
    case "haproxy":
      return `echo "==HAPROXY_CONFIGTEST=="\nhaproxy -c -f ${paths.configFiles[0] || "/etc/haproxy/haproxy.cfg"} 2>/dev/null || true`;
    default:
      return "";
  }
}

function buildVhostsCmd(proxy: string): string {
  if (proxy === "apache") {
    return `echo "==APACHE_VHOSTS=="\napache2ctl -S 2>/dev/null || httpd -S 2>/dev/null || true`;
  }
  return "";
}

function buildConfigCmd(proxy: string, paths: ProxyPaths): string {
  const prefix = proxy === "nginx" ? "NGINX" : proxy === "apache" ? "APACHE" : proxy.toUpperCase();
  const grepPatterns: Record<string, string> = {
    nginx: `'listen\\|server_name\\|proxy_pass\\|upstream\\|return\\|location'`,
    apache: `'VirtualHost\\|DocumentRoot\\|ProxyPass\\|ProxyPassReverse\\|ServerName\\|Listen\\|<Location'`,
    caddy: `'reverse_proxy\\|handle_path\\|respond\\|redir\\|route\\|tls'`,
    traefik: "",
    haproxy: `'frontend\\|backend\\|listen\\|server\\|bind\\|default_backend\\|use_backend'`,
  };
  const grepPat = grepPatterns[proxy] || "";
  const lines: string[] = [`echo "==${prefix}_CONFIG=="`];

  for (const d of paths.configDirs) {
    if (grepPat) {
      lines.push(`[ -d "${d}" ] && grep -rnh ${grepPat} "${d}" 2>/dev/null | head -60`);
    } else {
      lines.push(`[ -d "${d}" ] && ls "${d}" 2>/dev/null | head -20`);
    }
  }
  for (const f of paths.configFiles) {
    if (grepPat) {
      lines.push(`[ -f "${f}" ] && grep -n ${grepPat} "${f}" 2>/dev/null | head -60`);
    } else {
      lines.push(`[ -f "${f}" ] && head -80 "${f}" 2>/dev/null`);
    }
  }

  return lines.join("\n");
}

function buildValidateCmd(proxy: string, paths: ProxyPaths): string {
  if (proxy === "caddy") {
    const lines: string[] = [`echo "==CADDY_VALIDATE=="`];
    for (const f of paths.configFiles) {
      lines.push(`[ -f "${f}" ] && caddy validate --config "${f}" 2>&1 && break`);
    }
    return lines.join("\n");
  }
  return "";
}

function buildErrorLogCmd(proxy: string, paths: ProxyPaths): string {
  if (proxy === "caddy" || proxy === "traefik") {
    return `echo "==${proxy.toUpperCase()}_LOGS=="\njournalctl -u ${paths.unitName} -n 50 --no-pager 2>/dev/null || true`;
  }

  const prefix = proxy === "nginx" ? "NGINX" : proxy.toUpperCase();
  const lines: string[] = [`echo "==${prefix}_ERRORLOG=="`];

  if (proxy === "nginx") {
    for (const f of paths.errorLogs) {
      lines.push(`[ -f "${f}" ] && tail -50 "${f}" && break`);
    }
    lines.push(`journalctl -u nginx -n 50 --no-pager 2>/dev/null | tail -50 || true`);
  } else if (proxy === "apache") {
    for (const f of paths.errorLogs) {
      lines.push(`[ -f "${f}" ] && tail -50 "${f}" && break`);
    }
  } else if (proxy === "haproxy") {
    for (const f of paths.errorLogs) {
      lines.push(`[ -f "${f}" ] && tail -50 "${f}" && break`);
    }
    lines.push(`journalctl -u haproxy -n 50 --no-pager 2>/dev/null | tail -50 || true`);
  }

  return lines.join("\n");
}

function buildAccessLogCmd(proxy: string, paths: ProxyPaths): string {
  if (proxy === "caddy" || proxy === "traefik" || proxy === "haproxy") return "";

  const prefix = proxy === "nginx" ? "NGINX" : "APACHE";
  const lines: string[] = [`echo "==${prefix}_ACCESS=="`];
  for (const f of paths.accessLogs) {
    lines.push(`[ -f "${f}" ] && tail -200 "${f}" && break`);
  }
  return lines.join("\n");
}

function buildProxyScript(proxy: string, paths: ProxyPaths): string[] {
  return [
    buildVersionCmd(proxy),
    buildConfigTestCmd(proxy, paths),
    buildVhostsCmd(proxy),
    buildConfigCmd(proxy, paths),
    buildErrorLogCmd(proxy, paths),
    buildAccessLogCmd(proxy, paths),
    buildValidateCmd(proxy, paths),
  ].filter(Boolean);
}

function buildScript(forceProxy?: string, overrides?: Record<string, Partial<ProxyPaths>>): string {
  const lines: string[] = [];
  lines.push(`echo "==DETECTION=="`);

  if (forceProxy) {
    lines.push(`echo "FORCED=${forceProxy}"`);
    lines.push(`command -v ${forceProxy} >/dev/null 2>&1 || echo "NOT_INSTALLED=${forceProxy}"`);
  } else {
    lines.push(
      `for p in nginx apache2 httpd caddy traefik haproxy; do command -v "$p" >/dev/null 2>&1 && echo "FOUND=$p"; done`,
    );
    lines.push(
      `for s in nginx apache2 httpd caddy traefik haproxy; do systemctl is-active "$s" 2>/dev/null | grep -q active && echo "ACTIVE=$s"; done`,
    );
  }

  const proxyNames = forceProxy
    ? [forceProxy]
    : ["nginx", "apache", "httpd", "caddy", "traefik", "haproxy"];

  for (const p of proxyNames) {
    const lookup = p === "httpd" ? "apache" : p;
    const base = DEFAULT_PATHS[lookup];
    if (!base) continue;
    const ov = (overrides && overrides[lookup]) || {};
    const paths: ProxyPaths = {
      configDirs: ov.configDirs || base.configDirs,
      configFiles: ov.configFiles || base.configFiles,
      errorLogs: ov.errorLogs || base.errorLogs,
      accessLogs: ov.accessLogs || base.accessLogs,
      unitName: ov.unitName || base.unitName,
    };
    const cmds = buildProxyScript(lookup, paths);
    lines.push(`\nif command -v ${p} >/dev/null 2>&1; then`);
    for (const c of cmds) {
      for (const line of c.split("\n")) {
        lines.push(line);
      }
    }
    lines.push(`fi`);
  }

  return lines.join("\n");
}

function section(output: string, name: string): string[] {
  const re = new RegExp(`==${name}==\n([\\s\\S]*?)(?=\\n==|$)`);
  const m = output.match(re);
  if (!m) return [];
  return m[1].trim().split("\n").filter(Boolean);
}

function summarizeAccess(text: string): string[] {
  const statusCounts: Record<string, number> = { "4": 0, "5": 0 };
  const pathCounts: Record<string, number> = {};
  const samples: { "4": string[]; "5": string[] } = { "4": [], "5": [] };

  for (const line of text.split("\n")) {
    const parts = line.split(/\s+/);
    const status = parts.find((p) => /^[45]\d{2}$/.test(p));
    if (!status) continue;
    const cls = status[0] as "4" | "5";
    statusCounts[cls]++;
    const path = parts[parts.length - 5] || parts[parts.length - 6] || "?";
    pathCounts[path] = (pathCounts[path] || 0) + 1;
    if (samples[cls].length < 3) samples[cls].push(`${path} → ${status}`);
  }

  const result: string[] = [];
  result.push(`4xx: ${statusCounts[4]} | 5xx: ${statusCounts[5]}`);
  if (statusCounts[5] > 0) result.push(`5xx samples: ${samples[5].join(", ")}`);
  if (statusCounts[4] > 0) result.push(`4xx samples: ${samples[4].join(", ")}`);
  if (statusCounts[4] + statusCounts[5] > 0) {
    const top = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `${p} (${c})`);
    result.push(`Top error paths: ${top.join(", ")}`);
  }
  return result;
}

export default tool({
  description:
    "Detect and debug reverse proxies (nginx, apache, caddy, traefik, haproxy) on a remote server via SSH. Validates config syntax, extracts server blocks / vhosts / upstreams, reads error logs, and summarizes 5xx/4xx from access logs. Paths for config and log files are configurable per proxy.",
  args: {
    host: tool.schema
      .string()
      .describe("Remote server hostname or IP address"),
    port: tool.schema
      .number()
      .optional()
      .describe("SSH port (default: 22)"),
    username: tool.schema
      .string()
      .optional()
      .describe("SSH username (default: current user)"),
    identityFile: tool.schema
      .string()
      .optional()
      .describe("Path to SSH private key (auto-detected from ssh-keys/ if omitted)"),
    proxyJump: tool.schema
      .string()
      .optional()
      .describe("SSH proxy/jump host (e.g. 'user@bastion:22')"),
    mode: tool.schema
      .string()
      .optional()
      .describe(
        "Output mode: 'auto' (default, summary), 'config' (config extract), 'logs' (error + access), 'full' (all)",
      ),
    proxy: tool.schema
      .string()
      .optional()
      .describe(
        "Force specific proxy: 'nginx', 'apache', 'caddy', 'traefik', 'haproxy'. Skips auto-detection.",
      ),
    nginxPaths: tool.schema
      .string()
      .optional()
      .describe("Custom nginx paths JSON: {configDirs:[],configFiles:[],errorLogs:[],accessLogs:[]}"),
    apachePaths: tool.schema
      .string()
      .optional()
      .describe("Custom apache paths JSON: {configDirs:[],configFiles:[],errorLogs:[],accessLogs:[]}"),
    caddyPaths: tool.schema
      .string()
      .optional()
      .describe("Custom caddy paths JSON: {configDirs:[],configFiles:[],errorLogs:[],accessLogs:[]}"),
    traefikPaths: tool.schema
      .string()
      .optional()
      .describe("Custom traefik paths JSON: {configDirs:[],configFiles:[],errorLogs:[],accessLogs:[]}"),
    haproxyPaths: tool.schema
      .string()
      .optional()
      .describe("Custom haproxy paths JSON: {configDirs:[],configFiles:[],errorLogs:[],accessLogs:[]}"),
  },
  async execute(args, context) {
    const mode = args.mode || "auto";
    const VALID_PROXIES = ["nginx", "apache", "httpd", "caddy", "traefik", "haproxy"];
    const forceProxy = args.proxy;
    if (forceProxy && !VALID_PROXIES.includes(forceProxy)) {
      return `ERROR: invalid proxy '${forceProxy}'. Valid: ${VALID_PROXIES.join(", ")}`;
    }
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile:
        args.identityFile ||
        resolveSshKey(context.directory || context.worktree),
      proxyJump: args.proxyJump,
    };

    const overrides: Record<string, Partial<ProxyPaths>> = {};
    for (const p of ["nginx", "apache", "caddy", "traefik", "haproxy"] as const) {
      const key = `${p}Paths` as keyof typeof args;
      const val = args[key];
      if (val) {
        try {
          overrides[p] = JSON.parse(val);
        } catch {
          return `ERROR: ${key} must be valid JSON matching ProxyPaths structure`;
        }
      }
    }

    const script = buildScript(forceProxy, overrides);
    const raw = sshExec(sshOpts, [script], 120_000);
    const proxy = parseProxyResults(raw);

    if (proxy.raw.includes("NOT_INSTALLED")) {
      return `Proxy '${forceProxy}' is not installed on ${args.host}`;
    }

    if (proxy.detected.length === 0 && proxy.active.length === 0) {
      return `No known reverse proxies detected on ${args.host}`;
    }

    const all = [...new Set([...proxy.detected, ...proxy.active])];
    const lines: string[] = [];

    if (mode === "config") {
      for (const p of all) {
        const prefix = p === "httpd" ? "APACHE" : p.toUpperCase();
        lines.push(`=== ${p} Config ===`);
        const cfg = proxy.sections[`${prefix}_CONFIG`] || [];
        if (cfg.length === 0) {
          lines.push(`  (no config extract available)`);
        } else {
          for (const c of cfg) lines.push(`  ${c}`);
        }
        lines.push("");
      }
      return lines.join("\n");
    }

    if (mode === "logs") {
      for (const p of all) {
        const prefix = p === "httpd" ? "APACHE" : p.toUpperCase();
        lines.push(`=== ${p} Error Log (last 50 lines) ===`);
        const err = proxy.sections[`${prefix}_ERRORLOG`] || [];
        for (const l of err) lines.push(`  ${l}`);
        const logpaths = proxy.sections[`${prefix}_LOGS`] || [];
        if (logpaths.length > 0) {
          for (const l of logpaths) lines.push(`  ${l}`);
        }

        lines.push(`--- ${p} Access Log Summary (last 200 lines) ---`);
        const acc = proxy.sections[`${prefix}_ACCESS`] || [];
        const summary = summarizeAccess(acc.join("\n"));
        for (const s of summary) lines.push(`  ${s}`);
        lines.push("");
      }
      return lines.join("\n");
    }

    if (mode === "full") {
      for (const p of all) {
        const prefix = p === "httpd" ? "APACHE" : p.toUpperCase();
        lines.push(`========== ${p} ==========`);

        const sections = [
          `VERSION`,
          `CONFIGTEST`,
          `VHOSTS`,
          `CONFIG`,
          `ERRORLOG`,
          `ACCESS`,
          `VALIDATE`,
          `LOGS`,
        ];

        for (const sec of sections) {
          const key = `${prefix}_${sec}`;
          const data = proxy.sections[key] || [];
          if (data.length === 0) continue;
          lines.push(`--- ${sec} ---`);
          for (const d of data) lines.push(`  ${d}`);
        }

        lines.push(``);
      }
      return lines.join("\n");
    }

    // mode === "auto" (default) - compact summary
    lines.push(`=== Proxy Status: ${args.host} ===`);
    lines.push(`Detected: ${all.join(", ")}`);

    for (const p of all) {
      const prefix = p === "httpd" ? "APACHE" : p.toUpperCase();
      lines.push(``);
      lines.push(`--- ${p} ---`);

      const version = proxy.sections[`${prefix}_VERSION`] || [];
      if (version.length > 0) {
        const vLine = version.map((l) => l.replace(/\s+/g, " ").trim()).join("; ");
        lines.push(`  Version: ${vLine.slice(0, 200)}`);
      }

      const configTest = proxy.sections[`${prefix}_CONFIGTEST`] || [];
      const valid = configTest.some(
        (l) => l.includes("successful") || l.includes("Syntax OK") || l.includes("Configuration file test succeeded"),
      );
      const failed = configTest.some(
        (l) => l.includes("failed") || l.includes("error") || l.includes("Error"),
      );
      if (valid) lines.push(`  Config: VALID`);
      if (failed) lines.push(`  Config: FAILED`);
      if (configTest.length > 0 && !valid && !failed) {
        lines.push(`  Config test output: ${configTest.slice(0, 3).join("; ").slice(0, 200)}`);
      }

      const vhosts = proxy.sections[`${prefix}_VHOSTS`] || [];
      if (vhosts.length > 0) {
        const nameMatch = vhosts.filter((l) => l.includes("port") || l.includes("name") || l.includes("vhost"));
        for (const v of nameMatch.slice(0, 5)) {
          lines.push(`  ${v.trim()}`);
        }
      }

      const config = proxy.sections[`${prefix}_CONFIG`] || [];
      if (config.length > 0) {
        const unique = [...new Set(config.map((l) => l.replace(/^.*?:\s*/, "").trim()))].slice(0, 10);
        for (const c of unique) lines.push(`  ${c}`);
        if (unique.length < config.length) lines.push(`  ... and ${config.length - unique.length} more lines`);
      }

      const errLog = proxy.sections[`${prefix}_ERRORLOG`] || [];
      const logJs = proxy.sections[`${prefix}_LOGS`] || [];
      const allLogs = errLog.length > 0 ? errLog : logJs;

      if (allLogs.length > 0) {
        const last10 = allLogs.slice(-10);
        if (last10.some((l) => l.includes("error") || l.includes("Error") || l.includes("warn") || l.includes("emerg"))) {
          lines.push(`  Error log (last 10):`);
          for (const l of last10) lines.push(`    ${l.slice(0, 200)}`);
        } else {
          lines.push(`  Error log: no recent errors`);
        }
      } else {
        lines.push(`  Error log: not found`);
      }

      const access = proxy.sections[`${prefix}_ACCESS`] || [];
      if (access.length > 0) {
        const summary = summarizeAccess(access.join("\n"));
        lines.push(`  Access log: ${summary[0]}`);
        for (const s of summary.slice(1)) lines.push(`  ${s}`);
      }
    }

    lines.push(``);
    lines.push(`Use mode='full' for full output, mode='config' for config only, mode='logs' for logs only.`);

    return lines.join("\n");
  },
});

function parseProxyResults(raw: string): {
  detected: string[];
  active: string[];
  sections: Record<string, string[]>;
  raw: string;
} {
  const sections: Record<string, string[]> = {};

  const sec = (name: string) => {
    sections[name] = section(raw, name);
  };

  sec("DETECTION");
  sec("NGINX_VERSION");
  sec("NGINX_CONFIGTEST");
  sec("NGINX_CONFIG");
  sec("NGINX_ERRORLOG");
  sec("NGINX_ACCESS");
  sec("APACHE_VERSION");
  sec("APACHE_CONFIGTEST");
  sec("APACHE_VHOSTS");
  sec("APACHE_CONFIG");
  sec("APACHE_ERRORLOG");
  sec("APACHE_ACCESS");
  sec("CADDY_VERSION");
  sec("CADDY_CONFIG");
  sec("CADDY_VALIDATE");
  sec("CADDY_LOGS");
  sec("TRAEFIK_VERSION");
  sec("TRAEFIK_CONFIG");
  sec("TRAEFIK_LOGS");
  sec("HAPROXY_VERSION");
  sec("HAPROXY_CONFIGTEST");
  sec("HAPROXY_CONFIG");
  sec("HAPROXY_LOGS");

  const detected = (raw.match(/FOUND=(\w+)/g) || []).map((s) => s.split("=")[1]);
  const active = (raw.match(/ACTIVE=(\w+)/g) || []).map((s) => s.split("=")[1]);

  return { detected, active, sections, raw };
}
