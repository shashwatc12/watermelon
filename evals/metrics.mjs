// Scoring shared by run.mjs (one set) and gap.mjs (tuning vs held-out). Pure functions over result rows:
// { id, tax, gold, facts, answers, verdict }.

export const RANK = { green: 0, yellow: 1, red: 2 };

// Escalation cost model: a missed escalation is assumed to cost 10x a false alarm. An assumption, not measured
// (see docs/THRESHOLDS.md and SHI-113).
export const MISS_COST = 10, FALSE_COST = 1;

// Severity weights: cost of the final health call `pred` when the facts support `gold`.
// Under-calling costs more than over-calling, and a missed red costs more than a missed yellow.
// Calling "unclear" on a coloured update sends it to a human: cheap, but not free, and slow on a real red.
// Assumptions for SHI-123, pending owner review; documented in docs/THRESHOLDS.md.
export const SEVERITY = {
  red:     { red: 0,   yellow: 2,   green: 4,   unclear: 1 },
  yellow:  { red: 0.5, yellow: 0,   green: 1,   unclear: 0.5 },
  green:   { red: 1,   yellow: 0.5, green: 0,   unclear: 0.5 },
  unclear: { red: 1,   yellow: 1,   green: 1,   unclear: 0 },
};
const worst = (gold) => Math.max(...Object.values(SEVERITY[gold]));

export const severityCost = (r) => SEVERITY[r.gold.health][r.verdict.actual];

/** Sum of severity costs over the worst possible sum: 0 = perfect, 1 = worst call on every update. */
export function severityRate(rows) {
  const cost = rows.reduce((s, r) => s + severityCost(r), 0);
  const max = rows.reduce((s, r) => s + worst(r.gold.health), 0);
  return { cost, max, rate: max ? cost / max : 0, perUpdate: rows.length ? cost / rows.length : 0 };
}

// Watermelon = claimed status is lower severity than the facts support.
export const isWatermelon = (r) => Boolean(r.facts.claimed) && r.gold.health !== "unclear" && RANK[r.gold.health] > RANK[r.facts.claimed];

export function watermelonPR(rows) {
  const flagged = rows.filter((r) => r.verdict.watermelon);
  const truth = rows.filter(isWatermelon);
  const tp = flagged.filter(isWatermelon).length;
  return { tp, flagged: flagged.length, total: truth.length, precision: flagged.length ? tp / flagged.length : null, recall: truth.length ? tp / truth.length : null };
}

export function escalationAt(rows, t, missCost = MISS_COST, falseCost = FALSE_COST) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const pred = r.answers.escalate.noul >= t, gold = r.gold.escalate;
    if (pred && gold) tp++; else if (pred && !gold) fp++; else if (!pred && gold) fn++; else tn++;
  }
  return { threshold: +t.toFixed(2), tp, fp, fn, tn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), cost: fn * missCost + fp * falseCost };
}

export function sweep(rows, { from = 0.1, to = 0.9, step = 0.1, missCost = MISS_COST, falseCost = FALSE_COST } = {}) {
  const out = [];
  for (let i = 0; from + i * step <= to + 1e-9; i++) out.push(escalationAt(rows, from + i * step, missCost, falseCost));
  return out;
}

// Lowest cost; ties go to the higher threshold (fewer alarms for the same cost).
export const bestOf = (s) => s.reduce((a, b) => (b.cost < a.cost || (b.cost === a.cost && b.threshold > a.threshold) ? b : a));

/** One row per taxonomy class: how the detector does on that kind of update. */
export function byTaxonomy(rows, policy) {
  const groups = {};
  for (const r of rows) (groups[r.tax || "untagged"] ||= []).push(r);
  return Object.entries(groups).sort().map(([tax, rs]) => {
    const scored = rs.filter((r) => r.gold.health !== "unclear");
    const wm = rs.filter(isWatermelon);
    const esc = rs.filter((r) => r.gold.escalate);
    const calm = rs.filter((r) => !r.gold.escalate);
    return {
      tax, n: rs.length,
      healthOk: `${scored.filter((r) => r.verdict.actual === r.gold.health).length}/${scored.length}`,
      unclearOk: `${rs.filter((r) => r.gold.health === "unclear" && r.verdict.actual === "unclear").length}/${rs.length - scored.length}`,
      wmCaught: `${wm.filter((r) => r.verdict.watermelon).length}/${wm.length}`,
      escMissed: `${esc.filter((r) => r.answers.escalate.noul < policy.escalateAt).length}/${esc.length}`,
      falseEsc: `${calm.filter((r) => r.answers.escalate.noul >= policy.escalateAt).length}/${calm.length}`,
      severity: severityRate(rs).rate,
    };
  });
}

/** Every update the detector got wrong, with the reason, for the failure-mode write-up. */
export function failures(rows, policy) {
  const out = [];
  for (const r of rows) {
    const why = [];
    if (r.gold.health !== r.verdict.actual) why.push(`health ${r.gold.health}->${r.verdict.actual}${r.verdict.floorApplied ? " (code floor)" : ""}`);
    if (isWatermelon(r) && !r.verdict.watermelon) why.push("watermelon missed");
    if (!isWatermelon(r) && r.verdict.watermelon) why.push("false watermelon");
    const esc = r.answers.escalate.noul >= policy.escalateAt;
    if (r.gold.escalate && !esc) why.push("escalation missed");
    if (!r.gold.escalate && esc) why.push("false escalation");
    if (why.length) out.push({ id: r.id, tax: r.tax, why, severity: severityCost(r), escalate: r.answers.escalate.noul, claimed: r.facts.claimed, lateness: r.facts.latenessDays, jev: r.answers.health.choice });
  }
  return out.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id, "en", { numeric: true }));
}
