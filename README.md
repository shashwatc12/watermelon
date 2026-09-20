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
browser ──POST /api/assess──▶ Cloudflare Worker
                               ├─ extract.js   code: claimed label, "N weeks late" → days
                               ├─ jev.js       ONE Jev call, six questions (the only network seam)
                               └─ verdict.js   Jev answers + facts + POLICY → watermelon?, action
```

- **Code reads numbers, Jev reads language.** Jev's docs say it is unreliable with dates and arithmetic, so `extract.js` parses "3 weeks late" and `verdict.js` floors health at yellow (7+ days) or red (21+ days). The UI shows when the code overrode Jev.
- **Thresholds are policy, not model output.** `POLICY` in [src/verdict.js](src/verdict.js) sets escalate at `noul >= 0.2` and a human-review band from `0.1`. See below for why 0.2.
- **No database, no accounts.** Stateless Worker. The API key exists only as a Worker secret; upstream error bodies are never forwarded.
- **Runs without a key.** With no `TYPESAFE_API_KEY` the Worker uses a keyword stand-in and the UI shows a "mock mode" badge, so a clone works immediately. Mock numbers are never used in the report.

## Results (30 synthetic updates, real Jev `jev-1.13.0`)

Labels were written from scenario facts *before* the text was rendered, never from the wording. Full method and tables: [evals/REPORT.md](evals/REPORT.md).

| Metric | Result |
|---|---|
| Watermelons caught (claimed status lower than the facts) | **7 / 8** |
| False watermelon alarms on honest updates | **0 / 20** |
| "Trust the claimed label" baseline | 0 / 8 by construction |
| Health accuracy: Jev alone → Jev + code rules | 71% → 79% |
| Latency p50 / p95 (one call, six questions) | 141 ms / 283 ms |
| Cost per 1,000 updates | $0.027 |

Six extra probes of Jev's documented weak spots (date arithmetic, double negative, prompt injection, numbers-only prose, terse red, good news in a bad tone) all came out right ([evals/failure-modes.json](evals/failure-modes.json)). Six probes is a smoke test, not a proof.

## What I learned about Jev

1. **Jev under-calls severity.** Alone it labeled 7 of 12 truly-red updates *yellow*. The `escalate` noul carried the signal better than the `health` choice.
2. **noul probabilities run low.** Escalation-worthy updates often scored 0.2–0.3, not 0.9. Using a naive 0.5 cut-off would have missed 6 of 11. The threshold sweep in the report puts the cost-minimizing cut-off at 0.1–0.2, so the policy uses 0.2 with a review band below it.
3. **Calibration is decent at the extremes.** In the pooled escalate and blocked bins, "0.8–1.0" was right 10/10 and "0.0–0.2" was right 32/33. The middle is sparse and noisy at n=30. Do not read more into it.
4. **One call, six judgments is nearly free.** Output is free and input is $0.042 per million tokens, so adding a sixth question costs a rounding error. The design leans on that: many narrow questions, not one broad one.
5. **The `spin` score separates the classes weakly** (mean 1.06 on watermelons vs 0.44 on honest updates). Useful as a signal to show, not something I would threshold on.

## Limits (read these)

- 30 examples, all synthetic, all written by the author. This is a sanity check, not a benchmark.
- The escalation threshold was tuned on the same 30 examples, so its precision and recall are optimistic. A held-out set is the first thing to add.
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

Deploy: `npx wrangler deploy`, then `npx wrangler secret put TYPESAFE_API_KEY` (paste the value at the prompt). Never commit `.dev.vars`.

## Next

Held-out eval and re-tuned threshold · a previous-update field so slippage is measured as a delta · head-to-head against a frontier LLM on cost and latency · a CLI / GitHub Action so it runs where updates already live.
