import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Read-only Kubernetes cluster debugging via SSH. Inspects nodes, namespaces, pods (wide), deployments, statefulsets, daemonsets, services, ingress, events (sorted), pod logs (with --previous support), restart counts, readiness/liveness probe details, and resource usage (top pods/nodes). Requires kubectl configured on the remote host. Cannot create, delete, scale, exec, rollout, or modify any resource.",
  args: {
    host: tool.schema
      .string()
      .describe("Remote host with kubectl configured (master node, bastion, or admin workstation)"),
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
    namespace: tool.schema
      .string()
      .optional()
      .describe("Filter by namespace (default: all-namespaces)"),
    pod: tool.schema
      .string()
      .optional()
      .describe("Specific pod name to describe + get logs (requires --namespace)"),
  },
  async execute(args, context) {
    if (args.pod && !args.namespace) {
      return "ERROR: --namespace is required when specifying a --pod.";
    }

    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
      proxyJump: args.proxyJump,
    };

    const ns = args.namespace;
    const allNs = !ns;

    const cmds: string[] = [
      `echo "====== NODES ======"`,
      `kubectl get nodes -o wide 2>/dev/null || echo "[kubectl not available on remote host]"`,
      `echo "====== NAMESPACES ======"`,
      `kubectl get namespaces 2>/dev/null`,
    ];

    if (args.pod) {
      cmds.push(
        `echo "====== POD: ${ns}/${args.pod} ======"`,
        `kubectl describe pod "${args.pod}" -n "${ns}" 2>/dev/null || echo "pod not found"`,
        `echo "--- Logs (last 80) ---"`,
        `kubectl logs "${args.pod}" -n "${ns}" --tail=80 2>/dev/null || echo "no logs"`,
        `echo "--- Previous logs (last 40) ---"`,
        `kubectl logs "${args.pod}" -n "${ns}" --tail=40 --previous 2>/dev/null || echo "no previous logs"`,
        `echo "--- Restart count ---"`,
        `kubectl get pod "${args.pod}" -n "${ns}" -o jsonpath='{.status.containerStatuses[*].restartCount}' 2>/dev/null || echo "n/a"`,
      );
    } else {
      const nsFlag = allNs ? "--all-namespaces" : `-n "${ns}"`;
      cmds.push(
        `echo "====== PODS (${allNs ? "all-namespaces" : ns}) ======"`,
        `kubectl get pods ${nsFlag} -o wide 2>/dev/null`,
        `echo "====== DEPLOYMENTS ======"`,
        `kubectl get deployments ${nsFlag} 2>/dev/null`,
        `echo "====== STATEFULSETS ======"`,
        `kubectl get statefulsets ${nsFlag} 2>/dev/null`,
        `echo "====== DAEMONSETS ======"`,
        `kubectl get daemonsets ${nsFlag} 2>/dev/null`,
        `echo "====== SERVICES ======"`,
        `kubectl get services ${nsFlag} 2>/dev/null`,
        `echo "====== INGRESS ======"`,
        `kubectl get ingress ${nsFlag} 2>/dev/null`,
      );
    }

    cmds.push(
      `echo "====== EVENTS (last 50) ======"`,
      allNs
        ? `kubectl get events --all-namespaces --sort-by='.lastTimestamp' 2>/dev/null | tail -50`
        : `kubectl get events -n "${ns}" --sort-by='.lastTimestamp' 2>/dev/null | tail -50`,
      `echo "====== POD RESOURCE USAGE ======"`,
      allNs
        ? `kubectl top pods --all-namespaces 2>/dev/null || echo "[metrics-server not available]"`
        : `kubectl top pods -n "${ns}" 2>/dev/null || echo "[metrics-server not available]"`,
      `echo "====== NODE RESOURCE USAGE ======"`,
      `kubectl top nodes 2>/dev/null || echo "[metrics-server not available]"`,
    );

    return sshExec(sshOpts, cmds);
  },
});
