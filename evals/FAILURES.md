# Failure modes by taxonomy class

Real Jev (`jev-1.13.0`) on the 50 labelled updates (30 tuning + 20 held-out). Re-scored from the stored
answers in `results*.json`. No new model calls, no label changed. Class definitions are in
[dataset.mjs](dataset.mjs); the full per-update tables are the "Every miss" sections of
[REPORT.md](REPORT.md) and [REPORT.holdout.md](REPORT.holdout.md); the threshold analysis is [GAP.md](GAP.md).

The 22 candidate cases in [candidates.mjs](candidates.mjs) are **not** included: they have no Jev answers
yet and their labels are awaiting owner review. The class counts below are small (1 to 21 per class). Read
them as where to look, not as rates.

| class | n | health right | watermelons caught | escalations missed | false escalations | severity rate |
|---|---|---|---|---|---|---|
| green | 10 | 10/10 | – | – | 0/10 | 0.00 |
| honest | 21 | 19/21 | – | 0/8 | 7/13 | 0.08 |
| contradicted | 9 | 6/9 | 8/9 | 1/6 | 0/3 | 0.22 |
| inflation | 4 | **0/4** | 3/4 | 2/4 | – | **0.50** |
| hedging | 3 | 2/3 named unclear | – | – | **2/3** | 0.33 |
| over-cautious | 3 | 1/3 | – | – | 0/3 | 0.33 |

## 1. Inflation: Jev reads the euphemism and settles on yellow (worst class)
Every inflation case is truly red, and Jev called all four yellow. The label is the only thing the detector
catches: it flags the watermelon (3/4) because yellow is still above the claimed green. The severity is lost,
though, and in half the cases so is the escalation.

- **w3**: "A few tests are not passing yet against the inventory service, and their team is looking into it."
  Facts: the other team has no fix on its roadmap. Jev: yellow, escalate 0.16 (under the 0.2 policy).
- **hw1**: "some downtime on the auth service… roughly two hours. We are looking into the cause." Jev: yellow,
  escalate 0.13.
- **w4** claims *yellow* for a payments outage, and Jev agrees with yellow, so it is not even flagged as a
  watermelon. This is the only watermelon missed on the tuning set.

This is the same under-calling the README already reports (Jev alone called 11 of 20 red updates yellow across both
sets), concentrated in the class where the text never states a hard fact. Code rules cannot help here,
because there is no number to extract.

## 2. Contradicted: mostly caught, with two gaps
The detector does best when the text states a falsifying fact (8/9 watermelons caught). The misses:

- **Code floor misses written-out numbers and some phrasings.** `hw2` says "four weeks later" and `extract.js`
  read 0 days (the regex wants digits). Jev still said red, so the health call survived, but escalate was
  0.17 and the escalation was missed. The same regex also misses "missed … by 10 days" (`r5`, `hr4`) and
  "slipped a month" (`hy4`). Candidate `cc2` ("three weeks") probes this on purpose.
- **Categorical facts without numbers get yellow.** `w5` "Design is paused", `hw3` "open since January and
  nobody has said who decides", and `hw4` "three of five engineers were reassigned" (claimed yellow, so not
  flagged). Jev's escalate score is high on hw3 (0.78) and hw4 (0.47), so the escalation still fires, but
  the health call is a grade too low.

## 3. Hedging: Jev sees it, the policy mis-routes it
Jev answered `unclear` on 2 of 3 fact-free updates (`u2` "Things are moving", `hu1` "Working on it").
Both still scored escalate 0.25–0.30, and `verdict.js` checks escalation *before* unclear, so the action was
**escalate**, not human review. The third (`u1` "Nothing new this week") was called green.
So the "0/3 routed to a human" in the reports is mostly a policy-ordering problem, not a reading problem.
That is SHI-109's scope; this write-up only records the evidence. A one-line change (an unclear health
routes to review, whatever the escalate score) would fix 2 of 3, but it changes the product's behaviour, so
it belongs in that issue.

## 4. Honest yellow: where the false escalations come from
7 of 13 honest updates that need no exec scored at or above the 0.2 threshold: y2 0.20, y3 0.42, y4 0.40,
hy1 0.28, hy2 0.29, hy4 0.26, hy5 0.25. These are well-written yellows ("we are estimating it now and will
bring options Thursday"). Four of the held-out yellows fall in 0.25–0.29, which alone explains most of the
held-out precision drop (0.71 to 0.50).

## 5. Why re-tuning the threshold cannot close the gap
Missed escalations score 0.13–0.17 and false escalations score 0.20–0.42. The two ranges overlap
(0.16–0.25 holds both an inflation red and several honest yellows). Any single cut-off trades one
error for the other. [GAP.md](GAP.md) shows this:

- Re-tuned on the tuning set alone, the best threshold is **0.15**. On held-out it gives recall 0.86 and
  precision 0.46, at cost 17 against 25 for the 0.2 policy. The recall gap narrows from −19 to −14 points;
  the precision gap stays around −9.
- The pick depends more on the assumed 10:1 miss/false-alarm ratio than on the data: at 3:1 or 5:1 the
  held-out set prefers 0.45 while tuning prefers 0.2. Measuring that ratio (SHI-113) matters more than
  another sweep.

**Recommendation (not applied):** leave `POLICY.escalateAt` at 0.2 until the reviewed candidates are run.
What would move the numbers is a second signal, not a new cut-off. Examples: the `spin` score or the gap
between claimed and actual health used together with escalate, or a code rule for categorical facts
("paused", "no owner", "N of M reassigned").
