// Zero-dependency Node host. `node server.js` (Node 22+). No Cloudflare account or wrangler needed.
//   TYPESAFE_API_KEY   real Jev calls; leave unset for mock mode
//   FEEDBACK_SECRET    enables reviewer votes (any random string; also guards /api/stats owner view)
//   PORT / HOST        default 8787 / 127.0.0.1 (loopback only; set HOST=0.0.0.0 to expose, which turns rate limiting on)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.js";
import { FileStore } from "./src/node-store.js";
import { loadEnv } from "./src/env.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

const env = loadEnv();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const exposed = host !== "127.0.0.1" && host !== "localhost";
const store = env.FEEDBACK_SECRET ? new FileStore(process.env.VOTES_FILE || "data/votes.jsonl") : undefined;

async function serveStatic(request) {
  const { pathname } = new URL(request.url);
  const rel = normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname)).replace(/^([/\\])+/, "");
  const file = resolve(join(ROOT, rel));
  if (!file.startsWith(ROOT + "/") && file !== ROOT) return new Response("Not found", { status: 404 }); // no path traversal
  try {
    return new Response(await readFile(file), { headers: { "content-type": TYPES[extname(file)] || "application/octet-stream" } });
  } catch { return new Response("Not found", { status: 404 }); }
}

const app = createApp({ env, store, serveStatic });

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) { chunks.push(c); if (chunks.reduce((n, b) => n + b.length, 0) > 64_000) break; }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    headers.delete("cf-connecting-ip"); // never trust a client-supplied address
    if (exposed) headers.set("cf-connecting-ip", req.socket.remoteAddress || "unknown");
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const response = await app.handle(new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
      method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined,
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}).listen(port, host, () => {
  console.log(`Watermelon on http://${host}:${port}`);
  console.log(env.TYPESAFE_API_KEY ? "  Jev: real calls" : "  Jev: MOCK mode (set TYPESAFE_API_KEY for real calls)");
  console.log(store ? "  Feedback: on (votes -> data/votes.jsonl)" : "  Feedback: off (set FEEDBACK_SECRET to enable)");
});
