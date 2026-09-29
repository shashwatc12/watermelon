// Runs a labeled set through Jev and writes evals/results*.json + evals/REPORT*.md.
//   node evals/run.mjs               tuning set: dataset.mjs + reviewed candidates, real Jev
//   node evals/run.mjs --holdout     held-out set (never used to tune)
//   node evals/run.mjs --candidates  every candidate in candidates.mjs, reviewed or not (preview)
//   node evals/run.mjs --mock        keyword stand-in; numbers are NOT Jev numbers
//   node evals/run.mjs --rescore     no network: re-score the Jev answers already stored in results*.json
//                                    against the current labels and policy (e.g. after a label or metric change)
// Key from env TYPESAFE_API_KEY or .dev.vars.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DATASET } from "./dataset.mjs";
import { HOLDOUT } from "./holdout.mjs";
import { CANDIDATES } from "./candidates.mjs";
import { callJev, mockAnswers, costUsd } from "../src/jev.js";
import { extractFacts } from "../src/extract.js";
import { verdict, POLICY } from "../src/verdict.js";
import { MISS_COST, FALSE_COST, SEVERITY, isWatermelon, watermelonPR, sweep as sweepOf, bestOf, severityRate,
  byTaxonomy, failures } from "./metrics.mjs";

const MOCK = process.argv.includes("--mock");
const RESCORE = process.argv.includes("--rescore");
const HELD = process.argv.includes("--holdout");
const CAND = process.argv.includes("--candidates");
const reviewed = CANDIDATES.filter((c) => c.reviewed);
const SET = HELD ? HOLDOUT : CAND ? CANDIDATES : [...DATASET, ...reviewed];
const TAG = HELD ? "holdout" : CAND ? "candidates" : "";
const SRC = HELD ? "holdout.mjs" : CAND ? "candidates.mjs" : "dataset.mjs";
const suffix = `${TAG ? "." + TAG : ""}${MOCK ? ".mock" : ""}`;
function loadKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith("TYPESAFE_API_KEY="));
    if (line) return line.slice("TYPESAFE_API_KEY=".length).trim();
  }
  return "";
}
const key = MOCK || RESCORE ? "" : loadKey();
if (!MOCK && !RESCORE && !key) { console.error("No TYPESAFE_API_KEY. Use --mock, --rescore, or set the key."); process.exit(1); }

// --rescore reuses stored Jev answers; any case without one needs a real run first.
let stored = new Map();
if (RESCORE) {
  const file = new URL(`results${suffix}.json`, import.meta.url);
  if (!existsSync(file)) { console.error(`No ${file.pathname} to re-score. Run with a key first.`); process.exit(1); }
  stored = new Map(JSON.parse(readFileSync(file, "utf8")).rows.map((r) => [r.id, r]));
  const missing = SET.filter((ex) => !stored.has(ex.id)).map((ex) => ex.id);
  if (missing.length) { console.error(`No stored Jev answers for: ${missing.join(", ")}. Run \`npm run eval${TAG ? ":" + TAG : ""}\` with a key.`); process.exit(1); }
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");
const quantile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function runOne(ex) {
  if (MOCK) return { result: mockAnswers(ex.text), latencyMs: 0 };
  if (RESCORE) { const r = stored.get(ex.id); return { result: { answers: r.answers, model: r.model }, latencyMs: r.latencyMs, costUsd: r.costUsd }; }
  for (let attempt = 0; ; attempt++) {
    try { return await callJev(ex.text, key); }
    catch (e) { if (attempt >= 2) throw e; await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); }
  }
}

const rows = [];
const queue = [...SET];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const ex = queue.shift();
    const { result, latencyMs, costUsd: cost } = await runOne(ex);
    const facts = extractFacts(ex.text);
    rows.push({ id: ex.id, tax: ex.tax, gold: ex.gold, facts, answers: result.answers, verdict: verdict(result.answers, facts),
      latencyMs, costUsd: cost ?? costUsd(result.usage), model: result.model });
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
const isWm = isWatermelon;
const wm = rows.filter(isWm), notWm = rows.filter((r) => r.facts.claimed && r.gold.health !== "unclear" && !isWm(r));
const unclearEscalated = unclear.filter((r) => r.verdict.action === "escalate").length;
const unclearNamed = unclear.filter((r) => r.verdict.actual === "unclear").length;
const wmPR = watermelonPR(rows);
const escAtPolicy = rows.reduce((a, r) => {
  const pred = r.verdict.action === "escalate", gold = r.gold.escalate;
  a.tp += pred && gold; a.fp += pred && !gold; a.fn += !pred && gold; return a;
}, { tp: 0, fp: 0, fn: 0 });
const sev = severityRate(rows);
const taxRows = byTaxonomy(rows, POLICY);
const fails = failures(rows, POLICY);
const textOf = new Map(SET.map((ex) => [ex.id, ex.text]));
const wmCaught = wm.filter((r) => r.verdict.watermelon).length;
const wmFalse = notWm.filter((r) => r.verdict.watermelon).length;

