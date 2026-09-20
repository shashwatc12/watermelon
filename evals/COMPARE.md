# Jev vs LLM, same 50 updates

Labels as in dataset.mjs and holdout.mjs. LLMs: temperature 0, JSON mode, reasoning_effort low, one call per update, same questions in plain language. Latency is wall clock from a laptop; cost from Groq's published prices. Jev escalates at noul >= 0.2 (policy tuned on the first 30, so its escalation numbers on those are optimistic); LLMs return a boolean.

| System | Health acc | Watermelons caught | False alarms | Escalate precision / recall | p50 / p95 ms | Cost per 1,000 |
|---|---|---|---|---|---|---|
| Jev (jev-1.13.0) + code rules | 77% | 11/13 | 0/34 | 63% / 83% | 142 / 286 | $0.0272 |
| openai/gpt-oss-120b (LLM alone) | 66% | 1/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-120b + code rules | 72% | 3/13 | 0/34 | 100% / 50% | 443 / 616 | $0.0984 |
| openai/gpt-oss-20b (LLM alone) | 68% | 0/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |
| openai/gpt-oss-20b + code rules | 74% | 3/13 | 0/34 | 100% / 44% | 308 / 412 | $0.0441 |
