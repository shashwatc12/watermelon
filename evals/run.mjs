// Runs the labeled set through Jev and writes evals/results.json + evals/REPORT.md.
//   node evals/run.mjs          real Jev (key from env TYPESAFE_API_KEY or .dev.vars)
//   node evals/run.mjs --mock   keyword stand-in; numbers are NOT Jev numbers
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DATASET } from "./dataset.mjs";
import { callJev, mockAnswers, costUsd } from "../src/jev.js";
import { extractFacts } from "../src/extract.js";
import { verdict, POLICY } from "../src/verdict.js";

const MOCK = process.argv.includes("--mock");
function loadKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith("TYPESAFE_API_KEY="));
    if (line) return line.slice("TYPESAFE_API_KEY=".length).trim();
  }
  return "";
}
const key = MOCK ? "" : loadKey();
if (!MOCK && !key) { console.error("No TYPESAFE_API_KEY. Use --mock or set the key."); process.exit(1); }

const RANK = { green: 0, yellow: 1, red: 2 };
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");
const quantile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function runOne(ex) {
  if (MOCK) return { result: mockAnswers(ex.text), latencyMs: 0 };
  for (let attempt = 0; ; attempt++) {
    try { return await callJev(ex.text, key); }
    catch (e) { if (attempt >= 2) throw e; await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); }
  }
}

const rows = [];
const queue = [...DATASET];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const ex = queue.shift();
    const { result, latencyMs } = await runOne(ex);
    const facts = extractFacts(ex.text);
    rows.push({ id: ex.id, gold: ex.gold, facts, answers: result.answers, verdict: verdict(result.answers, facts),
      latencyMs, costUsd: costUsd(result.usage), model: result.model });
  }
}));
rows.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

// ---- metrics ----
const scored = rows.filter((r) => r.gold.health !== "unclear");
const rawOk = scored.filter((r) => r.answers.health.choice === r.gold.health).length;
const finalOk = scored.filter((r) => r.verdict.actual === r.gold.health).length;
const confusion = {};
for (const r of scored) {
  const k = `${r.gold.health}->${r.answers.health.choice}`;
  confusion[k] = (confusion[k] || 0) + 1;
}
const unclear = rows.filter((r) => r.gold.health === "unclear");
const unclearOk = unclear.filter((r) => r.verdict.action === "human_review").length;

// Watermelon = claimed status is lower severity than the facts support.
const isWm = (r) => r.facts.claimed && r.gold.health !== "unclear" && RANK[r.gold.health] > RANK[r.facts.claimed];
const wm = rows.filter(isWm), notWm = rows.filter((r) => r.facts.claimed && r.gold.health !== "unclear" && !isWm(r));
const wmCaught = wm.filter((r) => r.verdict.watermelon).length;
const wmFalse = notWm.filter((r) => r.verdict.watermelon).length;

// Escalation threshold sweep. Cost model: a missed escalation is 10x a false alarm.
const MISS_COST = 10, FALSE_COST = 1;
const sweep = [];
for (let t = 0.1; t <= 0.91; t += 0.1) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const pred = r.answers.escalate.noul >= t, gold = r.gold.escalate;
    if (pred && gold) tp++; else if (pred && !gold) fp++; else if (!pred && gold) fn++; else tn++;
  }
  sweep.push({ threshold: +t.toFixed(1), tp, fp, fn, tn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1),
    cost: fn * MISS_COST + fp * FALSE_COST });
}
const best = sweep.reduce((a, b) => (b.cost < a.cost ? b : a));

// Calibration: bin P(yes) for escalate+blocked against the gold boolean.
const bins = Array.from({ length: 5 }, (_, i) => ({ lo: i * 0.2, hi: (i + 1) * 0.2, n: 0, yes: 0, sumP: 0 }));
for (const r of rows) for (const [q, g] of [["escalate", r.gold.escalate], ["blocked", r.gold.blocked]]) {
  const p = r.answers[q].noul; const b = bins[Math.min(4, Math.floor(p / 0.2))];
  b.n++; b.sumP += p; b.yes += g ? 1 : 0;
}
const blockedOk = rows.filter((r) => (r.answers.blocked.noul >= 0.5) === r.gold.blocked).length;
const riskRows = rows.filter((r) => r.gold.risk !== "none" || true);
const riskOk = riskRows.filter((r) => r.answers.risk.choice === r.gold.risk).length;
// Does "spin" separate watermelons from honest updates?
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const spinWm = mean(wm.map((r) => r.answers.spin.score)), spinHonest = mean(notWm.map((r) => r.answers.spin.score));

