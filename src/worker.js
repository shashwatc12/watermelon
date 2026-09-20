import { callJev, mockAnswers, costUsd } from "./jev.js";
import { extractFacts } from "./extract.js";
import { verdict } from "./verdict.js";

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

async function assess(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body must be JSON: {"state": "..."}' }, 400); }
  const state = typeof body?.state === "string" ? body.state.trim() : "";
  if (!state) return json({ error: "Missing 'state' text." }, 400);
  if (state.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 413);

  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (ip !== "local" && limited(ip)) return json({ error: "Rate limit: try again in a minute." }, 429);

  let result, latencyMs, mock = false;
  if (!env.TYPESAFE_API_KEY) {
    const started = Date.now();
    result = mockAnswers(state);
    latencyMs = Date.now() - started;
    mock = true;
  } else {
    try { ({ result, latencyMs } = await callJev(state, env.TYPESAFE_API_KEY)); }
    catch (e) { return json({ error: `Jev returned ${e.status ?? "an error"}.` }, 502); }
  }

  const facts = extractFacts(state);
  return json({
    model: result.model,
    answers: result.answers,
    facts,
    verdict: verdict(result.answers, facts),
    meta: { latencyMs, costUsd: costUsd(result.usage), inputTokens: result.usage?.input_tokens ?? 0, mock },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/assess" && request.method === "POST") return assess(request, env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
