import { callJev, mockAnswers, costUsd } from "./jev.js";
import { extractFacts } from "./extract.js";
import { verdict } from "./verdict.js";
import { sign, verify } from "./receipt.js";
export { FeedbackLog } from "./feedback.js";

const MAX_CHARS = 4000;
const MAX_COMMENT = 400;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

// Best-effort per-isolate limiter. Cheap guard for a public demo, not a hard quota.
const hits = new Map();
function limited(ip, bucket, max = MAX_PER_WINDOW) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const log = (env) => env.FEEDBACK?.getByName("votes");
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function assess(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body must be JSON: {"state": "..."}' }, 400); }
  const state = typeof body?.state === "string" ? body.state.trim() : "";
  if (!state) return json({ error: "Missing 'state' text." }, 400);
  if (state.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 413);

  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (ip !== "local" && limited(ip, "assess")) return json({ error: "Rate limit: try again in a minute." }, 429);

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
  const v = verdict(result.answers, facts);
  const a = result.answers;
  // Signed so a later vote cannot misreport what Jev said. No update text is included.
  const receipt = mock || !env.FEEDBACK_SECRET ? null : await sign({
    claimed: v.claimed, actual: v.actual, watermelon: v.watermelon, action: v.action,
    pEscalate: a.escalate.noul, pBlocked: a.blocked.noul, pSlipped: a.slipped.noul,
    spin: a.spin.score ?? null, health: a.health.choice, healthConf: a.health.confidence,
    risk: a.risk.choice, lateness: facts.latenessDays,
  }, env.FEEDBACK_SECRET);

  return json({
    model: result.model, answers: a, facts, verdict: v, receipt,
    meta: { latencyMs, costUsd: costUsd(result.usage), inputTokens: result.usage?.input_tokens ?? 0, mock },
  });
}

async function feedback(request, env) {
  if (!env.FEEDBACK || !env.FEEDBACK_SECRET) return json({ error: "Feedback is not enabled here." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (ip !== "local" && limited(ip, "vote", 6)) return json({ error: "Rate limit: try again in a minute." }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
  const payload = await verify(body?.receipt, env.FEEDBACK_SECRET);
  if (!payload) return json({ error: "That result is no longer votable. Run the check again." }, 400);
  if (typeof body?.agree !== "boolean") return json({ error: "Missing 'agree'." }, 400);

  const role = ["tpm", "engineer", "manager", "other"].includes(body?.role) ? body.role : null;
  const stats = await log(env).record(payload, {
    agree: body.agree,
    role,
    comment: str(body?.comment, MAX_COMMENT),
    // Text is kept only when the reviewer explicitly opts in.
    updateText: body?.shareText === true ? str(body?.state, MAX_CHARS) : null,
  });
  return json({ ok: true, stats });
}

async function stats(request, env) {
  if (!env.FEEDBACK) return json({ n: 0, agreed: 0, watermelonCalls: 0, watermelonAgreed: 0 });
  const auth = request.headers.get("authorization");
  if (env.FEEDBACK_SECRET && auth === `Bearer ${env.FEEDBACK_SECRET}`) {
    return json({ stats: await log(env).stats(), rows: await log(env).dump() });
  }
  return json(await log(env).stats());
}

/** Owner-only, bearer-authenticated with FEEDBACK_SECRET. */
async function reset(request, env) {
  if (!env.FEEDBACK || !env.FEEDBACK_SECRET) return json({ error: "Not enabled." }, 503);
  if (request.headers.get("authorization") !== `Bearer ${env.FEEDBACK_SECRET}`) return json({ error: "Not found" }, 404);
  return json({ ok: true, stats: await log(env).reset() });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/assess" && request.method === "POST") return assess(request, env);
    if (pathname === "/api/feedback" && request.method === "POST") return feedback(request, env);
    if (pathname === "/api/stats" && request.method === "GET") return stats(request, env);
    if (pathname === "/api/admin/reset" && request.method === "POST") return reset(request, env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