const lat = rows.map((r) => r.latencyMs);
const per = mean(rows.map((r) => r.costUsd));
const summary = {
  model: rows[0]?.model, mock: MOCK, n: rows.length, policy: POLICY,
  health: { rawAcc: rawOk / scored.length, finalAcc: finalOk / scored.length, n: scored.length, confusion },
  unclearRoutedToHuman: `${unclearOk}/${unclear.length}`,
  watermelon: { caught: wmCaught, total: wm.length, falseAlarms: wmFalse, honestTotal: notWm.length },
  escalation: { missCost: MISS_COST, falseCost: FALSE_COST, best, sweep },
  calibration: bins.map((b) => ({ range: `${b.lo.toFixed(1)}-${b.hi.toFixed(1)}`, n: b.n, meanP: b.n ? b.sumP / b.n : null, observed: b.n ? b.yes / b.n : null })),
  blockedAcc: blockedOk / rows.length, riskAcc: riskOk / rows.length,
  spin: { meanOnWatermelons: spinWm, meanOnHonest: spinHonest },
  latency: MOCK ? null : { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: Math.max(...lat) },
  cost: { perUpdateUsd: per, per1000Usd: per * 1000 },
};
writeFileSync(new URL(MOCK ? "results.mock.json" : "results.json", import.meta.url), JSON.stringify({ summary, rows }, null, 2));

const f = (x, d = 2) => (x == null ? "n/a" : Number(x).toFixed(d));
const md = `# Eval report${MOCK ? " (MOCK: keyword stand-in, not Jev)" : ""}

Model: \`${summary.model}\` · ${summary.n} synthetic updates, labels written from scenario facts before the text (see [dataset.mjs](dataset.mjs)).
Small set: this is a sanity check with counts shown, not a benchmark.

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | ${wmCaught}/${wm.length} (${pct(wmCaught, wm.length)}) |
| False watermelon alarms on honest updates | ${wmFalse}/${notWm.length} |
| Health accuracy, Jev alone | ${rawOk}/${scored.length} (${pct(rawOk, scored.length)}) |
| Health accuracy, Jev + code rules | ${finalOk}/${scored.length} (${pct(finalOk, scored.length)}) |
| Thin/unclear updates routed to a human | ${unclearOk}/${unclear.length} |
| Blocked (noul>=0.5) accuracy | ${pct(blockedOk, rows.length)} |
| Dominant-risk accuracy | ${pct(riskOk, rows.length)} |
| Latency p50 / p95 | ${MOCK ? "n/a (mock)" : `${summary.latency.p50} ms / ${summary.latency.p95} ms`} |
| Cost per 1,000 updates | $${f(summary.cost.per1000Usd, 4)} |

Baseline: "trust the claimed status" catches 0/${wm.length} watermelons by construction.

## Health confusion (gold -> Jev)
${Object.entries(confusion).sort().map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Escalation threshold (miss = ${MISS_COST}x false alarm)
| threshold | TP | FP | FN | precision | recall | cost |
|---|---|---|---|---|---|---|
${sweep.map((s) => `| ${s.threshold} | ${s.tp} | ${s.fp} | ${s.fn} | ${f(s.precision)} | ${f(s.recall)} | ${s.cost} |`).join("\n")}

Lowest cost at threshold **${best.threshold}**. Current policy: escalate >= ${POLICY.escalateAt}, human review from ${POLICY.reviewAt}.

## Calibration (escalate + blocked pooled)
| P(yes) bin | n | mean P | observed yes rate |
|---|---|---|---|
${summary.calibration.map((b) => `| ${b.range} | ${b.n} | ${f(b.meanP)} | ${f(b.observed)} |`).join("\n")}

## Spin score
Mean on watermelons: ${f(spinWm)} · on honest updates: ${f(spinHonest)} (0 = candid, 2 = downplayed).
`;
writeFileSync(new URL(MOCK ? "REPORT.mock.md" : "REPORT.md", import.meta.url), md);
console.log(md);
