# Eval report

Model: `jev-1.13.0` · 30 synthetic updates, labels written from scenario facts before the text (see [dataset.mjs](dataset.mjs)).
Small set: this is a sanity check with counts shown, not a benchmark.

## Headline
| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than facts) | 7/8 (88%) |
| False watermelon alarms on honest updates | 0/20 |
| Health accuracy, Jev alone | 20/28 (71%) |
| Health accuracy, Jev + code rules | 22/28 (79%) |
| Thin/unclear updates routed to a human | 0/2 |
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
