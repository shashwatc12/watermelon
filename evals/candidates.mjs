// Candidate cases for the tuning set (SHI-123). NOT ground truth until the owner reviews them.
//
// Method, same as dataset.mjs, but made checkable in this file: every scenario's facts and gold
// label were written in SCENARIOS first, and the update text was rendered afterwards in RENDERINGS.
// Labels are never taken from the wording. All programs and names are invented.
//
// Review: read each scenario, then its text. If the label is right, add `reviewed: true` to the scenario.
// If it is wrong, fix `gold`, add `note: "why"` and `reviewed: true`. Delete a scenario to drop the case.
// Only reviewed cases join the tuning set in `npm run eval`. `npm run eval:candidates` scores all of them.
//
// Taxonomy (see dataset.mjs for the definitions): mostly the classes that were thin in the first
// 50 cases (inflation 4, hedging 3), plus genuine greens and honest yellows, which is where the
// escalation false alarms came from.
const G = (health, escalate, blocked, risk) => ({ health, escalate, blocked, risk });

// ---- 1. Scenarios and labels (written first) ----
const SCENARIOS = [
  // inflation: label understated, severity carried by euphemism ("minor", "a few", "some")
  { id: "ci1", tax: "inflation", facts: "claims green; critical vuln found in prod by pen test, unpatched, launch cannot ship with it", gold: G("red", true, false, "technical") },
  { id: "ci2", tax: "inflation", facts: "claims green; sole vendor ends support in 30 days, no replacement chosen", gold: G("red", true, true, "schedule") },
  { id: "ci3", tax: "inflation", facts: "claims on track; budget cut 40%, half the plan now unfunded, no decision on what to drop", gold: G("red", true, true, "resourcing") },
  { id: "ci4", tax: "inflation", facts: "claims green; pilot customer threatened to cancel after data errors, root cause unknown", gold: G("red", true, false, "technical") },
  { id: "ci5", tax: "inflation", facts: "claims yellow; migration rollback failed, some records inconsistent, extent unknown", gold: G("red", true, false, "technical") },
  { id: "ci6", tax: "inflation", facts: "claims green; checkout broken on older Android, fix needs a week, date at risk but recoverable", gold: G("yellow", false, false, "technical") },

  // contradicted: label understated and the text itself states a fact that falsifies it
  { id: "cc1", tax: "contradicted", facts: "claims green; 2 weeks late, recovery not yet planned", gold: G("yellow", false, false, "schedule") },
  { id: "cc2", tax: "contradicted", facts: "claims on track; blocked on finance approval 3 weeks, build cannot start (lateness written as words)", gold: G("red", true, true, "schedule") },
  { id: "cc3", tax: "contradicted", facts: "claims green; go-live date already missed, no new date", gold: G("red", true, false, "schedule") },
  { id: "cc4", tax: "contradicted", facts: "claims green; 0 of 5 acceptance tests pass, UAT starts in 3 days", gold: G("red", true, false, "technical") },

  // hedging: no falsifiable claim at all; the only correct call is "unclear, ask a human"
  { id: "ch1", tax: "hedging", facts: "claims green; no facts", gold: G("unclear", false, false, "none") },
  { id: "ch2", tax: "hedging", facts: "claims yellow; vague headwinds, no facts", gold: G("unclear", false, false, "none") },
  { id: "ch3", tax: "hedging", facts: "claims red; no facts", gold: G("unclear", false, false, "none") },
  { id: "ch4", tax: "hedging", facts: "no label; corporate filler, no facts", gold: G("unclear", false, false, "none") },
  { id: "ch5", tax: "hedging", facts: "claims green; reassuring words, no facts", gold: G("unclear", false, false, "none") },

  // genuinely green: true negatives, including two keyword traps the code or Jev could trip on
  { id: "cg1", tax: "green", facts: "green, all migrations done, zero incidents, date holds", gold: G("green", false, false, "none") },
  { id: "cg2", tax: "green", facts: "green, last week's vendor blocker cleared, no dependencies left (trap: the word blocked)", gold: G("green", false, false, "none") },
  { id: "cg3", tax: "green", facts: "green, two weeks ahead of plan (trap: a week count that is not lateness)", gold: G("green", false, false, "none") },
  { id: "cg4", tax: "green", facts: "green, terse but falsifiable: release shipped, all milestones met", gold: G("green", false, false, "none") },

  // honest yellow: label matches, no exec needed. These drove the escalation false alarms.
  { id: "cy1", tax: "honest", facts: "yellow, waiting on design review, 3 days of buffer, no help needed", gold: G("yellow", false, true, "schedule") },
  { id: "cy2", tax: "honest", facts: "yellow, on-call engineer leaving, backfill approved and interviewing", gold: G("yellow", false, false, "resourcing") },
  { id: "cy3", tax: "honest", facts: "yellow, product added scope, trade-off agreed, date holds", gold: G("yellow", false, false, "scope") },
];

