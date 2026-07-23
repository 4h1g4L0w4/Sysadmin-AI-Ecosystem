import fs from "fs";
import path from "path";

export function loadEnv(baseDir?: string): Record<string, string> {
  const env: Record<string, string> = {};
  const candidates = [
    baseDir,
    process.env.OPENCODE_DIRECTORY,
    process.cwd(),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const p = path.join(dir, ".env");
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    break;
  }
  return env;
}
