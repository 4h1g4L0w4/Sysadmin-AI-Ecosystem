import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey, sanitizeParam } from "./_ssh";

export default tool({
  description:
    "Read-only Docker debugging on a remote server via SSH. Lists all containers, resource usage (CPU/memory), images, networks, volumes, and per-container detail: inspect, health status, restart count, mounts, published ports, and recent logs. Cannot exec, start, stop, restart, remove containers, create images, or modify any Docker resource.",
  args: {
    host: tool.schema
      .string()
      .describe("Remote server hostname or IP running Docker"),
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
    container: tool.schema
      .string()
      .optional()
      .describe("Specific container name or ID for detailed inspection"),
  },
  async execute(args, context) {
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
      proxyJump: args.proxyJump,
    };

    const container = args.container ? sanitizeParam(args.container, "container") : undefined;
    if (container && container.startsWith("ERROR:")) return container;

    const cmds: string[] = [
      `echo "====== ALL CONTAINERS ======"`,
      `docker ps -a 2>/dev/null || echo "[docker not available or permission denied]"`,
      `echo "====== LIVE STATS (CPU / MEM) ======"`,
      `docker stats --no-stream 2>/dev/null || echo "cannot get stats"`,
      `echo "====== IMAGES ======"`,
      `docker images 2>/dev/null`,
      `echo "====== NETWORKS ======"`,
      `docker network ls 2>/dev/null`,
      `echo "====== VOLUMES ======"`,
      `docker volume ls 2>/dev/null`,
    ];

    if (container) {
      cmds.push(
        `echo "====== DETAILS: ${container} ======"`,
        `docker inspect "${container}" 2>/dev/null || echo "container not found"`,
        `echo "--- Health ---"`,
        `docker inspect --format='{{json .State.Health}}' "${container}" 2>/dev/null || echo "no health check"`,
        `echo "--- Restart Count ---"`,
        `docker inspect --format='{{.RestartCount}}' "${container}" 2>/dev/null`,
        `echo "--- Mounts ---"`,
        `docker inspect --format='{{json .Mounts}}' "${container}" 2>/dev/null`,
        `echo "--- Published Ports ---"`,
        `docker port "${container}" 2>/dev/null || echo "no published ports"`,
        `echo "--- Logs (last 80 lines) ---"`,
        `docker logs "${container}" --tail=80 2>/dev/null || echo "cannot get logs"`,
      );
    }

    return sshExec(sshOpts, cmds);
  },
});
