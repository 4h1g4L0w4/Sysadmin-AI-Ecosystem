import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Inspect a remote server via SSH (read-only). Shows system status, resource usage (CPU/memory/disk), open ports, recent systemd journal logs, failed services, and optional per-service status + logs. Designed to diagnose specific issues without modifying anything on the remote host. No sudo, no arbitrary commands.",
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
      .describe("Path to SSH private key file (auto-detected from ssh-keys/ if omitted)"),
    proxyJump: tool.schema
      .string()
      .optional()
      .describe("SSH proxy/jump host (e.g. 'user@bastion:22')"),
    service: tool.schema
      .string()
      .optional()
      .describe(
        "Specific systemd service to inspect — status + last 60 log lines (e.g. 'nginx', 'postgresql@14-main')",
      ),
  },
  async execute(args, context) {
    if (args.service && !/^[a-zA-Z0-9_@.\-]+$/.test(args.service)) {
      return `ERROR: invalid service name '${args.service}'`;
    }

    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
      proxyJump: args.proxyJump,
    };

    const cmds: string[] = [
      `echo "====== SYSTEM INFO ======"`,
      `echo "Kernel: $(uname -a)"`,
      `echo "Uptime:  $(uptime)"`,
      `echo "OS: $(cat /etc/os-release 2>/dev/null | head -6)"`,
      `echo "====== RESOURCES ======"`,
      `echo "--- Memory ---"`,
      `free -h`,
      `echo "--- Disk ---"`,
      `df -h | grep -v tmpfs`,
      `echo "--- Load Average ---"`,
      `cat /proc/loadavg`,
      `echo "--- Top Processes (by mem) ---"`,
      `ps aux --sort=-%mem 2>/dev/null | head -15`,
      `echo "====== OPEN PORTS (TCP listen) ======"`,
      `ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo "cannot read ports"`,
      `echo "====== SYSTEMD JOURNAL (recent 50 lines) ======"`,
      `journalctl -xe -n 50 --no-pager 2>/dev/null || echo "journalctl not available"`,
      `echo "====== FAILED SERVICES ======"`,
      `systemctl --failed --no-pager 2>/dev/null || echo "cannot check failed services"`,
    ];

    if (args.service) {
      cmds.push(
        `echo "====== SERVICE STATUS: ${args.service} ======"`,
        `systemctl status "${args.service}" --no-pager -l 2>/dev/null || echo "service not found"`,
        `echo "--- Recent logs for ${args.service} ---"`,
        `journalctl -u "${args.service}" -n 60 --no-pager 2>/dev/null || echo "cannot read logs for ${args.service}"`,
      );
    }

    return sshExec(sshOpts, cmds);
  },
});
