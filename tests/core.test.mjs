import test from "node:test";
import assert from "node:assert/strict";
import { claimedStatus, latenessDays, extractFacts } from "../src/extract.js";
import { verdict, POLICY } from "../src/verdict.js";
import { mockAnswers, callJev } from "../src/jev.js";

test("claimedStatus reads explicit labels and phrases", () => {
  assert.equal(claimedStatus("Status: GREEN. All good."), "green");
  assert.equal(claimedStatus("Overall we are on-track for launch"), "green");
  assert.equal(claimedStatus("Status - amber"), "yellow");
  assert.equal(claimedStatus("Off track after the vendor slipped"), "red");
});
test("claimedStatus ignores words that merely contain a colour", () => {
  assert.equal(claimedStatus("Requirements were reduced and covered"), null);
});
test("latenessDays parses weeks and days in both phrasings", () => {
  assert.equal(latenessDays("The vendor is 2 weeks late"), 14);
  assert.equal(latenessDays("Launch slipped by 3 days"), 3);
  assert.equal(latenessDays("We are 10 days behind and 1 week late"), 10);
  assert.equal(latenessDays("No delay reported"), 0);
});

const ans = (health, escalate = 0.1) => ({
  health: { choice: health }, escalate: { noul: escalate },
});

test("watermelon: claims green, Jev says red", () => {
  const v = verdict(ans("red", 0.9), { claimed: "green", latenessDays: 0 });
  assert.equal(v.watermelon, true);
  assert.equal(v.gap, 2);
  assert.equal(v.action, "escalate");
});
test("honest red is not a watermelon", () => {
  assert.equal(verdict(ans("red"), { claimed: "red", latenessDays: 0 }).watermelon, false);
});
test("code floors health when text states real lateness", () => {
  const v = verdict(ans("green"), { claimed: "green", latenessDays: 30 });
  assert.equal(v.actual, "red");
  assert.equal(v.floorApplied, "red");
  assert.equal(v.watermelon, true);
  assert.equal(verdict(ans("green"), { claimed: "green", latenessDays: 10 }).actual, "yellow");
});
test("uncertain escalation lands in the human review band", () => {
  assert.equal(verdict(ans("yellow", 0.15), { claimed: "yellow", latenessDays: 0 }).action, "human_review");
  assert.equal(verdict(ans("green", 0.03), { claimed: "green", latenessDays: 0 }).action, "no_action");
});
test("unclear health always routes to a human", () => {
  const v = verdict(ans("unclear", 0.0), { claimed: null, latenessDays: 0 });
  assert.equal(v.actual, "unclear");
  assert.equal(v.action, "human_review");
});
test("mock answers have every question and cost tokens", () => {
  const m = mockAnswers("Status: green. Vendor is blocked.");
  for (const k of ["health", "blocked", "slipped", "escalate", "spin", "risk"]) assert.ok(m.answers[k], k);
  assert.ok(POLICY.escalateAt > POLICY.reviewAt);
});
test("callJev never leaks the upstream body on failure", async () => {
  const fake = async () => new Response('{"secret":"echo"}', { status: 401 });
  await assert.rejects(callJev("x", "k", undefined, fake), (e) => e.status === 401 && !e.message.includes("secret"));
});

// --- receipts: a vote must not be able to claim a verdict Jev never produced ---
import { sign, verify } from "../src/receipt.js";

test("a receipt round-trips and carries the verdict", async () => {
  const r = await sign({ actual: "red", watermelon: true, pEscalate: 0.8 }, "s3cret");
  const p = await verify(r, "s3cret");
  assert.equal(p.actual, "red");
  assert.equal(p.watermelon, true);
  assert.equal(p.pEscalate, 0.8);
});
test("a receipt signed with another secret is rejected", async () => {
  assert.equal(await verify(await sign({ actual: "red" }, "a"), "b"), null);
});
test("a tampered receipt is rejected", async () => {
  const r = await sign({ actual: "green" }, "s");
  const [body, sig] = r.split(".");
  const forged = btoa(JSON.stringify({ actual: "red", iat: Date.now() })).replace(/=+$/, "");
  assert.equal(await verify(`${forged}.${sig}`, "s"), null);
  assert.equal(await verify(`${body}.`, "s"), null);
});
test("an expired receipt is rejected", async () => {
  assert.equal(await verify(await sign({ actual: "red" }, "s"), "s", -1), null);
});
test("garbage receipts do not throw", async () => {
  for (const bad of [null, undefined, "", "nodot", 42, "a.b"]) assert.equal(await verify(bad, "s"), null);
});
