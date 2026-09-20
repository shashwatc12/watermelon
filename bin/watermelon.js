#!/usr/bin/env node
// CLI: check a status update from a file or stdin. Zero dependencies, Node 22+.
//   watermelon update.md            human-readable verdict
//   cat update.md | watermelon -    read stdin
//   watermelon update.md --json     machine-readable
//   exit code: 0 = honest, 3 = watermelon (claimed status lower than the facts), 1 = error
import { readFileSync } from "node:fs";
import { assessText, MAX_CHARS } from "../src/app.js";
import { loadEnv } from "../src/env.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const target = args.find((a) => !a.startsWith("--"));
if (!target || args.includes("--help")) {
  console.error("usage: watermelon <file|-> [--json]\n  reads TYPESAFE_API_KEY from the environment, .env or .dev.vars; mock mode if unset.");
  process.exit(target ? 0 : 1);
}
const text = (target === "-" ? readFileSync(0, "utf8") : readFileSync(target, "utf8")).trim();
if (!text) { console.error("empty update"); process.exit(1); }
if (text.length > MAX_CHARS) { console.error(`update is ${text.length} chars; max ${MAX_CHARS}`); process.exit(1); }

try {
  const r = await assessText(text, loadEnv());
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    const v = r.verdict, a = r.answers;
    const pct = (p) => `${Math.round(p * 100)}%`;
    console.log(`${v.watermelon ? "WATERMELON" : "ok"}: claims ${v.claimed ?? "(none)"}, facts support ${v.actual}  ->  ${v.action}`);
    if (v.floorApplied) console.log(`  code raised health to ${v.floorApplied} (${r.facts.latenessDays} days late stated in the text)`);
    console.log(`  escalate ${pct(a.escalate.noul)} · blocked ${pct(a.blocked.noul)} · slipped ${pct(a.slipped.noul)} · spin ${(a.spin.score ?? 0).toFixed(2)} · risk ${a.risk.choice}`);
    console.log(`  ${r.meta.latencyMs} ms · ${r.meta.inputTokens} tokens · $${r.meta.costUsd.toFixed(6)} · ${r.model}${r.meta.mock ? "  [MOCK: no Jev call made]" : ""}`);
  }
  process.exit(r.verdict.watermelon ? 3 : 0);
} catch (e) {
  console.error(`error: ${e.status ? `Jev returned ${e.status}` : e.message}`);
  process.exit(1);
}
