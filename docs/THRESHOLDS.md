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
