# Watermelon: PRD

Status: prototype shipped, **user value unvalidated**. Everything under "Evidence" is measured on synthetic data; everything under "Hypotheses" is not yet tested.

## Problem
Program status labels are self-reported and optimistic. The costly failure is the **watermelon**: a green update whose own text describes a blocked vendor, a missed date, or a lost team. Reviewers reading dozens of updates a week miss some, and the miss surfaces weeks later as a surprise escalation.

## Who has the problem (hypotheses, not findings)
| Persona | Job to be done | Today they... | Why Watermelon might win | How we'd know |
|---|---|---|---|---|
| **TPM / program lead** (primary) | "Tell me which of these 40 updates I must read first" | Read every update; rely on colour labels; ask a chat LLM ad hoc | One call, ~150 ms, ~$0.00003, thresholdable probabilities, no prompt to maintain | Reviewer agreement rate; do they change what they read first? |
| **Director / VP** | "Give me a trustworthy exception list" | Trust TPM summaries | Consistent, auditable criteria across teams | Would they act on a Watermelon flag without re-reading? |
| **Engineer evaluating Jev** | "Show me a real typed-decision app with an honest eval" | Read the docs, build a toy | Worked example: thresholds as policy, held-out set, failure modes, cost/latency | Repo stars, forks, questions; feedback quotes |

Alternatives a user has today: read everything; enforce a stricter status template (Jira fields instead of prose); paste into a general chat model; do nothing. **The strongest alternative is a stricter template**, which removes the ambiguity at the source. Watermelon is the option for teams that can't change how updates are written.

## Why Jev
A fast, typed, repeated judgment over short text. One call returns calibrated probabilities across several questions in about 150 ms for about $0.00003. Output tokens are free, so more questions cost almost nothing. A generative model adds latency, cost and a parsing step for the same answer and gives no per-question probability to threshold on. Measured against the best free Groq model we tried (`qwen3.8-27b`) on the same 50 updates: about 11x cheaper ($0.027 vs $0.313 per 1,000), 1.5x faster at p50, 11/13 vs 9/13 watermelons caught and 83% vs 50% escalation recall, but **less accurate on overall health (77% vs 85%)** and lower escalation precision (63% vs 100%). The case for Jev is cost, speed and thresholdable probabilities, not raw accuracy (untuned prompt; see README caveats).

## Solution
Paste an update, get six typed Jev judgments in one call, combine them with facts parsed by code, and produce a decision: **escalate / human review / no action**, with a claimed-vs-actual view. Available as a web page, a CLI (exit code 3 on a watermelon, so it can gate a pipeline) and a JSON API.

## Metrics
| Level | Metric | Target | Status |
|---|---|---|---|
| **Outcome** (the point) | True-red updates surfaced before the next weekly cycle | needs a real baseline | **Not measurable yet** |
| **Quality** | Watermelon recall | >= 85% | 11/13 on 50 synthetic |
| **Quality** | False watermelon rate on honest updates | <= 5% | 0/34 on synthetic |
| **Trust** | Reviewer agreement ("was this call right?") | >= 75% after 30 real votes | 0 votes so far |
| **Guardrail** | p95 latency / cost per 1,000 | < 500 ms / < $0.10 | 308 ms / $0.027 |

The outcome metric is the honest gap: everything I can measure is a proxy for it.

## Decisions and trade-offs
- **A miss costs more than a false alarm.** Assumed 10:1, which is *not* derived from data. Escalate at `noul >= 0.2` with a human-review band from 0.1. Held-out recall at that cut-off was 71% vs 91% on the tuning set, so it is a starting point.
- **Code does arithmetic, Jev does language,** because Jev's docs describe date and maths as weak spots.
- **Unclear routes to a human.** The design intends it; measured 0/2 on the thin updates, so it is a known gap.
- **No storage of update text by default.** Zero retention keeps a public demo safe to share; the cost is no trend view and no re-labelling unless a reviewer opts in.

## Launch gates and kill criteria
- **Ship to a real team (private) only if:** >= 30 votes from >= 3 distinct reviewers, agreement >= 75%, and the threshold re-tuned on those human labels.
- **Stop or rethink if:** agreement < 60% after 30 votes (the labelling premise is wrong), or reviewers say a stricter status template would serve them better (the alternative wins).
- **Do not expand scope** (integrations, trends, accounts) until an outcome metric exists.

## Risks
| Risk | Mitigation |
|---|---|
| Authors learn to game the wording | Code-extracted facts are model-independent; the spin score is shown, not thresholded |
| Prompt injection inside an update | Tested (1 probe); Jev only emits typed answers. Small sample |
| Threshold overfits my 30 examples | Held-out set run; re-tune on human votes is the next step |
| Sensitive text pasted into a public demo | Not stored by default, footer warning, rate limit |
| The synthetic set flatters the model | Stated in README; human votes replace it |

## Rollout
1. Public demo with synthetic samples and a vote button. 2. Collect >= 30 real votes; re-tune. 3. Private pilot with one team's real updates. 4. CLI / Action in a team's update channel.

## Not doing (yet)
Accounts, history, Jira/Slack integration, multi-language, cross-week trend detection.
