# Eval report

Model: `jev-1.13.0` · 20 synthetic updates (HELD-OUT: written after the policy was fixed, never used to tune it), labels written from scenario facts before the text (see [holdout.mjs](holdout.mjs)).
Small set: this is a sanity check with counts shown, not a benchmark. Re-scored from stored Jev answers (`--rescore`): no new model calls.

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | 4/5 (80%) |
| False watermelon alarms on honest updates | 0/14 |
| Health accuracy, Jev alone | 14/19 (74%) |
| Health accuracy, Jev + code rules | 14/19 (74%) |
| Watermelon precision / recall | 1.00 / 0.80 (4 right of 4 flagged) |
| Escalation precision / recall at policy (0.2) | 0.50 / 0.71 (TP 5, FP 5, FN 2) |
| Severity-weighted error rate (0 = perfect, 1 = worst) | 0.19 (cost 8.5 of 44; 0.42 per update) |
| Thin/unclear updates routed to a human | 0/1 (Jev said unclear on 1; 1 escalated instead of review) |
| Blocked (noul>=0.5) accuracy | 95% |
| Dominant-risk accuracy | 90% |
| Latency p50 / p95 | 154 ms / 308 ms |
| Cost per 1,000 updates | $0.0273 |

Baseline: "trust the claimed status" catches 0/5 watermelons by construction.

## Health confusion (gold -> Jev)
- green->green: 4
- green->yellow: 1
- red->red: 4
- red->yellow: 4
- yellow->yellow: 6

## Escalation threshold (miss = 10x false alarm)
| threshold | TP | FP | FN | precision | recall | cost |
|---|---|---|---|---|---|---|
| 0.1 | 7 | 11 | 0 | 0.39 | 1.00 | 11 |
| 0.2 | 5 | 5 | 2 | 0.50 | 0.71 | 25 |
| 0.3 | 5 | 0 | 2 | 1.00 | 0.71 | 20 |
| 0.4 | 5 | 0 | 2 | 1.00 | 0.71 | 20 |
| 0.5 | 4 | 0 | 3 | 1.00 | 0.57 | 30 |
| 0.6 | 4 | 0 | 3 | 1.00 | 0.57 | 30 |
| 0.7 | 4 | 0 | 3 | 1.00 | 0.57 | 30 |
| 0.8 | 3 | 0 | 4 | 1.00 | 0.43 | 40 |
| 0.9 | 3 | 0 | 4 | 1.00 | 0.43 | 40 |

Lowest cost at threshold **0.1**. Current policy: escalate >= 0.2, human review from 0.1.

## Calibration (escalate + blocked pooled)
| P(yes) bin | n | mean P | observed yes rate |
|---|---|---|---|
| 0.0-0.2 | 20 | 0.11 | 0.10 |
| 0.2-0.4 | 10 | 0.29 | 0.00 |
| 0.4-0.6 | 2 | 0.47 | 0.50 |
| 0.6-0.8 | 1 | 0.78 | 1.00 |
| 0.8-1.0 | 7 | 0.93 | 0.86 |

## Spin score
Mean on watermelons: 0.85 · on honest updates: 0.57 (0 = candid, 2 = downplayed).

## By failure taxonomy
Classes are defined in [dataset.mjs](dataset.mjs). Escalation columns use the policy threshold 0.2.

| class | n | health right | unclear named | watermelons caught | escalations missed | false escalations | severity rate |
|---|---|---|---|---|---|---|---|
| contradicted | 4 | 2/4 | 0/0 | 3/4 | 1/3 | 0/1 | 0.31 |
| green | 4 | 4/4 | 0/0 | 0/0 | 0/0 | 0/4 | 0.00 |
| hedging | 1 | 0/0 | 1/1 | 0/0 | 0/0 | 1/1 | 0.00 |
| honest | 9 | 8/9 | 0/0 | 0/0 | 0/3 | 4/6 | 0.10 |
| inflation | 1 | 0/1 | 0/0 | 1/1 | 1/1 | 0/0 | 0.50 |
| over-cautious | 1 | 0/1 | 0/0 | 0/0 | 0/0 | 0/1 | 0.50 |

## Severity weights (cost of the final call when the facts say the row)
| facts \ call | green | yellow | red | unclear |
|---|---|---|---|---|
| red | 4 | 2 | 0 | 1 |
| yellow | 1 | 0 | 0.5 | 0.5 |
| green | 0 | 0.5 | 1 | 0.5 |
| unclear | 1 | 1 | 1 | 0 |

Assumptions, not measurements: see [docs/THRESHOLDS.md](../docs/THRESHOLDS.md).

## Every miss (11 of 20 updates)
Sorted by severity cost. `esc` is Jev's escalate probability; `late` is what code extracted, in days.

| id | class | what went wrong | cost | esc | claimed | late | update |
|---|---|---|---|---|---|---|---|
| hr4 | honest | health red->yellow | 2 | 0.14 | red | 0 | Status: red. We missed the March 3 release by 12 days after a failed load test. A fix is verified and product … |
| hw1 | inflation | health red->yellow; escalation missed | 2 | 0.13 | green | 0 | Status: green. There was some downtime on the auth service Thursday morning, roughly two hours. We are looking… |
| hw3 | contradicted | health red->yellow | 2 | 0.78 | green | 0 | Status: on track. We are pending a decision on data residency from the security council. It has been open sinc… |
| hw4 | contradicted | health red->yellow; watermelon missed | 2 | 0.47 | yellow | 0 | Status: yellow. Our team lost most of its capacity this week when three of five engineers were reassigned. We … |
| ho1 | over-cautious | health green->yellow | 0.5 | 0.19 | red | 0 | Status: red for one day only. The staging database filled up and blocked deploys for an afternoon. It was clea… |
| hu1 | hedging | false escalation | 0 | 0.25 | yellow | 0 | Status: yellow. Working on it. |
| hw2 | contradicted | escalation missed | 0 | 0.17 | green | 0 | Status: green. The mobile release is now planned for four weeks later than the original date because of an app… |
| hy1 | honest | false escalation | 0 | 0.28 | yellow | 6 | Status: yellow. Warehouse sync is 6 days behind because the schema review took longer than planned. We have re… |
| hy2 | honest | false escalation | 0 | 0.29 | yellow | 0 | Status: yellow. Sales asked for multi-currency support mid-sprint. We are sizing it and will propose either a … |
| hy4 | honest | false escalation | 0 | 0.26 | yellow | 0 | Status: yellow. The second backend hire slipped a month. We covered the gap with a contractor, so the plan is … |
| hy5 | honest | false escalation | 0 | 0.25 | yellow | 0 | Status: yellow. We are waiting on the data platform team to expose the events feed. They committed to Thursday… |