// ---- 2. Renderings (written after the labels above) ----
const RENDERINGS = {
  ci1: "Status: green. The external pen test wrapped up and flagged one finding in the production login flow that we are working through with security. Launch prep otherwise continues as planned.",
  ci2: "Status: green. Minor vendor update: our document-scanning provider is sunsetting the product at the end of next month. We are starting to look at options. No change to plan for now.",
  ci3: "Status: on track. Finance adjusted our budget this quarter, roughly 40% lower. We are working through what that means for the roadmap and will share thoughts once leadership weighs in on priorities.",
  ci4: "Status: green. Our pilot customer raised some concerns this week about report accuracy and mentioned they are reviewing the contract. The team is digging in. Otherwise a productive week.",
  ci5: "Status: yellow. Friday's migration had to be rolled back and the rollback did not fully complete, so a few records may be out of sync. We are assessing. More soon.",
  ci6: "Status: green. QA spotted a checkout glitch on some older Android versions. The fix is about a week of work, which uses most of our buffer, but we still expect to make the date.",
  cc1: "Status: green. We are 2 weeks late on the data model after the schema redesign. We have not worked out a recovery plan yet but the team is upbeat.",
  cc2: "Status: on track. The build has not started because we are still waiting on finance to approve the hardware order, now three weeks with no answer. Everything else is ready to go.",
  cc3: "Status: green. The September 30 go-live has passed without the switchover happening. A new date will be set once the remaining items are closed. Team morale is good.",
  cc4: "Status: green. Acceptance testing: 0 of 5 scenarios passing so far. UAT with the business starts Monday as planned.",
  ch1: "Status: green. Good progress across workstreams this week. Team is engaged. More detail next week.",
  ch2: "Status: yellow. Some headwinds, but we are navigating them. Monitoring closely.",
  ch3: "Status: red. Challenging week. Working through it with partners.",
  ch4: "Continued momentum on key initiatives. Alignment sessions held with stakeholders. Next steps are being defined.",
  ch5: "Status: green. Largely on track. A few items to tidy up, nothing major expected.",
  cg1: "Status: green. All four database migrations finished this week with zero incidents. Monitoring is clean and the cutover date of the 20th holds.",
  cg2: "Status: green. The vendor blocker from last week cleared on Monday when their certificate was renewed. We have no remaining external dependencies and are on plan.",
  cg3: "Status: green. The indexing work finished two weeks ahead of plan, so we have pulled the next milestone forward. No risks open.",
  cg4: "Status: green. Released v2.3 Tuesday. All 14 milestones met. No open risks.",
  cy1: "Status: yellow. Waiting on the design review, now booked for Thursday. We have three days of buffer, so no date impact unless it moves again. No help needed.",
  cy2: "Status: yellow. One of our two on-call engineers leaves at the end of the month. The backfill is approved and we are interviewing; until then we are covering the rota between us.",
  cy3: "Status: yellow. Product added bulk editing to the release. We agreed to drop CSV import to make room, and the date holds.",
};

export const CANDIDATES = SCENARIOS.map((s) => ({ reviewed: false, note: "", ...s, text: RENDERINGS[s.id] }));
