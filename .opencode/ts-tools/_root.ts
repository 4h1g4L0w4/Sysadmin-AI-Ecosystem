import { existsSync } from "fs";
import path from "path";

export function findRepoRoot(): string {
  const candidates = [
    process.env.OPENCODE_DIRECTORY,
    process.cwd(),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "AGENTS.md"))) return dir;
    let d = dir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(path.join(d, "AGENTS.md"))) return d;
      const p = path.dirname(d);
      if (p === d) break;
      d = p;
    }
  }
  return process.cwd();
}

const ROOT = findRepoRoot();

export function projectRoot(): string {
  return ROOT;
}
