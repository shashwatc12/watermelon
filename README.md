# 🍉 Watermelon

**Green on the outside, red on the inside.** Paste a weekly program status update. [Jev](https://madewithjev.com) (TypeSafe AI's System One model) reads the language, plain code reads the numbers, and Watermelon tells you whether the status label matches the facts and whether anyone needs to act.

**[Live demo](https://watermelon.shashwatchavan.com)** · [Eval report](evals/REPORT.md) · [PRD](docs/PRD.md) · [Threshold reasoning](docs/THRESHOLDS.md)

![Watermelon catching a green-labelled update that describes a blocked vendor](docs/screenshot.png)

## Who this is for

| | |
|---|---|
| **Primary: TPMs and program leads** who triage dozens of weekly updates and need to know which to read first. | The expensive failure is the update labelled *green* whose own text describes a blocked vendor and a missed date. |
| **Secondary: engineers evaluating Jev** and looking for a worked example of typed decisions, thresholds as policy, and a small honest eval. | Everything here is small and readable: the model call, the eval, the failure modes, and the limits. |
| **Not for** a single update you can simply read, or for judging whether a program is *actually* healthy. | It judges the *wording of an update* against its own label. It cannot see the program. |

**This audience is a hypothesis, not a finding.** I have not interviewed anyone. The "was this call right?" vote on the live demo is how it gets tested: see [Closing the loop](#closing-the-loop-reviewer-votes).

## Try it (pick one, none needs an account)

**1. Live demo.** Open the link above, click *Vendor watermelon*, then *Cut it open*.

**2. Run it locally.** Node 22+, no dependencies to install, no Cloudflare, no signup:

```bash
git clone https://github.com/shashwatc12/watermelon && cd watermelon
npm start                      # http://127.0.0.1:8787, MOCK mode: a badged keyword stand-in, no Jev call
```

To use real Jev, put your key in `.env` (copy [.env.example](.env.example)) or export it, then restart:

```bash
echo 'TYPESAFE_API_KEY=your-key' > .env    # .env is gitignored
npm start
```

**3. Command line.** Same engine, scriptable. Exit code `3` means a watermelon, so it can gate a pipeline:

```bash
node bin/watermelon.js update.md          # or:  cat update.md | node bin/watermelon.js -   (add --json for machine output)
# WATERMELON: claims green, facts support red  ->  escalate
```

Without a key, every path runs in mock mode and says so. Mock numbers are never used in the results below. Getting a Jev key: [docs.typesafe.ai](https://docs.typesafe.ai/introduction/quickstart).

Reviewer votes are opt-in for self-hosters: set `FEEDBACK_SECRET` to any random string and votes are appended to `data/votes.jsonl`. Exposing the server beyond your machine: `HOST=0.0.0.0 npm start` (this also turns on rate limiting).

**Cloudflare Workers** is a supported host, not a requirement: `npm run dev:cf` / `npm run deploy:cf`, then `npx wrangler secret put TYPESAFE_API_KEY` and `FEEDBACK_SECRET`. It uses a Durable Object for votes. `wrangler.production.jsonc` binds the author's own domain; ignore it.

## The decision Jev makes

Watermelon asks Jev six typed questions in **one call** and compares the answer with the label the author claimed.

| Question | Jev type | Why this type |
|---|---|---|
| Health the facts support (green / yellow / red / unclear) | choice | Bounded options, plus an explicit `unclear` exit for thin updates |
| Blocked on another team or decision | noul | One yes/no judgment |
| Committed date slipped | noul | One yes/no judgment |
| Needs exec attention now | noul | The escalation signal; thresholded by policy |
| How much the wording downplays problems | score (0–2) | Ordered scale: candid, softened, downplayed |
| Dominant risk | choice | schedule / scope / resourcing / technical / none |

## How it works

```
                 ┌──────────── portable core (Request → Response, no platform APIs) ────────────┐
 browser / CLI ─▶│ extract.js  code: claimed label, "N weeks late" → days                       │
                 │ jev.js      ONE Jev call, six questions (the only network seam)              │
                 │ verdict.js  Jev answers + facts + POLICY → watermelon?, action               │
                 │ receipt.js  signs the verdict so a later vote can't misreport it             │
                 └──────────────────────────────────────────────────────────────────────────────┘
   hosts:   server.js (Node, JSONL votes)          src/worker.js (Cloudflare, Durable Object votes)
```

- **Code reads numbers, Jev reads language.** Jev's docs say it is unreliable with dates and arithmetic, so `extract.js` parses "3 weeks late" and `verdict.js` floors health at yellow (7+ days) or red (21+ days). The UI shows when code overrode Jev.
- **Thresholds are policy, not model output.** `POLICY` in [src/verdict.js](src/verdict.js) escalates at `noul >= 0.2` with a human-review band from `0.1`. Why: [docs/THRESHOLDS.md](docs/THRESHOLDS.md).
- **Portable by construction.** `src/app.js` is the whole app as a standard `Request → Response` handler. Only `src/worker.js`, `src/feedback.js` and `wrangler*.jsonc` are Cloudflare-specific; only `server.js` and `src/node-store.js` are Node-specific. There are no runtime dependencies.
- **No accounts, no update storage.** The API key lives only in the host's environment. Upstream error bodies are never forwarded.

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

Six extra probes of Jev's documented weak spots (date arithmetic, double negative, prompt injection, numbers-only prose, terse red, good news in a bad tone) all came out right ([evals/failure-modes.json](evals/failure-modes.json)). Six probes is a smoke test, not a proof. Live deployment check (10 sequential requests): p50 175 ms, p95 276 ms, about $0.000028 per request.

### Jev vs an LLM (same 50 updates)

Same labelled updates, same six questions, one call each. LLMs are Groq-hosted `gpt-oss` models at temperature 0, JSON mode, low reasoning effort, one plain-language prompt ([evals/compare.mjs](evals/compare.mjs)). Latency is wall clock from a laptop; cost uses Groq's published prices.

| System | Health acc | Watermelons caught | False alarms | Escalate precision / recall | p50 / p95 ms | Cost per 1,000 |
|---|---|---|---|---|---|---|
| Jev (jev-1.13.0) + code rules | 77% | 11/13 | 0/34 | 63% / 83% | 142 / 286 | $0.0272 |
| openai/gpt-oss-120b (LLM alone) | 66% | 1/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-120b + code rules | 72% | 3/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-20b (LLM alone) | 68% | 0/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |
| openai/gpt-oss-20b + code rules | 74% | 3/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |

- Jev catches 11 of 13 watermelons. The LLMs catch 0 to 3, even with the same code rules: they rarely disagree with an author's "green" and they under-escalate (44 to 50% recall), though with no false alarms.
- Jev was about 2 to 3 times faster and 1.6 to 3.6 times cheaper per update. The LLMs' escalation precision (100%) beats Jev's (63%): Jev's cut-off is tuned toward recall.
- **Fairness caveat:** one untuned prompt at low reasoning effort. A better prompt would likely close part of the gap, at more cost and latency. Jev's cut-off was tuned on the first 30 updates, and its numbers include the code rules. A first comparison, not a leaderboard.

### What I learned about Jev

1. **Jev under-calls severity.** Alone it labelled 7 of 12 truly-red updates *yellow*. The `escalate` noul carried the signal better than the `health` choice.
2. **noul probabilities run low.** Escalation-worthy updates often scored 0.2-0.3, not 0.9. A naive 0.5 cut-off would have missed 6 of 11. The sweep puts the cost-minimising cut-off at 0.1-0.2, so policy uses 0.2 with a review band below it.
3. **Calibration is decent at the extremes.** In the pooled escalate and blocked bins, "0.8-1.0" was right 10/10 and "0.0-0.2" was right 32/33. The middle is sparse and noisy at n=30.
4. **One call, six judgments is nearly free.** Output is free and input is $0.042 per million tokens, so a sixth question costs a rounding error. The design leans on that: many narrow questions, not one broad one.
5. **The `spin` score separates the classes weakly** (mean 1.06 on watermelons vs 0.44 on honest updates). A useful signal to show, not something to threshold on.

## Closing the loop: reviewer votes

The threshold above was tuned on updates I wrote and labelled myself, which is the weakest part of the evidence. The live demo asks every visitor **"was this call right?"** and records the vote against what Jev actually answered, so the threshold can be re-tuned on human judgements instead of mine.

- Each result is signed into a **receipt** (HMAC-SHA256 over the verdict and Jev's probabilities, [src/receipt.js](src/receipt.js)). The browser returns it with the vote, so a vote can never claim a verdict Jev did not produce.
- The pasted update is **not stored** unless the reviewer ticks an opt-in box. A vote without it still records the verdict, probabilities and comment, enough to re-tune a threshold without holding other people's internal status text.
- `GET /api/stats` is the public tally. With the owner's bearer token it also returns the rows.

## Limits (read these)

- 50 examples, all synthetic, all written by the author. A sanity check, not a benchmark.
- The threshold was tuned on the first 30. On the held-out 20, recall at 0.2 dropped from 91% to 71%: treat 0.2 as a starting point.
- Thin updates are a weak spot: on the two deliberately empty updates ("Nothing new this week"), Jev did not answer `unclear` and neither was routed to a human (0/2).
- Jev alone is not the product: the 71% → 79% lift comes from code rules. A design choice, and a stated one.
- Text only, English only. It judges the wording of an update, not the truth of the program.
- No user research yet (see above).

## Repo map

| Path | What |
|---|---|
| `src/app.js` | The portable app: routes, rate limit, receipts, votes |
| `src/jev.js`, `extract.js`, `verdict.js`, `questions.js` | Jev call, fact extraction, policy, the six questions |
| `server.js`, `bin/watermelon.js` | Node host and CLI (zero dependencies) |
| `src/worker.js`, `src/feedback.js`, `wrangler*.jsonc` | Cloudflare host (optional) |
| `evals/` | Labelled sets, runner, held-out run, Jev-vs-LLM comparison, failure probes |
| `docs/` | [PRD](docs/PRD.md), [threshold reasoning](docs/THRESHOLDS.md) |
| `tests/` | 22 tests, no key or network needed (`npm test`) |

Reproduce the numbers: `npm run eval` and `npm run eval:holdout` (need a Jev key), `node evals/compare.mjs` (needs `GROQ_API_KEY`).

## Next

Re-tune the threshold once reviewer votes accumulate · a previous-update field so slippage is measured as a delta · a tuned-prompt LLM baseline to see how much of the gap is prompting · a GitHub Action so it runs where updates already live.

MIT licensed.
