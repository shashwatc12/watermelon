# 🍉 Watermelon

**Green on the outside, red on the inside.** Paste a weekly program status update. [Jev](https://madewithjev.com) (TypeSafe AI's System One model) reads the language, code reads the numbers, and Watermelon tells you whether the status label matches the facts, and whether anyone needs to act.

Live demo: `https://watermelon.shashwatchavan.com` · Eval: [evals/REPORT.md](evals/REPORT.md) · PRD: [docs/PRD.md](docs/PRD.md)

## The decision Jev makes

A TPM reads dozens of status updates a week. The expensive failure is the update that says *green* while describing a blocked vendor and a missed date. Watermelon asks Jev six typed questions in **one call** and compares the answer with the label the author claimed.

| Question | Jev type | Why this type |
|---|---|---|
| Health the facts support (green / yellow / red / unclear) | choice | Bounded options, plus an explicit `unclear` exit for thin updates |
| Blocked on another team or decision | noul | One yes/no judgment |
| Committed date slipped | noul | One yes/no judgment |
| Needs exec attention now | noul | The escalation signal; thresholded by policy |
| How much the wording downplays problems | score (0–2) | Ordered scale: candid, softened, downplayed |
| Dominant risk | choice | schedule / scope / resourcing / technical / none |

## Architecture

```
browser ──POST /api/assess────▶ Cloudflare Worker
                                 ├─ extract.js   code: claimed label, "N weeks late" → days
                                 ├─ jev.js       ONE Jev call, six questions (the only network seam)
                                 ├─ verdict.js   Jev answers + facts + POLICY → watermelon?, action
                                 └─ receipt.js   signs the verdict so a later vote can't misreport it
       ──POST /api/feedback───▶  └─ feedback.js  Durable Object + SQLite: reviewer votes
       ──GET  /api/stats─────▶      public tally; owner's bearer token also returns rows
```

- **Code reads numbers, Jev reads language.** Jev's docs say it is unreliable with dates and arithmetic, so `extract.js` parses "3 weeks late" and `verdict.js` floors health at yellow (7+ days) or red (21+ days). The UI shows when the code overrode Jev.
- **Thresholds are policy, not model output.** `POLICY` in [src/verdict.js](src/verdict.js) sets escalate at `noul >= 0.2` and a human-review band from `0.1`. See below for why 0.2.
- **No accounts.** The assessment path is a stateless Worker; a Durable Object holds only reviewer votes. The API key exists only as a Worker secret; upstream error bodies are never forwarded.
- **Runs without a key.** With no `TYPESAFE_API_KEY` the Worker uses a keyword stand-in and the UI shows a "mock mode" badge, so a clone works immediately. Mock numbers are never used in the report.

## Results (real Jev `jev-1.13.0`)

Labels were written from scenario facts *before* the text was rendered, never from the wording. The 20-example held-out set was written after the policy was fixed and never used to tune it. Full method and tables: [evals/REPORT.md](evals/REPORT.md), [evals/REPORT.holdout.md](evals/REPORT.holdout.md).

| Metric | Tuning set (30) | Held-out (20) |
|---|---|---|
| Watermelons caught (claimed status lower than the facts) | **7 / 8** | **4 / 5** |
| False watermelon alarms on honest updates | **0 / 20** | **0 / 14** |
| "Trust the claimed label" baseline | 0 / 8 | 0 / 5 |
| Health accuracy: Jev + code rules (Jev alone on tuning set: 71%) | 79% | 74% |
| Escalation recall at the 0.2 policy threshold | 91% | 71% |
| Latency p50 / p95 (one call, six questions) | 141 / 283 ms | 154 / 308 ms |
| Cost per 1,000 updates | $0.027 | $0.027 |

Six extra probes of Jev's documented weak spots (date arithmetic, double negative, prompt injection, numbers-only prose, terse red, good news in a bad tone) all came out right ([evals/failure-modes.json](evals/failure-modes.json)). Six probes is a smoke test, not a proof.

Live deployment check (10 sequential requests to the deployed Worker, server-side Jev call time): p50 175 ms, p95 276 ms, about $0.000028 per request. The public rate limit is 12 requests a minute per IP, so the bench uses 10.

Threshold reasoning and the full sweep: [docs/THRESHOLDS.md](docs/THRESHOLDS.md).

## Jev vs an LLM (same 50 updates)

Same labeled updates, same six questions, one call each. LLMs are Groq-hosted `gpt-oss` models at temperature 0, JSON mode, low reasoning effort, with one plain-language prompt (see [evals/compare.mjs](evals/compare.mjs)). Latency is wall clock from a laptop. Cost uses Groq's published prices.

| System | Health acc | Watermelons caught | False alarms | Escalate precision / recall | p50 / p95 ms | Cost per 1,000 |
|---|---|---|---|---|---|---|
| Jev (jev-1.13.0) + code rules | 77% | 11/13 | 0/34 | 63% / 83% | 142 / 286 | $0.0272 |
| openai/gpt-oss-120b (LLM alone) | 66% | 1/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-120b + code rules | 72% | 3/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-20b (LLM alone) | 68% | 0/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |
| openai/gpt-oss-20b + code rules | 74% | 3/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |

Read this carefully:
- Jev catches 11 of 13 watermelons. The LLMs catch 0 to 3, even with the same code rules. They rarely disagree with an author's "green" and they under-escalate (44 to 50% recall), though with no false alarms.
- Jev was about 2 to 3 times faster and 1.6 to 3.6 times cheaper per update.
- The LLMs' escalation precision is 100%, higher than Jev's 63%. Jev's escalation is tuned toward recall.
- Fairness caveat: this is one untuned prompt and low reasoning effort. A better prompt or higher reasoning effort would likely close part of the gap, at more cost and latency. Jev's escalation cut-off was tuned on the first 30 updates, and Jev's numbers include the code rules. Treat this as a first comparison, not a leaderboard.

## Closing the loop: reviewer votes

The escalation threshold above was tuned on updates I wrote and labelled myself, which is the weakest part of the
evidence. The live site asks every visitor **“was this call right?”** and records the vote against what Jev actually
answered, so the threshold can be re-tuned on human judgements instead of mine.

- The Worker signs each result into a **receipt** (HMAC-SHA256 over the verdict and Jev's probabilities, see
  [src/receipt.js](src/receipt.js)). The browser hands the receipt back with the vote, so a vote can never claim a
  verdict Jev did not produce, and the server never has to trust client-sent model output.
- Votes land in a **Durable Object with SQLite** ([src/feedback.js](src/feedback.js)). Only feedback submissions reach
  it, never assessments, so a single instance is the right coordination atom at this volume.
- **The pasted update is not stored** unless the reviewer explicitly ticks the opt-in box. A vote without it still
  records the verdict, the probabilities and the comment — enough to re-tune a threshold, without holding other
  people's internal status text by default.
- `GET /api/stats` returns the public tally. The same endpoint with the owner's bearer token returns the rows,
  including comments.

Once enough votes are in, the sweep in [docs/THRESHOLDS.md](docs/THRESHOLDS.md) gets re-run against real labels and
the policy moves. That re-tune, not the current 0.2, is the point of shipping this.

## What I learned about Jev

1. **Jev under-calls severity.** Alone it labeled 7 of 12 truly-red updates *yellow*. The `escalate` noul carried the signal better than the `health` choice.
2. **noul probabilities run low.** Escalation-worthy updates often scored 0.2–0.3, not 0.9. Using a naive 0.5 cut-off would have missed 6 of 11. The threshold sweep in the report puts the cost-minimizing cut-off at 0.1–0.2, so the policy uses 0.2 with a review band below it.
3. **Calibration is decent at the extremes.** In the pooled escalate and blocked bins, "0.8–1.0" was right 10/10 and "0.0–0.2" was right 32/33. The middle is sparse and noisy at n=30. Do not read more into it.
4. **One call, six judgments is nearly free.** Output is free and input is $0.042 per million tokens, so adding a sixth question costs a rounding error. The design leans on that: many narrow questions, not one broad one.
5. **The `spin` score separates the classes weakly** (mean 1.06 on watermelons vs 0.44 on honest updates). Useful as a signal to show, not something I would threshold on.

## Limits (read these)

- 50 examples in total, all synthetic, all written by the author. This is a sanity check, not a benchmark.
- The escalation threshold was tuned on the first 30. On the held-out 20, recall at that threshold dropped from 91% to 71%, so treat 0.2 as a starting point.
- Thin updates are a weak spot: on the two deliberately empty updates ("Nothing new this week"), Jev did not answer `unclear` and neither was routed to a human (0/2). The `unclear` exit exists in the design but did not fire here.
- Text only, English only. It judges the wording of an update, not the truth of the program.
- Jev alone is not the whole product: the 71% → 79% lift comes from code rules. That is a design choice, and a stated one.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # add TYPESAFE_API_KEY, or leave empty for mock mode
npm run dev                      # http://localhost:8787
npm test                         # unit tests, no key needed
npm run eval                     # real Jev (needs key); npm run eval:mock for the stand-in
node evals/failure-modes.mjs     # probes of Jev's weak spots
npm run bench -- https://<your-url> 20
```

Deployed secrets: `TYPESAFE_API_KEY` (required for real Jev) and `FEEDBACK_SECRET` (a random 32-byte hex string;
signs receipts and guards the owner-only endpoints). Set each with `npx wrangler secret put <NAME>`.

Deploy: `npx wrangler deploy`, then `npx wrangler secret put TYPESAFE_API_KEY` (paste the value at the prompt). Never commit `.dev.vars`.

## Next

Re-tune the threshold once reviewer votes accumulate · a previous-update field so slippage is measured as a delta · a tuned-prompt LLM baseline to test how much of the gap is prompting · a CLI / GitHub Action so it runs where updates already live.
