import { tool } from "@opencode-ai/plugin";
import { sshExec, SshOptions, resolveSshKey } from "./_ssh";

export default tool({
  description:
    "Check SSL/TLS certificate details of a remote endpoint via SSH (read-only). Shows expiration dates, subject, issuer, serial number, SHA-256 fingerprint, Subject Alternative Names (SANs), certificate chain, verification status, supported TLS versions, and days until expiry. Cannot modify any certificates or configuration.",
  args: {
    host: tool.schema
      .string()
      .describe("Remote server to SSH into and run the check FROM"),
    target: tool.schema
      .string()
      .describe("Hostname to check (e.g. 'example.com')"),
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
    targetPort: tool.schema
      .number()
      .optional()
      .describe("Target HTTPS port (default: 443)"),
    sni: tool.schema
      .string()
      .optional()
      .describe("SNI hostname (default: same as target)"),
  },
  async execute(args, context) {
    const sshOpts: SshOptions = {
      host: args.host,
      port: args.port,
      username: args.username,
      identityFile: args.identityFile || resolveSshKey(context.directory || context.worktree),
      proxyJump: args.proxyJump,
    };

    const target = args.target;
    const port = args.targetPort || 443;
    const sni = args.sni || target;

    const cmds: string[] = [
      `echo "====== SSL/TLS CHECK ${target}:${port} ======"`,
      `echo "Target: ${target}:${port}"`,
      `echo "SNI:    ${sni}"`,
      `echo "Date:   $(date -u +'%Y-%m-%dT%H:%M:%SZ')"`,
      `echo ""`,

      `echo "--- Certificate Dates / Subject / Issuer ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -dates -subject -issuer -serial -fingerprint -sha256 2>/dev/null || echo "[openssl not available or connection failed]"`,
      `echo ""`,

      `echo "--- Subject Alternative Names (SANs) ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -ext subjectAltName 2>/dev/null || echo "[no extensions]"`,
      `echo ""`,

      `echo "--- Full Certificate (preview) ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -text 2>/dev/null | head -50`,
      `echo ""`,

      `echo "--- Certificate Chain ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" -showcerts 2>/dev/null | grep -E '^[ ]*[0-9]+ (s|i|c):|subject=|issuer='`,
      `echo ""`,

      `echo "--- Verification ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | grep -E 'Verify return code|Certificate chain'`,
      `echo ""`,

      `echo "--- Expiry Check ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -checkend 0 2>/dev/null && echo "Status: VALID (not expired)" || echo "Status: EXPIRED"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -checkend $((30*86400)) 2>/dev/null && echo "30-day window: OK (>30 days left)" || echo "30-day window: EXPIRES SOON (<30 days)"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" 2>/dev/null | openssl x509 -noout -checkend $((90*86400)) 2>/dev/null && echo "90-day window: OK (>90 days left)" || echo "90-day window: EXPIRES SOON (<90 days)"`,
      `echo ""`,

      `echo "--- TLS 1.2 ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" -tls1_2 2>/dev/null | grep -E 'CONNECTED|no protocols? error|alert' | head -3`,
      `[ $? -eq 0 ] && echo "TLS 1.2: supported" || echo "TLS 1.2: not supported"`,

      `echo "--- TLS 1.3 ---"`,
      `echo | openssl s_client -connect "${target}:${port}" -servername "${sni}" -tls1_3 2>/dev/null | grep -E 'CONNECTED|no protocols? error|alert' | head -3`,
      `[ $? -eq 0 ] && echo "TLS 1.3: supported" || echo "TLS 1.3: not supported"`,
    ];

    return sshExec(sshOpts, cmds);
  },
});
