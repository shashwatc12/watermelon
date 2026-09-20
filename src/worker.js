import { QUESTIONS, PRICE_PER_INPUT_TOKEN } from "./questions.js";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_CHARS = 4000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

// Best-effort per-isolate limiter. Cheap guard for a public demo, not a hard quota.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Keyword stand-in so the UI can be developed without a key. Flagged mock:true.
function mockAnswers(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  const red = has("missed", "will miss", "slip", "blocked", "escalat", "outage");
  const yellow = has("risk", "delay", "waiting", "at risk", "behind");
  const health = red ? "red" : yellow ? "yellow" : "green";
  const p = { green: 0.05, yellow: 0.05, red: 0.05 };
  p[health] = 0.9;
  const riskKey = has("engineer", "headcount", "capacity", "hiring")
    ? "resourcing"
    : has("scope", "requirement")
      ? "scope"
      : has("bug", "latency", "integration", "outage", "api")
        ? "technical"
        : has("date", "slip", "delay", "milestone", "launch")
          ? "schedule"
          : "none";
  const r = { schedule: 0.02, scope: 0.02, resourcing: 0.02, technical: 0.02, none: 0.02 };
  r[riskKey] = 0.92;
  return {
    model: "mock",
    answers: {
      health: { type: "choice", choice: health, confidence: 0.9, probabilities: p },
      blocked: { type: "noul", noul: has("blocked", "waiting on", "dependency") ? 0.9 : 0.1 },
      slipped: { type: "noul", noul: has("slip", "missed", "delay", "pushed") ? 0.9 : 0.1 },
      escalate: { type: "noul", noul: health === "red" ? 0.8 : 0.1 },
      risk: { type: "choice", choice: riskKey, confidence: 0.9, probabilities: r },
    },
    usage: { input_tokens: Math.ceil(text.length / 4) + 300, output_tokens: 0 },
  };
}

async function assess(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON: {\"state\": \"...\"}" }, 400);
  }
  const state = typeof body?.state === "string" ? body.state.trim() : "";
  if (!state) return json({ error: "Missing 'state' text." }, 400);
  if (state.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 413);

  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (ip !== "local" && limited(ip)) return json({ error: "Rate limit: try again in a minute." }, 429);

  const started = Date.now();
  let result;
  let mock = false;
  if (!env.TYPESAFE_API_KEY) {
    result = mockAnswers(state);
    mock = true;
  } else {
    const upstream = await fetch(JEV_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ state, model: "jev-latest", questions: QUESTIONS }),
    });
    if (!upstream.ok) {
      // Never forward upstream bodies verbatim; they may echo request details.
      return json({ error: `Jev returned ${upstream.status}.` }, 502);
    }
    result = await upstream.json();
  }
  const latencyMs = Date.now() - started;
  const costUsd = (result.usage?.input_tokens ?? 0) * PRICE_PER_INPUT_TOKEN;
  return json({ ...result, meta: { latencyMs, costUsd, mock } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/assess" && request.method === "POST") return assess(request, env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
