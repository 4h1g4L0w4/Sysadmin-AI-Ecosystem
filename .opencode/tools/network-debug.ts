import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Network diagnostics from a remote server via SSH (read-only). Runs ping, DNS resolution, traceroute, MTR, HTTP/HTTPS checks, port probes (/dev/tcp), and routing analysis to diagnose connectivity issues from the server's perspective. No modifications on the remote host.",
  args: {
    host: tool.schema
      .string()
      .describe("Remote server to SSH into and run diagnostics FROM"),
    target: tool.schema
      .string()
      .describe("Destination hostname or IP to test connectivity TO"),
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
    targetPort: tool.schema
      .number()
      .optional()
      .describe("Target port for HTTP/probe checks"),
    test: tool.schema
      .string()
      .optional()
      .describe("Test type: 'all' (default), 'ping', 'dns', 'traceroute', 'mtr', 'http', 'ports'"),
  },
  async execute(args, context) {
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
    };

    const t = args.target;
    const tp = args.targetPort;
    const mode = args.test || "all";

    const cmds: string[] = [
      `echo "====== NETWORK DIAGNOSTICS FROM $(hostname) TO ${t} ======"`,
      `echo "--- Local hostname: $(hostname)"`,
      `echo "--- Local IPs: $(hostname -I 2>/dev/null || ip -4 addr show 2>/dev/null | grep inet | awk '{print $2}' | paste -sd ' ')"`,
      `echo "--- Default route: $(ip route 2>/dev/null | head -3 || route -n 2>/dev/null | head -5)"`,
    ];

    if (mode === "all" || mode === "ping") {
      cmds.push(
        `echo "====== PING ${t} ======"`,
        `ping -c 4 -W 5 "${t}" 2>&1 || echo "[ping failed or timeout]"`,
      );
    }

    if (mode === "all" || mode === "dns") {
      cmds.push(
        `echo "====== DNS RESOLUTION ${t} ======"`,
        `dig "${t}" +short 2>/dev/null || nslookup "${t}" 2>/dev/null || host "${t}" 2>/dev/null || echo "[no DNS tools available]"`,
        `echo "--- Reverse DNS ---"`,
        `ip=$(dig "${t}" +short 2>/dev/null | head -1); [ -n "$ip" ] && dig -x "$ip" +short 2>/dev/null || echo "[no reverse]"`,
      );
    }

    if (mode === "all" || mode === "traceroute") {
      cmds.push(
        `echo "====== TRACEROUTE ${t} ======"`,
        `traceroute -n -m 15 -w 2 "${t}" 2>/dev/null || traceroute "${t}" 2>/dev/null || echo "[traceroute not available]"`,
      );
    }

    if (mode === "all" || mode === "mtr") {
      cmds.push(
        `echo "====== MTR ${t} ======"`,
        `mtr -r -c 5 -n "${t}" 2>/dev/null || echo "[mtr not available]"`,
      );
    }

    if (mode === "all" || mode === "http") {
      const hp = tp || 80;
      const hps = tp || 443;
      cmds.push(
        `echo "====== HTTP/HTTPS ${t} ======"`,
        `curl -s -o /dev/null -w "HTTP  -> %{http_code}  %{time_total}s  %{remote_ip}:%{remote_port}\n" "http://${t}:${hp}/" --max-time 5 2>/dev/null || echo "HTTP ${t}:${hp} -> no response"`,
        `curl -s -o /dev/null -w "HTTPS -> %{http_code}  %{time_total}s  %{remote_ip}:%{remote_port}\n" "https://${t}:${hps}/" --max-time 5 2>/dev/null || echo "HTTPS ${t}:${hps} -> no response"`,
      );
    }

    if (mode === "all" || mode === "ports") {
      cmds.push(
        `echo "====== ACTIVE CONNECTIONS ======"`,
        `ss -tnp 2>/dev/null | head -20 || netstat -tnp 2>/dev/null | head -20 || echo "[no connection tools]"`,
      );
      if (tp) {
        cmds.push(
          `echo "====== PORT PROBE ${t}:${tp} ======"`,
          `timeout 3 bash -c "echo >/dev/tcp/${t}/${tp}" 2>/dev/null && echo "TCP ${t}:${tp} -> OPEN" || echo "TCP ${t}:${tp} -> CLOSED/FILTERED"`,
        );
      } else {
        cmds.push(
          `echo "====== COMMON PORTS SCAN ${t} ======"`,
          `for p in 22 80 443 3000 5000 5432 6379 8080 8443 9090 27017; do timeout 2 bash -c "echo >/dev/tcp/${t}/\${p}" 2>/dev/null && echo "TCP ${t}:\${p} -> OPEN"; done`,
          `echo "(port scan finished)"`,
        );
      }
    }

    return sshExec(sshOpts, cmds);
  },
});
