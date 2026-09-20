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
