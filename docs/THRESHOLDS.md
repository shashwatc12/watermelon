# Escalation threshold: how it was chosen

`POLICY.escalateAt` in [src/verdict.js](../src/verdict.js) is **0.2**, with a human-review band from 0.1. This is policy, not model output.

**Why not 0.5.** Jev's `noul` probabilities run low. On the 30-example tuning set, a 0.5 cut-off missed 6 of 11 updates that needed escalation.

**Cost model.** A missed escalation is assumed to cost 10 times a false alarm. The 10:1 ratio is an assumption, not measured; it should be replaced with reviewer feedback.

**Sweep on all 50 labeled updates (30 tuning + 20 held-out), real Jev:**

| threshold | TP | FP | FN | precision | recall | cost (10:1) |
|---|---|---|---|---|---|---|
| 0.1 | 18 | 22 | 0 | 0.45 | 1.00 | 22 |
| **0.2** | 15 | 9 | 3 | 0.63 | 0.83 | 39 |
| 0.3 | 11 | 2 | 7 | 0.85 | 0.61 | 72 |
| 0.4 | 10 | 2 | 8 | 0.83 | 0.56 | 82 |
| 0.5 | 9 | 0 | 9 | 1.00 | 0.50 | 90 |

**Why 0.2 and not 0.1.** 0.1 has the lowest cost but raises 22 false alarms on 50 updates, which a reviewer would stop trusting. Instead the 0.1 to 0.2 band routes to human review.

**Held-out caveat.** The threshold was first chosen on the 30 tuning examples (recall 91%). On the 20 held-out examples recall at 0.2 was 71%, and 0.3 had a lower cost there (20 vs 25). Both numbers are small-sample. Treat 0.2 as a defensible starting point, not a tuned optimum.

## Severity weights (SHI-123)

The reports also give a **severity-weighted error rate** for the final health call, because a missed red is worse than a missed yellow. Cost of the call (columns) when the facts support the row:

| facts \ call | green | yellow | red | unclear |
|---|---|---|---|---|
| red | 4 | 2 | 0 | 1 |
| yellow | 1 | 0 | 0.5 | 0.5 |
| green | 0 | 0.5 | 1 | 0.5 |
| unclear | 1 | 1 | 1 | 0 |

Under-calling costs more than over-calling. Calling "unclear" on a coloured update sends it to a human, so it is cheap but not free. The rate is total cost divided by the worst possible total: 0 is perfect, 1 is the worst call on every update. The weights are an assumption like the 10:1 ratio, set in `SEVERITY` in [evals/metrics.mjs](../evals/metrics.mjs).

## Re-tuning check (SHI-123)

[evals/GAP.md](../evals/GAP.md) (`npm run eval:gap`, no model calls) re-tunes on the tuning rows alone and scores the result on held-out. On the current 50: re-tuning picks 0.15, which narrows the held-out recall gap from −19 to −14 points but leaves precision about 9 points lower on held-out. The escalate scores of honest yellows (up to 0.42) overlap those of under-called reds (from 0.13), so no single cut-off separates them; see [evals/FAILURES.md](../evals/FAILURES.md). **Policy stays at 0.2** until the reviewed candidate cases have been run.
