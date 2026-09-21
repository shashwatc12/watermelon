import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "../src/app.js";
import { FileStore } from "../src/node-store.js";
import { loadEnv } from "../src/env.js";
import { mockAnswers } from "../src/jev.js";

const post = (path, body, headers = {}) => new Request(`http://x${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
const fakeJev = async (text) => ({ result: mockAnswers(text), latencyMs: 5 });

test("mock mode works with no key and no store, and issues no receipt", async () => {
  const app = createApp({ env: {} });
  const r = await app.handle(post("/api/assess", { state: "Status: green. Vendor is 3 weeks late and blocked." }));
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.meta.mock, true);
  assert.equal(d.receipt, null);
  assert.equal(d.verdict.watermelon, true);
  assert.equal((await (await app.handle(new Request("http://x/api/stats"))).json()).enabled, false);
});

test("full vote flow on the file store: assess -> vote -> tally, forged receipt refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wm-"));
  try {
    const store = new FileStore(join(dir, "v.jsonl"));
    const app = createApp({ env: { TYPESAFE_API_KEY: "k", FEEDBACK_SECRET: "s" }, store, jev: fakeJev });
    const a = await (await app.handle(post("/api/assess", { state: "Status: green. Blocked, launch will miss." }))).json();
    assert.ok(a.receipt);
    const ok = await app.handle(post("/api/feedback", { receipt: a.receipt, agree: true, role: "tpm", comment: "yes" }));
    assert.equal((await ok.json()).stats.n, 1);
    const bad = await app.handle(post("/api/feedback", { receipt: a.receipt + "x", agree: true }));
    assert.equal(bad.status, 400);
    const stats = await (await app.handle(new Request("http://x/api/stats"))).json();
    assert.equal(stats.n, 1);
    assert.equal(stats.watermelonAgreed, 1);
  } finally { rmSync(dir, { recursive: true }); }
});

test("pasted text is stored only with explicit opt-in", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wm-"));
  try {
    const store = new FileStore(join(dir, "v.jsonl"));
    const env = { TYPESAFE_API_KEY: "k", FEEDBACK_SECRET: "s" };
    const app = createApp({ env, store, jev: fakeJev });
    const text = "Status: green. Blocked on vendor.";
    const a = await (await app.handle(post("/api/assess", { state: text }))).json();
    await app.handle(post("/api/feedback", { receipt: a.receipt, agree: true, state: text }));            // no opt-in
    await app.handle(post("/api/feedback", { receipt: a.receipt, agree: false, state: text, shareText: true })); // opt-in
    const rows = (await store.dump()).reverse();
    assert.equal(rows[0].update_text, null);
    assert.equal(rows[1].update_text, text);
  } finally { rmSync(dir, { recursive: true }); }
});

test("owner endpoints need the bearer secret", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wm-"));
  try {
    const app = createApp({ env: { FEEDBACK_SECRET: "s" }, store: new FileStore(join(dir, "v.jsonl")) });
    assert.equal((await app.handle(post("/api/admin/reset", {}))).status, 404);
    assert.equal((await app.handle(post("/api/admin/reset", {}, { authorization: "Bearer wrong" }))).status, 404);
    assert.equal((await app.handle(post("/api/admin/reset", {}, { authorization: "Bearer s" }))).status, 200);
    const pub = await (await app.handle(new Request("http://x/api/stats"))).json();
    assert.equal(pub.rows, undefined); // public view never includes rows
  } finally { rmSync(dir, { recursive: true }); }
});

test("upstream failure is a generic 502 with no upstream body", async () => {
  const boom = async () => { const e = new Error("Jev returned 401"); e.status = 401; throw e; };
  const r = await createApp({ env: { TYPESAFE_API_KEY: "k" }, jev: boom }).handle(post("/api/assess", { state: "x" }));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: "Jev returned 401." });
});

test("env loader: real env wins, then .env, then .dev.vars; unknown keys ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "wm-"));
  try {
    writeFileSync(join(dir, ".env"), 'TYPESAFE_API_KEY="from-dotenv"\nEVIL=1\n');
    writeFileSync(join(dir, ".dev.vars"), "TYPESAFE_API_KEY=from-devvars\nFEEDBACK_SECRET=fs\nz\n");
    const files = [join(dir, ".env"), join(dir, ".dev.vars")];
    assert.deepEqual(loadEnv(files, {}), { TYPESAFE_API_KEY: "from-dotenv", FEEDBACK_SECRET: "fs" });
    assert.equal(loadEnv(files, { TYPESAFE_API_KEY: "real" }).TYPESAFE_API_KEY, "real");
  } finally { rmSync(dir, { recursive: true }); }
});

test("node server: serves the page, blocks path traversal, runs mock assessments", async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  // Hermetic: run from an empty directory so a developer's own .env/.dev.vars can't flip it out of mock mode.
  const cwd = mkdtempSync(join(tmpdir(), "wm-srv-"));
  const child = spawn(process.execPath, [new URL("../server.js", import.meta.url).pathname], {
    env: { PATH: process.env.PATH, PORT: String(port) }, cwd, stdio: "pipe",
  });
  try {
    await new Promise((res, rej) => { child.stdout.on("data", (b) => /Watermelon on/.test(b) && res()); child.on("error", rej); setTimeout(() => rej(new Error("server did not start")), 8000); });
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Watermelon/);
    for (const evil of ["/..%2f..%2fpackage.json", "/%2e%2e/server.js", "/../server.js"]) {
      const r = await fetch(base + evil);
      assert.ok(!(await r.text()).includes("createServer"), evil);
    }
    const d = await (await fetch(base + "/api/assess", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "Status: green. Blocked, 3 weeks late." }) })).json();
    assert.equal(d.meta.mock, true);
    assert.equal(d.verdict.watermelon, true);
  } finally { child.kill(); rmSync(cwd, { recursive: true }); }
});

test("mock mode: an honest green update is left alone, not sent to a human", async () => {
  const r = await createApp({ env: {} }).handle(post("/api/assess", { state: "Status: green. All good, shipped early." }));
  const d = await r.json();
  assert.equal(d.verdict.watermelon, false);
  assert.equal(d.verdict.action, "no_action");
});

// --- live comparison arm ---
import { compareModels, llmCost, LLM_MODELS } from "../src/llm.js";

const groqReply = (content, usage = { prompt_tokens: 400, completion_tokens: 100 }) =>
  async () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

test("comparison: parses a model's answer, prices it, and applies the same code rules", async () => {
  const fetchOk = groqReply('{"health":"green","blocked":false,"slipped":false,"escalate":false,"risk":"none"}');
  const [r] = await compareModels("Status: green. Vendor is 3 weeks behind.", "k", fetchOk, [LLM_MODELS[0]]);
  assert.equal(r.ok, true);
  assert.equal(r.alone.watermelon, false);       // the LLM alone accepted the "green" label...
  assert.equal(r.withRules.watermelon, true);    // ...but the same code rules Jev gets raise it to red
  assert.equal(r.withRules.actual, "red");
  assert.ok(Math.abs(r.costUsd - llmCost(LLM_MODELS[0], { prompt_tokens: 400, completion_tokens: 100 })) < 1e-12);
  assert.ok(r.costPer1000 > 0);
});
test("comparison: junk JSON degrades to 'unclear' instead of throwing", async () => {
  const [r] = await compareModels("x", "k", groqReply("not json at all"), [LLM_MODELS[0]]);
  assert.equal(r.ok, true);
  assert.equal(r.answers.health, "unclear");
});
test("comparison: one model failing (429) does not sink the other", async () => {
  let n = 0;
  const flaky = async () => (n++ === 0
    ? new Response("{}", { status: 429 })
    : new Response(JSON.stringify({ choices: [{ message: { content: '{"health":"red"}' } }], usage: {} }), { status: 200 }));
  const rs = await compareModels("x", "k", flaky);
  assert.deepEqual(rs.map((r) => r.ok).sort(), [false, true]);
  assert.equal(rs.find((r) => !r.ok).error, "busy");
});
test("/api/compare is off without a Groq key, and the compare flag follows the key", async () => {
  const off = createApp({ env: { TYPESAFE_API_KEY: "k" }, jev: fakeJev });
  assert.equal((await off.handle(post("/api/compare", { state: "x" }))).status, 503);
  const on = createApp({ env: { TYPESAFE_API_KEY: "k", GROQ_API_KEY: "g" }, jev: fakeJev,
    llmFetch: groqReply('{"health":"yellow","escalate":false}') });
  const a = await (await on.handle(post("/api/assess", { state: "Status: green. Fine." }))).json();
  assert.equal(a.compare, true);
  const c = await (await on.handle(post("/api/compare", { state: "Status: green. Fine." }))).json();
  assert.equal(c.results.length, 2);
  assert.equal((await off.handle(post("/api/assess", { state: "Status: green. Fine." })).then((r) => r.json())).compare, false);
});
test("/api/compare rejects empty and oversized input", async () => {
  const app = createApp({ env: { GROQ_API_KEY: "g" }, llmFetch: groqReply("{}") });
  assert.equal((await app.handle(post("/api/compare", { state: "  " }))).status, 400);
  assert.equal((await app.handle(post("/api/compare", { state: "x".repeat(5000) }))).status, 413);
});
test("compare is rate-limited per address", async () => {
  const app = createApp({ env: { GROQ_API_KEY: "g" }, llmFetch: groqReply('{"health":"green"}') });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await app.handle(post("/api/compare", { state: "x" }, { "cf-connecting-ip": "1.2.3.4" }))).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 429, 429]);
});
