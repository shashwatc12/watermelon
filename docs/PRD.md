# Watermelon: PRD (one page)

## Problem
Program status labels are self-reported and optimistic. The costly failure is the **watermelon**: a green update whose own text describes a blocked vendor, a missed date, or a lost team. Reviewers reading dozens of updates a week miss some, and the miss surfaces weeks later as a surprise escalation.

## User
A TPM / program lead who triages 20–100 weekly updates and needs to know which ones to read first. Secondary: a director who wants a trustworthy exception list.

## Why Jev
The task is a fast, typed, repeated judgment over short text: exactly what Jev's System One design is for. One call returns calibrated probabilities across several questions, in about 150 ms, for about $0.00003. A generative model would add latency, cost and a parsing step for the same answer, and could not give a per-question probability to threshold on.

## Solution
Paste an update → six typed Jev judgments in one call → code combines them with parsed facts → a decision: **escalate / human review / no action**, plus a claimed-vs-actual view.

## Success metrics
| Metric | Target | Measured (30 synthetic, n small) |
|---|---|---|
| Watermelon recall | ≥ 85% | 7/8 |
| False watermelon rate on honest updates | ≤ 5% | 0/20 |
| p95 latency | < 500 ms | 283 ms |
| Cost per 1,000 updates | < $0.10 | $0.027 |

## Decisions and trade-offs
- **Miss costs more than a false alarm.** Assumed 10:1. The threshold is set to escalate at `noul >= 0.2` with a human-review band from 0.1. Assumption, not data: tune with real reviewer feedback.
- **Code does arithmetic, Jev does language.** Because Jev is documented as unreliable with dates and maths.
- **Unclear routes to a human.** Better an explicit "can't tell" than a confident guess on a one-line update. Measured 0/2 on the eval's thin updates, so this is a known gap, not a solved problem.
- **No storage.** Zero data retention keeps the demo safe to share. Trade-off: no trend view.

## Risks
| Risk | Mitigation |
|---|---|
| Authors learn to game the wording | Facts extracted by code are model-independent; the spin score is shown, not thresholded |
| Prompt injection inside an update | Tested; Jev is not an agent and only emits typed answers. Sample size is small |
| Tuned threshold overfits the 30 examples | Stated in the README; held-out set is the first next step |
| Sensitive text pasted into a public demo | Footer warning; no logging of content; rate limit |

## Rollout
1. Public demo with synthetic samples. 2. Private run on the author's own past updates. 3. CLI / Action in a team's update channel, with reviewers marking each call right or wrong to re-tune the threshold.

## Not doing (yet)
Accounts, history, Jira/Slack integration, multi-language, trend detection across weeks.
