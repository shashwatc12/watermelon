// Head-to-head: Jev vs Groq-hosted LLMs on the SAME 50 labeled updates (30 tune + 20 held-out).
// Prices are Groq's published on-demand prices at time of writing (console.groq.com/docs/models).
//   node evals/compare.mjs            needs GROQ_API_KEY in env or .dev.vars, and evals/results*.json from `npm run eval`
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DATASET } from "./dataset.mjs";
import { HOLDOUT } from "./holdout.mjs";
import { extractFacts } from "../src/extract.js";
import { verdict } from "../src/verdict.js";

const loadKey = (name) => {
  if (process.env[name]) return process.env[name];
  const line = existsSync(".dev.vars") && readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
};
const key = loadKey("GROQ_API_KEY");
if (!key) { console.error("No GROQ_API_KEY."); process.exit(1); }

const MODELS = [
  { id: "openai/gpt-oss-120b", inPer1M: 0.15, outPer1M: 0.60 },
  { id: "openai/gpt-oss-20b", inPer1M: 0.075, outPer1M: 0.30 },
];
const SET = [...DATASET, ...HOLDOUT];
const RANK = { green: 0, yellow: 1, red: 2 };

const PROMPT = `You judge weekly program status updates. Return ONLY a JSON object with these keys:
"health": one of "green","yellow","red","unclear" (the health the FACTS support, whatever label the author claims; green=on track, yellow=some risk/slip but recoverable without help, red=off track/blocked/date will be missed, unclear=too little information),
"blocked": true/false (blocked waiting on another team, vendor or decision),
"slipped": true/false (a committed date or milestone has slipped or will slip),
"escalate": true/false (needs executive or cross-org attention now),
"risk": one of "schedule","scope","resourcing","technical","none".
Update:
`;

async function ask(model, text) {
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: model.id, temperature: 0, reasoning_effort: "low",
        response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + text }] }),
    });
    if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Groq ${model.id} ${res.status}`);
    const d = await res.json();
    let out; try { out = JSON.parse(d.choices[0].message.content); } catch { out = null; }
    return { out, latencyMs: Date.now() - t0, usage: d.usage };
  }
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function score(rows, label) {
  const scored = rows.filter((r) => r.gold.health !== "unclear");
  const okHealth = scored.filter((r) => r.health === r.gold.health).length;
  const isWm = (r) => r.facts.claimed && r.gold.health !== "unclear" && RANK[r.gold.health] > RANK[r.facts.claimed];
  const wm = rows.filter(isWm), honest = rows.filter((r) => r.facts.claimed && r.gold.health !== "unclear" && !isWm(r));
  const flag = (r) => r.health !== "unclear" && r.facts.claimed && RANK[r.health] > RANK[r.facts.claimed];
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) { if (r.escalate && r.gold.escalate) tp++; else if (r.escalate) fp++; else if (r.gold.escalate) fn++; }
  const lat = rows.map((r) => r.latencyMs);
  return { label, n: rows.length, healthAcc: okHealth / scored.length, wmCaught: `${wm.filter(flag).length}/${wm.length}`,
    wmFalse: `${honest.filter(flag).length}/${honest.length}`, escPrecision: tp / (tp + fp || 1), escRecall: tp / (tp + fn || 1),
    escTP: tp, escFP: fp, escFN: fn, p50: q(lat, 0.5), p95: q(lat, 0.95), avgCost: rows.reduce((s, r) => s + r.cost, 0) / rows.length };
}

const results = [];
// Jev rows come from the saved eval runs; escalation uses the policy (>=0.2) and health uses Jev + code rules.
const jevRows = [];
for (const f of ["results.json", "results.holdout.json"]) {
  for (const r of JSON.parse(readFileSync(new URL(f, import.meta.url))).rows) {
    jevRows.push({ gold: r.gold, facts: r.facts, health: r.verdict.actual, escalate: r.answers.escalate.noul >= 0.2,
      latencyMs: r.latencyMs, cost: r.costUsd });
  }
}
results.push(score(jevRows, "Jev (jev-1.13.0) + code rules"));

for (const m of MODELS) {
  const rows = [];
  const queue = [...SET];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const ex = queue.shift();
      const { out, latencyMs, usage } = await ask(m, ex.text);
      const facts = extractFacts(ex.text);
      const health = ["green", "yellow", "red", "unclear"].includes(out?.health) ? out.health : "unclear";
      const cost = ((usage?.prompt_tokens ?? 0) * m.inPer1M + (usage?.completion_tokens ?? 0) * m.outPer1M) / 1e6;
      rows.push({ id: ex.id, gold: ex.gold, facts, health, escalate: out?.escalate === true, latencyMs, cost, tokens: usage });
    }
  }));
  results.push(score(rows, `${m.id} (LLM alone)`));
  // Same code rules applied on top, for a fair Jev-vs-LLM comparison of the hybrid.
  const withRules = rows.map((r) => {
    const a = { health: { choice: r.health }, escalate: { noul: r.escalate ? 1 : 0 } };
    return { ...r, health: verdict(a, r.facts).actual };
  });
  results.push(score(withRules, `${m.id} + code rules`));
}

writeFileSync(new URL("compare.json", import.meta.url), JSON.stringify(results, null, 2));
const f = (x) => `${(100 * x).toFixed(0)}%`;
const md = `# Jev vs LLM, same ${SET.length} updates

Labels as in dataset.mjs and holdout.mjs. LLMs: temperature 0, JSON mode, reasoning_effort low, one call per update, same questions in plain language. Latency is wall clock from a laptop; cost from Groq's published prices. Jev escalates at noul >= 0.2 (policy tuned on the first 30, so its escalation numbers on those are optimistic); LLMs return a boolean.

| System | Health acc | Watermelons caught | False alarms | Escalate precision / recall | p50 / p95 ms | Cost per 1,000 |
|---|---|---|---|---|---|---|
${results.map((r) => `| ${r.label} | ${f(r.healthAcc)} | ${r.wmCaught} | ${r.wmFalse} | ${f(r.escPrecision)} / ${f(r.escRecall)} | ${r.p50} / ${r.p95} | $${(r.avgCost * 1000).toFixed(4)} |`).join("\n")}
`;
writeFileSync(new URL("COMPARE.md", import.meta.url), md);
console.log(md);
