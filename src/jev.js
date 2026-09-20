// The only file that talks to Jev. One call carries every question.
import { QUESTIONS, PRICE_PER_INPUT_TOKEN } from "./questions.js";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export function costUsd(usage) {
  return (usage?.input_tokens ?? 0) * PRICE_PER_INPUT_TOKEN;
}

/** Calls Jev. Returns { result, latencyMs }. Throws Error with .status on upstream failure. */
export async function callJev(state, apiKey, questions = QUESTIONS, fetchImpl = fetch) {
  const started = Date.now();
  const res = await fetchImpl(JEV_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
  });
  if (!res.ok) {
    const err = new Error(`Jev returned ${res.status}`);
    err.status = res.status; // upstream body is deliberately not attached: it may echo request details
    throw err;
  }
  return { result: await res.json(), latencyMs: Date.now() - started };
}

// Keyword stand-in so the UI and tests run without a key. Always flagged mock:true upstream.
export function mockAnswers(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  const red = has("missed", "will miss", "slip", "blocked", "escalat", "outage");
  const yellow = has("risk", "delay", "waiting", "behind");
  const health = red ? "red" : yellow ? "yellow" : "green";
  const p = { green: 0.05, yellow: 0.05, red: 0.05, unclear: 0.01 };
  p[health] = 0.9;
  const riskKey = has("engineer", "headcount", "capacity", "hiring") ? "resourcing"
    : has("scope", "requirement") ? "scope"
    : has("bug", "latency", "integration", "outage", "api") ? "technical"
    : has("date", "slip", "delay", "milestone", "launch") ? "schedule" : "none";
  const r = { schedule: 0.02, scope: 0.02, resourcing: 0.02, technical: 0.02, none: 0.02 };
  r[riskKey] = 0.92;
  const spinScore = has("minor", "small", "confident", "slightly") && (red || yellow) ? 1.6 : 0.3;
  return {
    model: "mock",
    answers: {
      health: { type: "choice", choice: health, confidence: 0.9, probabilities: p },
      blocked: { type: "noul", noul: has("blocked", "waiting on", "dependency") ? 0.9 : 0.1 },
      slipped: { type: "noul", noul: has("slip", "missed", "delay", "pushed") ? 0.9 : 0.1 },
      escalate: { type: "noul", noul: health === "red" ? 0.8 : 0.1 },
      spin: { type: "score", score: spinScore, confidence: 0.5 },
      risk: { type: "choice", choice: riskKey, confidence: 0.9, probabilities: r },
    },
    usage: { input_tokens: Math.ceil(text.length / 4) + 400, output_tokens: 0 },
  };
}
