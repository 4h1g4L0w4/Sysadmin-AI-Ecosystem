import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

function section(output: string, name: string): string[] {
  const re = new RegExp(`==${name}==\n([\\s\\S]*?)(?=\\n==|$)`);
  const m = output.match(re);
  if (!m) return [];
  return m[1].trim().split("\n").filter(Boolean);
}

function summarizeAccess(text: string): string[] {
  const lines = text.split("\n").filter(Boolean);
  const statusCounts: Record<string, number> = {};
  const pathCounts: Record<string, number> = {};
  const pathStatus: string[] = [];
  const sample4xx: string[] = [];
  const sample5xx: string[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const status = parts[parts.length - 2];
    const path = parts[parts.length - 5] || parts[parts.length - 6] || "?";

    if (status && /^[45]\d{2}$/.test(status)) {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      pathCounts[path] = (pathCounts[path] || 0) + 1;

      if (status.startsWith("4") && sample4xx.length < 3) {
        sample4xx.push(`${path} → ${status}`);
      }
      if (status.startsWith("5") && sample5xx.length < 3) {
        sample5xx.push(`${path} → ${status}`);
      }
    }
  }

  const total4xx = Object.entries(statusCounts)
    .filter(([k]) => k.startsWith("4"))
    .reduce((a, [, v]) => a + v, 0);
  const total5xx = Object.entries(statusCounts)
    .filter(([k]) => k.startsWith("5"))
    .reduce((a, [, v]) => a + v, 0);

  const result: string[] = [];
  result.push(`4xx: ${total4xx} | 5xx: ${total5xx}`);
  if (total4xx > 0 || total5xx > 0) {
    if (sample5xx.length > 0) {
      result.push(`5xx samples: ${sample5xx.join(", ")}`);
    }
    if (sample4xx.length > 0) {
      result.push(`4xx samples: ${sample4xx.join(", ")}`);
    }
    const topPaths = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `${p} (${c})`);
    result.push(`Top error paths: ${topPaths.join(", ")}`);
  }
  return result;
}

