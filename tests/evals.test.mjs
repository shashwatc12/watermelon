import test from "node:test";
import assert from "node:assert/strict";
import { DATASET } from "../evals/dataset.mjs";
import { HOLDOUT } from "../evals/holdout.mjs";
import { CANDIDATES } from "../evals/candidates.mjs";
import { SEVERITY, severityRate, watermelonPR, escalationAt, bestOf, failures } from "../evals/metrics.mjs";

const TAX = new Set(["green", "honest", "inflation", "contradicted", "hedging", "over-cautious"]);
const HEALTH = new Set(["green", "yellow", "red", "unclear"]);

test("every labelled case has a unique id, a known taxonomy class, facts, gold and text", () => {
  const all = [...DATASET, ...HOLDOUT, ...CANDIDATES];
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  for (const c of all) {
    assert.ok(TAX.has(c.tax), `${c.id} tax`);
    assert.ok(HEALTH.has(c.gold.health), `${c.id} health`);
    assert.ok(c.facts && c.text, `${c.id} facts/text`);
  }
});
test("candidates are not ground truth until reviewed", () => {
  for (const c of CANDIDATES) assert.equal(typeof c.reviewed, "boolean", c.id);
});
test("severity weights: a missed red costs more than a missed yellow, and correct calls cost nothing", () => {
  assert.ok(SEVERITY.red.yellow > SEVERITY.yellow.green);
  assert.ok(SEVERITY.red.green > SEVERITY.red.yellow);
  for (const g of Object.keys(SEVERITY)) assert.equal(SEVERITY[g][g], 0);
});

const row = (id, gold, actual, claimed, esc = 0, goldEsc = false) => ({
  id, tax: "t", gold: { health: gold, escalate: goldEsc }, facts: { claimed, latenessDays: 0 },
  answers: { escalate: { noul: esc }, health: { choice: actual } },
  verdict: { actual, watermelon: Boolean(claimed) && actual !== "unclear" && ["green", "yellow", "red"].indexOf(actual) > ["green", "yellow", "red"].indexOf(claimed) },
});
test("severityRate is 0 when perfect and 1 when every call is the worst", () => {
  assert.equal(severityRate([row("a", "red", "red", "red")]).rate, 0);
  assert.equal(severityRate([row("a", "red", "green", "green")]).rate, 1);
});
test("watermelon precision and recall", () => {
  const pr = watermelonPR([row("a", "red", "red", "green"), row("b", "yellow", "yellow", "green"), row("c", "green", "yellow", "green")]);
  assert.deepEqual([pr.tp, pr.flagged, pr.total], [2, 3, 2]);
});
test("threshold sweep counts and ties go to the higher threshold", () => {
  const rows = [row("a", "red", "red", "red", 0.3, true), row("b", "yellow", "yellow", "yellow", 0.25)];
  const at = escalationAt(rows, 0.2);
  assert.deepEqual([at.tp, at.fp, at.fn], [1, 1, 0]);
  assert.equal(bestOf([{ threshold: 0.3, cost: 5 }, { threshold: 0.4, cost: 5 }]).threshold, 0.4);
  assert.deepEqual(failures(rows, { escalateAt: 0.2 }).map((f) => f.id), ["b"]);
});
