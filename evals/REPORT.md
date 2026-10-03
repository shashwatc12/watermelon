# Eval report

Model: `jev-1.13.0` · 30 synthetic updates, labels written from scenario facts before the text (see [dataset.mjs](dataset.mjs)). Reviewed candidates included: none yet.
Small set: this is a sanity check with counts shown, not a benchmark. Re-scored from stored Jev answers (`--rescore`): no new model calls.

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | 7/8 (88%) |
| False watermelon alarms on honest updates | 0/20 |
| Health accuracy, Jev alone | 20/28 (71%) |
| Health accuracy, Jev + code rules | 22/28 (79%) |
| Watermelon precision / recall | 1.00 / 0.88 (7 right of 7 flagged) |
| Escalation precision / recall at policy (0.2) | 0.71 / 0.91 (TP 10, FP 4, FN 1) |
| Severity-weighted error rate (0 = perfect, 1 = worst) | 0.17 (cost 11.5 of 66; 0.38 per update) |
| Thin/unclear updates routed to a human | 0/2 (Jev said unclear on 1; 1 escalated instead of review) |
| Blocked (noul>=0.5) accuracy | 90% |
| Dominant-risk accuracy | 83% |
| Latency p50 / p95 | 141 ms / 283 ms |
| Cost per 1,000 updates | $0.0272 |

Baseline: "trust the claimed status" catches 0/8 watermelons by construction.

## Health confusion (gold -> Jev)
- green->green: 7
- green->yellow: 1
- red->red: 5
- red->yellow: 7
- yellow->yellow: 8

## Escalation threshold (miss = 10x false alarm)
| threshold | TP | FP | FN | precision | recall | cost |
|---|---|---|---|---|---|---|
| 0.1 | 11 | 11 | 0 | 0.50 | 1.00 | 11 |
| 0.2 | 10 | 4 | 1 | 0.71 | 0.91 | 14 |
| 0.3 | 6 | 2 | 5 | 0.75 | 0.55 | 52 |
| 0.4 | 5 | 2 | 6 | 0.71 | 0.45 | 62 |
| 0.5 | 5 | 0 | 6 | 1.00 | 0.45 | 60 |
| 0.6 | 5 | 0 | 6 | 1.00 | 0.45 | 60 |
| 0.7 | 5 | 0 | 6 | 1.00 | 0.45 | 60 |
| 0.8 | 5 | 0 | 6 | 1.00 | 0.45 | 60 |
| 0.9 | 4 | 0 | 7 | 1.00 | 0.36 | 70 |

Lowest cost at threshold **0.1**. Current policy: escalate >= 0.2, human review from 0.1.

## Calibration (escalate + blocked pooled)
| P(yes) bin | n | mean P | observed yes rate |
|---|---|---|---|
| 0.0-0.2 | 33 | 0.10 | 0.03 |
| 0.2-0.4 | 10 | 0.27 | 0.50 |
| 0.4-0.6 | 3 | 0.47 | 0.00 |
| 0.6-0.8 | 4 | 0.67 | 0.50 |
| 0.8-1.0 | 10 | 0.93 | 1.00 |

## Spin score
Mean on watermelons: 1.08 · on honest updates: 0.43 (0 = candid, 2 = downplayed).

## By failure taxonomy
Classes are defined in [dataset.mjs](dataset.mjs). Escalation columns use the policy threshold 0.2.

| class | n | health right | unclear named | watermelons caught | escalations missed | false escalations | severity rate |
|---|---|---|---|---|---|---|---|
| contradicted | 5 | 4/5 | 0/0 | 5/5 | 0/3 | 0/2 | 0.14 |
| green | 6 | 6/6 | 0/0 | 0/0 | 0/0 | 0/6 | 0.00 |
| hedging | 2 | 0/0 | 1/2 | 0/0 | 0/0 | 1/2 | 0.50 |
| honest | 12 | 11/12 | 0/0 | 0/0 | 0/5 | 3/7 | 0.07 |
| inflation | 3 | 0/3 | 0/0 | 2/3 | 1/3 | 0/0 | 0.50 |
| over-cautious | 2 | 1/2 | 0/0 | 0/0 | 0/0 | 0/2 | 0.25 |

## Severity weights (cost of the final call when the facts say the row)
| facts \ call | green | yellow | red | unclear |
|---|---|---|---|---|
| red | 4 | 2 | 0 | 1 |
| yellow | 1 | 0 | 0.5 | 0.5 |
| green | 0 | 0.5 | 1 | 0.5 |
| unclear | 1 | 1 | 1 | 0 |

Assumptions, not measurements: see [docs/THRESHOLDS.md](../docs/THRESHOLDS.md).

## Every miss (11 of 30 updates)
Sorted by severity cost. `esc` is Jev's escalate probability; `late` is what code extracted, in days.

| id | class | what went wrong | cost | esc | claimed | late | update |
|---|---|---|---|---|---|---|---|
| r5 | honest | health red->yellow | 2 | 0.17 | red | 0 | Status: red. We missed the beta milestone by 10 days. The cause was an underestimated migration, now understoo… |
| w2 | inflation | health red->yellow | 2 | 0.24 | green | 0 | Status: on track. Minor staffing change this week: two engineers moved to a higher priority effort. We will do… |
| w3 | inflation | health red->yellow; escalation missed | 2 | 0.16 | green | 0 | Status: green. Integration testing is in progress. A few tests are not passing yet against the inventory servi… |
| w4 | inflation | health red->yellow; watermelon missed | 2 | 0.25 | yellow | 0 | Status: yellow. There was a short payments incident on Tuesday with some checkout failures. Investigation is o… |
| w5 | contradicted | health red->yellow | 2 | 0.21 | green | 0 | Status: green. Requirements are still evolving a bit, and we are aligning with legal and product on the final … |
| u1 | hedging | health unclear->green | 1 | 0.09 | green | 0 | Status: green. Nothing new this week. |
| o2 | over-cautious | health green->yellow | 0.5 | 0.07 | red | 0 | Status: red at 9am, resolved by noon. A config error broke staging deploys; it was fixed and verified. No prod… |
| u2 | hedging | false escalation | 0 | 0.30 | yellow | 0 | Status: yellow. Things are moving. Will share more when we know more. |
| y2 | honest | false escalation | 0 | 0.20 | yellow | 0 | Status: yellow. One of three engineers on the sync service is out for two weeks. We are trimming a nice-to-hav… |
| y3 | honest | false escalation | 0 | 0.42 | yellow | 0 | Status: yellow. Product added an export requirement this week that we had not sized. We are estimating it now … |
| y4 | honest | false escalation | 0 | 0.40 | yellow | 0 | Status: yellow. Load test shows p95 at 900ms against a 600ms target. We have two candidate fixes and are testi… |