export default tool({
  description:
    "Detect and debug reverse proxies (nginx, apache, caddy, traefik, haproxy) on a remote server via SSH (read-only). Validates config syntax, extracts server blocks / vhosts / upstreams, reads error logs, and summarizes 5xx/4xx from access logs.",
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
    mode: tool.schema
      .string()
      .optional()
      .describe(
        "Output mode: 'auto' (default, summary of detected proxies), 'config' (config extract), 'logs' (error + access log), 'full' (everything)",
      ),
    proxy: tool.schema
      .string()
      .optional()
      .describe(
        "Force specific proxy: 'nginx', 'apache', 'caddy', 'traefik', 'haproxy'. Skips auto-detection.",
      ),
  },
  async execute(args, context) {
    const mode = args.mode || "auto";
    const forceProxy = args.proxy;
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile:
        args.identityFile ||
        resolveSshKey(context.directory || context.worktree),
    };

    const cmd: string[] = [
      `echo "==DETECTION=="`,
    ];

    if (forceProxy) {
      cmd.push(`echo "FORCED=${forceProxy}"`);
    } else {
      cmd.push(
        `for p in nginx apache2 httpd caddy traefik haproxy; do`,
        `  command -v "$p" >/dev/null 2>&1 && echo "FOUND=$p"`,
        `done`,
        `for s in nginx apache2 httpd caddy traefik haproxy; do`,
        `  systemctl is-active "$s" 2>/dev/null | grep -q active && echo "ACTIVE=$s"`,
        `done`,
      );
    }

    unless forced, we need to conditionally run blocks for each proxy. But since we don't know what's detected until runtime, I can use `if` blocks directly in bash.

    Actually, with a forced proxy, it's simple. Without, I need to check each one.

    Let me restructure: run detection first, then for each proxy, run its specific commands only if detected (or if forced).

    But the detection results are only known at runtime inside the SSH session. So I need to use shell conditionals.

    For each proxy, I'll wrap in `if command -v <proxy> >/dev/null 2>&1; then ... fi`. This way:
    - If forced: `command -v nginx` will find it
    - If auto: same logic
    - If not installed: skipped
      `);
    }

    // ... this is getting complex in template strings. Let me just inline the whole script.
    ```

Actually, I realize I'm overcomplicating this. Let me just write the full script as a single multi-line string. I don't need to be clever with the array - just write a single string with all the shell commands.

Let me rewrite the whole thing more simply.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write">
<｜｜DSML｜｜parameter name="content" string="true">import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

interface ProxyResult {
  detected: string[];
  active: string[];
  sections: Record<string, string[]>;
  raw: string;
}

const NGINX_CMDS = `
echo "==NGINX_VERSION=="
nginx -V 2>&1 || true
echo "==NGINX_CONFIGTEST=="
nginx -t 2>&1 || true
echo "==NGINX_CONFIG=="
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/nginx.conf; do
  [ -d "$d" ] && grep -rnh 'listen\\|server_name\\|proxy_pass\\|upstream\\|return\\|location' "$d" 2>/dev/null | head -60
  [ -f "$d" ] && grep -n 'listen\\|server_name\\|proxy_pass\\|upstream\\|return\\|location' "$d" 2>/dev/null | head -60
done
echo "==NGINX_ERRORLOG=="
for f in /var/log/nginx/error.log /var/log/nginx/error.log.1 /usr/local/nginx/logs/error.log; do
  [ -f "$f" ] && tail -50 "$f" && break
done 2>/dev/null
journalctl -u nginx -n 50 --no-pager 2>/dev/null | tail -50 || true
echo "==NGINX_ACCESS=="
for f in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
  [ -f "$f" ] && tail -200 "$f" && break
done 2>/dev/null
`;

const APACHE_CMDS = `
echo "==APACHE_VERSION=="
apache2ctl -V 2>/dev/null || httpd -V 2>/dev/null || true
echo "==APACHE_CONFIGTEST=="
apache2ctl -t 2>/dev/null || httpd -t 2>/dev/null || true
echo "==APACHE_VHOSTS=="
apache2ctl -S 2>/dev/null || httpd -S 2>/dev/null || true
echo "==APACHE_CONFIG=="
for d in /etc/apache2/sites-enabled /etc/httpd/conf.d /etc/apache2/conf-enabled; do
  [ -d "$d" ] && grep -rnh 'VirtualHost\\|DocumentRoot\\|ProxyPass\\|ProxyPassReverse\\|ServerName\\|Listen\\|<Location' "$d" 2>/dev/null | head -60
done
echo "==APACHE_ERRORLOG=="
for f in /var/log/apache2/error.log /var/log/httpd/error_log /var/log/apache2/error.log.1; do
  [ -f "$f" ] && tail -50 "$f" && break
done 2>/dev/null
echo "==APACHE_ACCESS=="
for f in /var/log/apache2/access.log /var/log/httpd/access_log /var/log/apache2/access.log.1; do
  [ -f "$f" ] && tail -200 "$f" && break
done 2>/dev/null
`;

const CADDY_CMDS = `
echo "==CADDY_VERSION=="
caddy version 2>/dev/null || true
echo "==CADDY_CONFIG=="
for f in /etc/caddy/Caddyfile ~/Caddyfile; do
  [ -f "$f" ] && grep -n 'reverse_proxy\\|handle_path\\|respond\\|redir\\|route\\|tls' "$f" 2>/dev/null | head -60 && break
done
echo "==CADDY_VALIDATE=="
for f in /etc/caddy/Caddyfile ~/Caddyfile; do
  [ -f "$f" ] && caddy validate --config "$f" 2>&1 && break
done 2>/dev/null
echo "==CADDY_LOGS=="
journalctl -u caddy -n 50 --no-pager 2>/dev/null || true
`;

const TRAEFIK_CMDS = `
echo "==TRAEFIK_VERSION=="
traefik version 2>/dev/null || true
echo "==TRAEFIK_CONFIG=="
for f in /etc/traefik/traefik.yml /etc/traefik/traefik.toml /etc/traefik/traefik.yaml; do
  [ -f "$f" ] && head -80 "$f" && break
done 2>/dev/null
echo "==TRAEFIK_LOGS=="
journalctl -u traefik -n 50 --no-pager 2>/dev/null || true
`;

const HAPROXY_CMDS = `
echo "==HAPROXY_VERSION=="
haproxy -v 2>/dev/null || true
echo "==HAPROXY_CONFIGTEST=="
haproxy -c -f /etc/haproxy/haproxy.cfg 2>/dev/null || true
echo "==HAPROXY_CONFIG=="
[ -f /etc/haproxy/haproxy.cfg ] && grep -n 'frontend\\|backend\\|listen\\|server\\|bind\\|default_backend\\|use_backend' /etc/haproxy/haproxy.cfg 2>/dev/null | head -60
echo "==HAPROXY_LOGS=="
for f in /var/log/haproxy.log /var/log/haproxy/access.log; do
  [ -f "$f" ] && tail -50 "$f" && break
done 2>/dev/null
`;

function parseProxyResults(raw: string): ProxyResult {
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

function section(output: string, name: string): string[] {
  const re = new RegExp(`==${name}==\n([\\s\\S]*?)(?=\\n==|$)`);
  const m = output.match(re);
  if (!m) return [];
  return m[1].trim().split("\n").filter(Boolean);
}

function summarizeAccess(text: string): string[] {
  const statusCounts: Record<string, number> = { 4: 0, 5: 0 };
  const pathCounts: Record<string, number> = {};
  const samples: { 4: string[]; 5: string[] } = { 4: [], 5: [] };

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

function buildScript(proxy?: string): string {
  const lines: string[] = [];

  lines.push(`echo "==DETECTION=="`);

  if (proxy) {
    lines.push(`echo "FORCED=${proxy}"`);
    lines.push(`command -v ${proxy} >/dev/null 2>&1 || echo "NOT_INSTALLED=${proxy}"`);
  } else {
    lines.push(
      `for p in nginx apache2 httpd caddy traefik haproxy; do command -v "$p" >/dev/null 2>&1 && echo "FOUND=$p"; done`,
    );
    lines.push(
      `for s in nginx apache2 httpd caddy traefik haproxy; do systemctl is-active "$s" 2>/dev/null | grep -q active && echo "ACTIVE=$s"; done`,
    );
  }

  const proxies = proxy ? [proxy] : ["nginx", "apache2", "httpd", "caddy", "traefik", "haproxy"];
  const blocks: Record<string, string> = {
    nginx: NGINX_CMDS,
    apache2: APACHE_CMDS,
    httpd: APACHE_CMDS,
    caddy: CADDY_CMDS,
    traefik: TRAEFIK_CMDS,
    haproxy: HAPROXY_CMDS,
  };

  for (const p of proxies) {
    const block = blocks[p];
    if (!block) continue;
    lines.push(`\nif command -v ${p} >/dev/null 2>&1; then`);
    lines.push(...block.trim().split("\n"));
    lines.push(`fi`);
  }

  return lines.join("\n");
}

export default tool({
  description:
    "Detect and debug reverse proxies (nginx, apache, caddy, traefik, haproxy) on a remote server via SSH. Validates config syntax, extracts server blocks / vhosts / upstreams, reads error logs, and summarizes 5xx/4xx from access logs.",
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
  },
  async execute(args, context) {
    const mode = args.mode || "auto";
    const forceProxy = args.proxy;
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile:
        args.identityFile ||
        resolveSshKey(context.directory || context.worktree),
    };

    const script = buildScript(forceProxy);
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

        lines.push(`--- ${p} Access Log Summary (last 200 lines) ---`);
        const acc = proxy.sections[`${prefix}_ACCESS`] || [];
        const summary = summarizeAccess(acc.join("\n"));
        for (const s of summary) lines.push(`  ${s}`);
        lines.push("");
      }
      return lines.join("\n");
    }

    if (mode === "full") {
      // Return everything we have
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

      // Vhosts for apache
      const vhosts = proxy.sections[`${prefix}_VHOSTS`] || [];
      if (vhosts.length > 0) {
        const nameMatch = vhosts.filter((l) => l.includes("port") || l.includes("name") || l.includes("vhost"));
        for (const v of nameMatch.slice(0, 5)) {
          lines.push(`  ${v.trim()}`);
        }
      }

      // Config extract - first lines
      const config = proxy.sections[`${prefix}_CONFIG`] || [];
      if (config.length > 0) {
        const unique = [...new Set(config.map((l) => l.replace(/^.*?:\s*/, "").trim()))].slice(0, 10);
        for (const c of unique) lines.push(`  ${c}`);
        if (unique.length < config.length) lines.push(`  ... and ${config.length - unique.length} more lines`);
      }

      // Error log
      const errLog = proxy.sections[`${prefix}_ERRORLOG`] || [];
      const logPaths = proxy.sections[`${prefix}_LOGS`] || [];
      const allLogs = errLog.length > 0 ? errLog : logPaths;

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

      // Access summary
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
