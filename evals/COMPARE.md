# Jev vs LLM, same 50 updates

Labels as in dataset.mjs and holdout.mjs. LLMs: temperature 0, JSON mode, one call per update, same questions in plain language; gpt-oss at reasoning_effort low, Qwen in its non-thinking mode (thinking makes it fail JSON validation on Groq). Latency is wall clock from a laptop; cost from Groq's published prices. Jev escalates at noul >= 0.2 (policy tuned on the first 30, so its escalation numbers on those are optimistic); LLMs return a boolean.

| System | Health acc | Watermelons caught | False alarms | Escalate precision / recall | p50 / p95 ms | Cost per 1,000 |
|---|---|---|---|---|---|---|
| Jev (jev-1.13.0) + code rules | 77% | 11/13 | 0/34 | 63% / 83% | 142 / 286 | $0.0272 |
| openai/gpt-oss-120b (LLM alone) | 68% | 2/13 | 0/34 | 100% / 56% | 534 / 838 | $0.0979 |
| openai/gpt-oss-120b + code rules | 74% | 4/13 | 0/34 | 100% / 56% | 534 / 838 | $0.0979 |
| openai/gpt-oss-20b (LLM alone) | 68% | 1/13 | 0/34 | 100% / 50% | 341 / 636 | $0.0440 |
| openai/gpt-oss-20b + code rules | 74% | 4/13 | 0/34 | 100% / 50% | 341 / 636 | $0.0440 |
| qwen/qwen3.8-27b (LLM alone) | 83% | 9/13 | 0/34 | 100% / 50% | 211 / 341 | $0.3132 |
| qwen/qwen3.8-27b + code rules | 85% | 9/13 | 0/34 | 100% / 50% | 211 / 341 | $0.3132 |
