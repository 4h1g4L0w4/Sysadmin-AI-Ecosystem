import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import os from "os";

// ── Inline implementation matching _ssh.ts logic ─────────────────

interface SshOptions {
  host: string;
  port?: number;
  username?: string;
  identityFile?: string;
  proxyJump?: string;
}

function resolveSshKey(baseDir?: string): string | undefined {
  const candidates = [
    baseDir,
    process.env.OPENCODE_DIRECTORY,
    process.cwd(),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const keyDir = path.join(dir, "ssh-keys");
    if (!existsSync(keyDir)) continue;
    const entries = existSyncReadDir(keyDir);
    const key = entries.find((f) => !f.endsWith(".pub") && !f.startsWith("."));
    if (key) return path.join(keyDir, key);
  }
  return undefined;
}

function existSyncReadDir(dir: string): string[] {
  try {
    const fs = require("fs");
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
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
  if (options.proxyJump) args.push("-J", options.proxyJump);
  return args;
}

// ── Tests ────────────────────────────────────────────────────────

describe("sshCliArgs", () => {
  it("includes basic options", () => {
    const args = sshCliArgs({ host: "10.0.0.1" });
    expect(args).toContain("-o");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).toContain("BatchMode=yes");
    expect(args).not.toContain("-p");
    expect(args).not.toContain("-l");
    expect(args).not.toContain("-i");
  });

  it("adds port when specified", () => {
    const args = sshCliArgs({ host: "10.0.0.1", port: 2222 });
    expect(args).toContain("-p");
    expect(args).toContain("2222");
  });

  it("adds username when specified", () => {
    const args = sshCliArgs({ host: "10.0.0.1", username: "admin" });
    expect(args).toContain("-l");
    expect(args).toContain("admin");
  });

  it("adds identityFile when specified", () => {
    const args = sshCliArgs({ host: "10.0.0.1", identityFile: "/path/to/key" });
    expect(args).toContain("-i");
    expect(args).toContain("/path/to/key");
  });

  it("combines all options", () => {
    const args = sshCliArgs({
      host: "10.0.0.1",
      port: 2222,
      username: "deploy",
      identityFile: "/tmp/key",
    });
    expect(args).toContain("-p");
    expect(args).toContain("2222");
    expect(args).toContain("-l");
    expect(args).toContain("deploy");
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/key");
  });

  it("adds proxyJump when specified", () => {
    const args = sshCliArgs({ host: "10.0.0.1", proxyJump: "user@bastion:22" });
    expect(args).toContain("-J");
    expect(args).toContain("user@bastion:22");
  });

  it("combines all options including proxyJump", () => {
    const args = sshCliArgs({
      host: "10.0.0.1",
      port: 2222,
      username: "deploy",
      identityFile: "/tmp/key",
      proxyJump: "admin@jump.example.com",
    });
    expect(args).toContain("-J");
    expect(args).toContain("admin@jump.example.com");
    expect(args).toContain("-p");
    expect(args).toContain("2222");
    expect(args).toContain("-l");
    expect(args).toContain("deploy");
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/key");
  });
});

describe("resolveSshKey", () => {
  const tmpDir = path.join(os.tmpdir(), "ssh-test-" + Date.now());
  const sshKeysDir = path.join(tmpDir, "ssh-keys");

  beforeEach(() => {
    mkdirSync(sshKeysDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when no ssh-keys directory", () => {
    const emptyDir = path.join(os.tmpdir(), "no-keys-" + Date.now());
    const result = resolveSshKey(emptyDir);
    expect(result).toBeUndefined();
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("finds private key in ssh-keys/", () => {
    writeFileSync(path.join(sshKeysDir, "id_ed25519"), "fake-key");
    writeFileSync(path.join(sshKeysDir, "id_ed25519.pub"), "fake-pub");
    const result = resolveSshKey(tmpDir);
    expect(result).toBe(path.join(sshKeysDir, "id_ed25519"));
  });

  it("ignores .pub files and dotfiles", () => {
    writeFileSync(path.join(sshKeysDir, "mykey.pub"), "pub");
    writeFileSync(path.join(sshKeysDir, ".hidden"), "secret");
    const result = resolveSshKey(tmpDir);
    expect(result).toBeUndefined();
  });

  it("prefers non-pub key over .pub", () => {
    writeFileSync(path.join(sshKeysDir, "deploy-key.pub"), "pub");
    writeFileSync(path.join(sshKeysDir, "deploy-key"), "private");
    const result = resolveSshKey(tmpDir);
    expect(result).toContain("deploy-key");
    expect(result).not.toContain(".pub");
  });
});