// Escalation threshold sweep. Cost model: a missed escalation is 10x a false alarm.
const sweep = sweepOf(rows);
const best = bestOf(sweep);

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
  unclearNamedByJev: `${unclearNamed}/${unclear.length}`, unclearEscalated: `${unclearEscalated}/${unclear.length}`,
  watermelon: { caught: wmCaught, total: wm.length, falseAlarms: wmFalse, honestTotal: notWm.length, precision: wmPR.precision, recall: wmPR.recall },
  escalationAtPolicy: { ...escAtPolicy, precision: escAtPolicy.tp / (escAtPolicy.tp + escAtPolicy.fp || 1), recall: escAtPolicy.tp / (escAtPolicy.tp + escAtPolicy.fn || 1) },
  severity: { weights: SEVERITY, ...sev },
  taxonomy: taxRows,
  candidatesIncluded: HELD || CAND ? null : reviewed.map((c) => c.id),
  escalation: { missCost: MISS_COST, falseCost: FALSE_COST, best, sweep },
  calibration: bins.map((b) => ({ range: `${b.lo.toFixed(1)}-${b.hi.toFixed(1)}`, n: b.n, meanP: b.n ? b.sumP / b.n : null, observed: b.n ? b.yes / b.n : null })),
  blockedAcc: blockedOk / rows.length, riskAcc: riskOk / rows.length,
  spin: { meanOnWatermelons: spinWm, meanOnHonest: spinHonest },
  latency: MOCK ? null : { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: Math.max(...lat) },
  cost: { perUpdateUsd: per, per1000Usd: per * 1000 },
};
writeFileSync(new URL(`results${suffix}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 2));

const f = (x, d = 2) => (x == null ? "n/a" : Number(x).toFixed(d));
const md = `# Eval report${MOCK ? " (MOCK: keyword stand-in, not Jev)" : ""}

Model: \`${summary.model}\` · ${summary.n} synthetic updates${HELD ? " (HELD-OUT: written after the policy was fixed, never used to tune it)" : ""}${CAND ? " (CANDIDATES: labels not yet reviewed by the owner; not ground truth)" : ""}, labels written from scenario facts before the text (see [${SRC}](${SRC})).${!HELD && !CAND ? ` Reviewed candidates included: ${reviewed.length ? reviewed.map((c) => c.id).join(", ") : "none yet"}.` : ""}
Small set: this is a sanity check with counts shown, not a benchmark.${RESCORE ? " Re-scored from stored Jev answers (`--rescore`): no new model calls." : ""}

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | ${wmCaught}/${wm.length} (${pct(wmCaught, wm.length)}) |
| False watermelon alarms on honest updates | ${wmFalse}/${notWm.length} |
| Health accuracy, Jev alone | ${rawOk}/${scored.length} (${pct(rawOk, scored.length)}) |
| Health accuracy, Jev + code rules | ${finalOk}/${scored.length} (${pct(finalOk, scored.length)}) |
| Watermelon precision / recall | ${f(wmPR.precision)} / ${f(wmPR.recall)} (${wmPR.tp} right of ${wmPR.flagged} flagged) |
| Escalation precision / recall at policy (${POLICY.escalateAt}) | ${f(summary.escalationAtPolicy.precision)} / ${f(summary.escalationAtPolicy.recall)} (TP ${escAtPolicy.tp}, FP ${escAtPolicy.fp}, FN ${escAtPolicy.fn}) |
| Severity-weighted error rate (0 = perfect, 1 = worst) | ${f(sev.rate)} (cost ${f(sev.cost, 1)} of ${sev.max}; ${f(sev.perUpdate)} per update) |
| Thin/unclear updates routed to a human | ${unclearOk}/${unclear.length} (Jev said unclear on ${unclearNamed}; ${unclearEscalated} escalated instead of review) |
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

## By failure taxonomy
Classes are defined in [dataset.mjs](dataset.mjs). Escalation columns use the policy threshold ${POLICY.escalateAt}.

| class | n | health right | unclear named | watermelons caught | escalations missed | false escalations | severity rate |
|---|---|---|---|---|---|---|---|
${taxRows.map((t) => `| ${t.tax} | ${t.n} | ${t.healthOk} | ${t.unclearOk} | ${t.wmCaught} | ${t.escMissed} | ${t.falseEsc} | ${f(t.severity)} |`).join("\n")}

## Severity weights (cost of the final call when the facts say the row)
| facts \\ call | green | yellow | red | unclear |
|---|---|---|---|---|
${Object.entries(SEVERITY).map(([g, w]) => `| ${g} | ${w.green} | ${w.yellow} | ${w.red} | ${w.unclear} |`).join("\n")}

Assumptions, not measurements: see [docs/THRESHOLDS.md](../docs/THRESHOLDS.md).

## Every miss (${fails.length} of ${rows.length} updates)
Sorted by severity cost. \`esc\` is Jev's escalate probability; \`late\` is what code extracted, in days.

| id | class | what went wrong | cost | esc | claimed | late | update |
|---|---|---|---|---|---|---|---|
${fails.map((x) => `| ${x.id} | ${x.tax} | ${x.why.join("; ")} | ${x.severity} | ${f(x.escalate)} | ${x.claimed ?? "none"} | ${x.lateness} | ${textOf.get(x.id).replace(/\|/g, "/").slice(0, 110)}${textOf.get(x.id).length > 110 ? "…" : ""} |`).join("\n")}
`;
writeFileSync(new URL(`REPORT${suffix}.md`, import.meta.url), md);
console.log(md);
