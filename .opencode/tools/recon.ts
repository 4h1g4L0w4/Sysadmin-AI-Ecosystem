import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Read-only reconnaissance of a remote server via SSH. Discovers running systemd services, top processes, open TCP/UDP ports, Docker/Podman containers, Kubernetes pods (all namespaces), installed runtime versions (Node, Python, Go, Java, nginx, PostgreSQL, Redis), reverse-proxy config snippets, common application directories, and local HTTP health-check endpoints. No sudo, no arbitrary commands — safe first scan to map the live architecture.",
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
  },
  async execute(args, context) {
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
    };

    const cmds: string[] = [
      `echo "====== OS / KERNEL ======"`,
      `cat /etc/os-release 2>/dev/null`,
      `uname -a`,
      `echo "====== RUNNING SYSTEMD SERVICES ======"`,
      `systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -50`,
      `echo "====== TOP PROCESSES (by mem) ======"`,
      `ps aux --sort=-%mem 2>/dev/null | head -30`,
      `echo "====== TCP LISTENERS ======"`,
      `ss -tlnp 2>/dev/null`,
      `echo "====== UDP LISTENERS ======"`,
      `ss -ulnp 2>/dev/null`,
      `echo "====== DOCKER CONTAINERS ======"`,
      `docker ps -a 2>/dev/null || echo "[docker not available]"`,
      `echo "====== PODMAN CONTAINERS ======"`,
      `podman ps -a 2>/dev/null || echo "[podman not available]"`,
      `echo "====== KUBERNETES (all namespaces) ======"`,
      `kubectl get pods --all-namespaces -o wide 2>/dev/null || echo "[kubectl not available]"`,
      `echo "====== RUNTIME VERSIONS ======"`,
      `echo "Node:     $(node --version 2>/dev/null || echo 'not found')"`,
      `echo "Python3:  $(python3 --version 2>&1 || echo 'not found')"`,
      `echo "Go:       $(go version 2>/dev/null || echo 'not found')"`,
      `echo "Java:     $(java -version 2>&1 | head -1 || echo 'not found')"`,
      `echo "Nginx:    $(nginx -v 2>&1 || echo 'not found')"`,
      `echo "psql:     $(psql --version 2>/dev/null || echo 'not found')"`,
      `echo "Redis:    $(redis-cli --version 2>/dev/null || echo 'not found')"`,
      `echo "Docker:   $(docker --version 2>/dev/null || echo 'not found')"`,
      `echo "Kubectl:  $(kubectl version --client 2>/dev/null | head -1 || echo 'not found')"`,
      `echo "====== REVERSE-PROXY CONFIG (readable parts) ======"`,
      `echo "--- Nginx sites ---"`,
      `ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "no nginx sites"`,
      `echo "--- Nginx main conf (head) ---"`,
      `cat /etc/nginx/nginx.conf 2>/dev/null | head -30 || echo "no nginx conf access"`,
      `echo "--- Apache sites ---"`,
      `ls -la /etc/apache2/sites-enabled/ 2>/dev/null || echo "no apache sites"`,
      `echo "--- Caddy ---"`,
      `cat /etc/caddy/Caddyfile 2>/dev/null | head -20 || echo "no caddy"`,
      `echo "====== APPLICATION DIRECTORIES ======"`,
      `for d in /var/www /opt /srv /home /etc/nginx /etc/apache2; do if [ -d "$d" ]; then echo "--- $d ---"; ls -la "$d" 2>/dev/null | head -8; fi; done`,
      `echo "====== LOCAL HEALTH-CHECK ENDPOINTS ======"`,
      `for url in http://localhost:80/health http://localhost:3000/health http://localhost:8080/health http://localhost:5000/health http://localhost/healthz http://localhost:3000/api/health http://localhost:8080/actuator/health; do result=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 3 2>/dev/null); if [ -n "$result" ]; then echo "$url -> HTTP $result"; fi; done`,
    ];

    return sshExec(sshOpts, cmds);
  },
});
