// Portable core: standard Request -> Response, no platform APIs. The same handler runs
// on Cloudflare Workers (src/worker.js) and plain Node (server.js). A host supplies
// `env` (secrets) and a vote `store`; everything else is shared.
import { callJev, mockAnswers, costUsd } from "./jev.js";
import { extractFacts } from "./extract.js";
import { verdict } from "./verdict.js";
import { sign, verify } from "./receipt.js";
import { compareModels } from "./llm.js";

export const MAX_CHARS = 4000;
const MAX_COMMENT = 400;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Runs one assessment. Shared by the HTTP handler and the CLI so both give identical answers.
 * `jev` is injectable so tests never touch the network.
 */
export async function assessText(state, env, jev = callJev) {
  let result, latencyMs, mock = false;
  if (!env.TYPESAFE_API_KEY) {
    const started = Date.now();
    result = mockAnswers(state);
    latencyMs = Date.now() - started;
    mock = true;
  } else {
    ({ result, latencyMs } = await jev(state, env.TYPESAFE_API_KEY));
  }
  const facts = extractFacts(state);
  const v = verdict(result.answers, facts);
  return {
    model: result.model, answers: result.answers, facts, verdict: v,
    meta: { latencyMs, costUsd: costUsd(result.usage), inputTokens: result.usage?.input_tokens ?? 0, mock },
  };
}

/**
 * @param {object} opts
 * @param {object} opts.env      { TYPESAFE_API_KEY?, FEEDBACK_SECRET? }
 * @param {object} [opts.store]  { record(v, vote), stats(), dump(), reset() }. Omit to disable feedback.
 * @param {Function} [opts.jev]  override the Jev caller (tests)
 * @param {Function} [opts.serveStatic] (request) => Response, for non-API paths
 */
export function createApp({ env, store, jev = callJev, llmFetch = fetch, serveStatic }) {
  const hits = new Map(); // best-effort per-instance limiter: a guard for a public demo, not a quota
  const limited = (ip, bucket, max = MAX_PER_WINDOW) => {
    const key = `${bucket}:${ip}`, now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    recent.push(now); hits.set(key, recent);
    return recent.length > max;
  };
  const ipOf = (request) => request.headers.get("cf-connecting-ip") || "local"; // "local" is never limited
  const feedbackOn = Boolean(store && env.FEEDBACK_SECRET);
  const isOwner = (request) => feedbackOn && request.headers.get("authorization") === `Bearer ${env.FEEDBACK_SECRET}`;

  async function assess(request) {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Body must be JSON: {"state": "..."}' }, 400); }
    const state = typeof body?.state === "string" ? body.state.trim() : "";
    if (!state) return json({ error: "Missing 'state' text." }, 400);
    if (state.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 413);
    const ip = ipOf(request);
    if (ip !== "local" && limited(ip, "assess")) return json({ error: "Rate limit: try again in a minute." }, 429);

    let out;
    try { out = await assessText(state, env, jev); }
    catch (e) { return json({ error: `Jev returned ${e.status ?? "an error"}.` }, 502); }

    // Signed so a later vote cannot misreport what Jev said. It carries no update text.
    const a = out.answers, v = out.verdict;
    const receipt = out.meta.mock || !feedbackOn ? null : await sign({
      claimed: v.claimed, actual: v.actual, watermelon: v.watermelon, action: v.action,
      pEscalate: a.escalate.noul, pBlocked: a.blocked.noul, pSlipped: a.slipped.noul,
      spin: a.spin.score ?? null, health: a.health.choice, healthConf: a.health.confidence,
      risk: a.risk.choice, lateness: out.facts.latenessDays,
    }, env.FEEDBACK_SECRET);
    return json({ ...out, receipt, compare: Boolean(env.GROQ_API_KEY) && !out.meta.mock });
  }

  // Opt-in: sends the text to a third party (Groq), so it is a separate, explicit request, tightly limited.
  async function compare(request) {
    if (!env.GROQ_API_KEY) return json({ error: "Comparison is not enabled here." }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
    const state = typeof body?.state === "string" ? body.state.trim() : "";
    if (!state) return json({ error: "Missing 'state' text." }, 400);
    if (state.length > MAX_CHARS) return json({ error: `Keep it under ${MAX_CHARS} characters.` }, 413);
    const ip = ipOf(request);
    if (ip !== "local" && limited(ip, "compare", 4)) return json({ error: "Rate limit: try again in a minute." }, 429);
    const results = await compareModels(state, env.GROQ_API_KEY, llmFetch);
    return json({ results });
  }

  async function feedback(request) {
    if (!feedbackOn) return json({ error: "Feedback is not enabled here." }, 503);
    const ip = ipOf(request);
    if (ip !== "local" && limited(ip, "vote", 6)) return json({ error: "Rate limit: try again in a minute." }, 429);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
    const payload = await verify(body?.receipt, env.FEEDBACK_SECRET);
    if (!payload) return json({ error: "That result is no longer votable. Run the check again." }, 400);
    if (typeof body?.agree !== "boolean") return json({ error: "Missing 'agree'." }, 400);
    const role = ["tpm", "engineer", "manager", "other"].includes(body?.role) ? body.role : null;
    const stats = await store.record(payload, {
      agree: body.agree, role, comment: str(body?.comment, MAX_COMMENT),
      updateText: body?.shareText === true ? str(body?.state, MAX_CHARS) : null, // kept only on explicit opt-in
    });
    return json({ ok: true, stats });
  }

  async function stats(request) {
    if (!feedbackOn) return json({ n: 0, agreed: 0, watermelonCalls: 0, watermelonAgreed: 0, enabled: false });
    if (isOwner(request)) return json({ stats: await store.stats(), rows: await store.dump() });
    return json({ ...(await store.stats()), enabled: true });
  }

  return {
    async handle(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/api/assess" && request.method === "POST") return assess(request);
      if (pathname === "/api/feedback" && request.method === "POST") return feedback(request);
      if (pathname === "/api/compare" && request.method === "POST") return compare(request);
      if (pathname === "/api/stats" && request.method === "GET") return stats(request);
      if (pathname === "/api/admin/reset" && request.method === "POST") {
        return isOwner(request) ? json({ ok: true, stats: await store.reset() }) : json({ error: "Not found" }, 404);
      }
      if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return serveStatic ? serveStatic(request) : json({ error: "Not found" }, 404);
    },
  };
}
