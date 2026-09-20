# Program Health Console

Paste a weekly program status update. [Jev](https://madewithjev.com) (TypeSafe AI's System One model) makes five typed decisions on it in a single call:

| Question | Type | Output |
|---|---|---|
| Overall health | choice | green / yellow / red, with probabilities |
| Blocked on another team or decision | noul | yes/no + confidence |
| A committed date slipped | noul | yes/no + confidence |
| Needs executive attention | noul | yes/no + confidence |
| Dominant risk | choice | schedule / scope / resourcing / technical / none |

Built for TPMs who read dozens of status updates a week and want a first-pass triage, not a summary. Jev decides; it does not write anything.

Live: https://jev.shashwatchavan.com

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars   # add TYPESAFE_API_KEY, or leave empty for mock mode
npm run dev                      # http://localhost:8787
```

With no key the Worker returns a keyword-based mock and the UI shows a "mock mode" badge. Mock output is not Jev output.

## Deploy

```sh
npx wrangler deploy
npx wrangler secret put TYPESAFE_API_KEY   # paste the key at the prompt
```

## Measure

```sh
npm run bench -- https://jev.shashwatchavan.com 20
```

Reports p50/p95 round-trip latency and average cost per call (input tokens at $0.042/M; output is free).

## Design notes

- The API key lives only in a Worker secret; the browser talks to `/api/assess`.
- Input capped at 4,000 characters; best-effort per-IP rate limit (12/min per isolate).
- Upstream error bodies are never forwarded to the client.
- Sample updates are synthetic. Don't paste confidential text: it is sent to a third-party API.
