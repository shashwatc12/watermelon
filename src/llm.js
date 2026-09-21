// The comparison arm: the same six judgments from a general-purpose LLM, so the app can show
// how another model would have answered and what it would have cost. Groq-hosted gpt-oss.
// Prices are Groq's published on-demand prices (console.groq.com/docs/models).
import { extractFacts } from "./extract.js";
import { verdict } from "./verdict.js";

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const LLM_MODELS = [
  { id: "openai/gpt-oss-120b", label: "gpt-oss-120b", inPer1M: 0.15, outPer1M: 0.60 },
  { id: "openai/gpt-oss-20b", label: "gpt-oss-20b", inPer1M: 0.075, outPer1M: 0.30 },
];

// One plain-language prompt covering the same questions Jev answers. Shared with evals/compare.mjs
// so the live comparison and the published numbers can never drift apart.
export const PROMPT = `You judge weekly program status updates. Return ONLY a JSON object with these keys:
"health": one of "green","yellow","red","unclear" (the health the FACTS support, whatever label the author claims; green=on track, yellow=some risk/slip but recoverable without help, red=off track/blocked/date will be missed, unclear=too little information),
"blocked": true/false (blocked waiting on another team, vendor or decision),
"slipped": true/false (a committed date or milestone has slipped or will slip),
"escalate": true/false (needs executive or cross-org attention now),
"risk": one of "schedule","scope","resourcing","technical","none".
Update:
`;

const HEALTH = ["green", "yellow", "red", "unclear"];
const RISK = ["schedule", "scope", "resourcing", "technical", "none"];

export const llmCost = (model, usage) =>
  ((usage?.prompt_tokens ?? 0) * model.inPer1M + (usage?.completion_tokens ?? 0) * model.outPer1M) / 1e6;

/** Calls one Groq model. Throws Error with .status on upstream failure (body deliberately not attached). */
export async function callGroq(state, apiKey, model, fetchImpl = fetch) {
  const started = Date.now();
  const res = await fetchImpl(GROQ_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model.id, temperature: 0, reasoning_effort: "low", max_completion_tokens: 400,
      response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + state }],
    }),
  });
  if (!res.ok) { const e = new Error(`Groq returned ${res.status}`); e.status = res.status; throw e; }
  const d = await res.json();
  let out = null;
  try { out = JSON.parse(d.choices[0].message.content); } catch { /* falls through to "unclear" */ }
  return {
    latencyMs: Date.now() - started,
    usage: d.usage,
    out: {
      health: HEALTH.includes(out?.health) ? out.health : "unclear",
      blocked: out?.blocked === true, slipped: out?.slipped === true, escalate: out?.escalate === true,
      risk: RISK.includes(out?.risk) ? out.risk : "none",
    },
  };
}

/**
 * Runs every comparison model in parallel; one model failing does not sink the others.
 * Each result carries the LLM's verdict alone AND with the same code rules Jev gets,
 * because that is the fair comparison (README explains why).
 */
export async function compareModels(state, apiKey, fetchImpl = fetch, models = LLM_MODELS) {
  const facts = extractFacts(state);
  return Promise.all(models.map(async (m) => {
    try {
      const r = await callGroq(state, apiKey, m, fetchImpl);
      const answers = { health: { choice: r.out.health }, escalate: { noul: r.out.escalate ? 1 : 0 } };
      const alone = { ...verdict(answers, { claimed: facts.claimed, latenessDays: 0 }) };
      const withRules = verdict(answers, facts);
      const cost = llmCost(m, r.usage);
      return {
        model: m.label, ok: true, answers: r.out, latencyMs: r.latencyMs,
        inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0,
        costUsd: cost, costPer1000: cost * 1000,
        alone: { actual: alone.actual, watermelon: alone.watermelon },
        withRules: { actual: withRules.actual, watermelon: withRules.watermelon },
      };
    } catch (e) {
      return { model: m.label, ok: false, error: e.status === 429 ? "busy" : "unavailable" };
    }
  }));
}
