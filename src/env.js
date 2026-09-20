// Loads config for Node hosts: real environment variables win, then .env, then .dev.vars
// (the Wrangler convention, accepted so existing setups keep working). Node only.
import { readFileSync, existsSync } from "node:fs";

const KEYS = ["TYPESAFE_API_KEY", "FEEDBACK_SECRET", "GROQ_API_KEY"];

export function loadEnv(files = [".env", ".dev.vars"], base = process.env) {
  const out = {};
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in out) continue;
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const env = {};
  for (const k of KEYS) { const v = base[k] || out[k]; if (v) env[k] = v; }
  return env;
}
