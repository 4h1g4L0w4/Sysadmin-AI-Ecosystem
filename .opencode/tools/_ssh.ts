import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

export interface SshOptions {
  host: string;
  port?: number;
  username?: string;
  identityFile?: string;
}

export function resolveSshKey(baseDir?: string): string | undefined {
  const candidates = [
    baseDir,
    process.env.OPENCODE_DIRECTORY,
    process.cwd(),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    const keyDir = path.join(dir, "ssh-keys");
    if (!fs.existsSync(keyDir)) continue;
    const entries = fs.readdirSync(keyDir);
    const key = entries.find((f) => !f.endsWith(".pub") && !f.startsWith("."));
    if (key) return path.join(keyDir, key);
  }
  return undefined;
}

function sshCliArgs(options: SshOptions): string[] {
  const args: string[] = [
    "-o", "LogLevel=ERROR",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=15",
    "-o", "BatchMode=yes",
  ];
  if (options.port) args.push("-p", String(options.port));
  if (options.username) args.push("-l", options.username);
  if (options.identityFile) args.push("-i", options.identityFile);
  return args;
}

export function sshExec(options: SshOptions, commands: string[], timeout = 60_000): string {
  const args = [...sshCliArgs(options), options.host, commands.join(" ; ")];
  try {
    const result = execFileSync("ssh", args, {
      timeout,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result;
  } catch (e: any) {
    let msg = "";
    if (e.stdout) msg += e.stdout;
    if (e.stderr) msg += (msg ? "\n" : "") + `STDERR: ${e.stderr}`;
    if (!msg) msg = `SSH_ERROR: ${e.message}`;
    return msg;
  }
}
