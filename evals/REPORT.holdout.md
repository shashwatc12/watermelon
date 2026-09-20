# Eval report

Model: `jev-1.13.0` · 20 synthetic updates (HELD-OUT: written after the policy was fixed, never used to tune it), labels written from scenario facts before the text (see [holdout.mjs](holdout.mjs)).
Small set: this is a sanity check with counts shown, not a benchmark.

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | 4/5 (80%) |
| False watermelon alarms on honest updates | 0/14 |
| Health accuracy, Jev alone | 14/19 (74%) |
| Health accuracy, Jev + code rules | 14/19 (74%) |
| Thin/unclear updates routed to a human | 0/1 |
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
