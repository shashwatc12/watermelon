// Synthetic labeled updates. Every label comes from the `facts` line (the scenario),
// written BEFORE the text. The text is a rendering of the facts in a chosen tone,
// so labels are never guessed from the wording. All programs and names are invented.
//
// gold.health: green|yellow|red   gold.escalate: needs exec/cross-org attention now
// gold.blocked: waiting on an outside team/vendor/decision   gold.risk: dominant category
const G = (health, escalate, blocked, risk) => ({ health, escalate, blocked, risk });

export const DATASET = [
  // ---- honest green ----
  { id: "g1", facts: "on track, demo shipped, staffed", gold: G("green", false, false, "none"),
    text: "Status: green. Week 3 of Atlas onboarding. Demo shipped Tuesday to the pilot team, all milestones on schedule, team fully staffed. No open risks." },
  { id: "g2", facts: "on track, one resolved bug", gold: G("green", false, false, "none"),
    text: "Status: green. Ledger export: a formatting bug found in QA was fixed the same day. Beta still on for the 14th. Nothing needs help." },
  { id: "g3", facts: "ahead of plan", gold: G("green", false, false, "none"),
    text: "Status: on track. Search relevance work finished two days early; we are starting the next milestone ahead of plan. No blockers." },
  { id: "g4", facts: "on track, minor scheduling note only", gold: G("green", false, false, "none"),
    text: "Status: green. Mobile checkout is on plan. One reviewer is out Friday, review moved to Monday with no impact to the release date." },
  { id: "g5", facts: "done, launched", gold: G("green", false, false, "none"),
    text: "Status: green. Billing migration launched on schedule. Error rates normal, rollback not needed. Closing the program next week." },
  { id: "g6", facts: "on track, dependency delivered", gold: G("green", false, false, "none"),
    text: "Status: green. The identity team delivered the SSO hooks we were waiting on, exactly when promised. Integration starts tomorrow, on schedule." },

  // ---- honest yellow ----
  { id: "y1", facts: "yellow, 4 days late, recoverable", gold: G("yellow", false, false, "schedule"),
    text: "Status: yellow. Reporting rebuild is 4 days behind after an estimate miss. We are re-sequencing two tasks and expect to recover before the beta date. No help needed yet." },
  { id: "y2", facts: "yellow, one engineer out, recoverable", gold: G("yellow", false, false, "resourcing"),
    text: "Status: yellow. One of three engineers on the sync service is out for two weeks. We are trimming a nice-to-have to protect the date. Will flag if that stops working." },
  { id: "y3", facts: "yellow, scope question open", gold: G("yellow", false, false, "scope"),
    text: "Status: yellow. Product added an export requirement this week that we had not sized. We are estimating it now and will bring options Thursday. Date is still holding." },
  { id: "y4", facts: "yellow, perf risk under investigation", gold: G("yellow", false, false, "technical"),
    text: "Status: yellow. Load test shows p95 at 900ms against a 600ms target. We have two candidate fixes and are testing the first. Launch date holds if it works." },
  { id: "y5", facts: "yellow, waiting on vendor but buffer exists", gold: G("yellow", false, true, "schedule"),
    text: "Status: yellow. Waiting on the vendor's API keys, promised Friday. We have a week of buffer so no date impact unless it slips past next Wednesday." },
  { id: "y6", facts: "yellow, honest mixed", gold: G("yellow", false, false, "technical"),
    text: "Status: yellow. Data backfill is running slower than modelled, 3 days behind. The team added a second worker and throughput doubled, so we should catch up by mid next week." },

  // ---- honest red ----
  { id: "r1", facts: "red, vendor blocker, launch will miss, exec needed", gold: G("red", true, true, "schedule"),
    text: "Status: red. The API migration is blocked on the vendor security review, which is now 3 weeks late. The launch date of Nov 4 cannot hold. We need an executive to escalate with the vendor." },
  { id: "r2", facts: "red, outage, customer impact", gold: G("red", true, false, "technical"),
    text: "Status: red. Payments outage on Tuesday affected roughly 8% of checkouts for two hours. Root cause is not yet confirmed and the fix is not deployed. Customer support is asking for guidance." },
  { id: "r3", facts: "red, lost headcount, no plan", gold: G("red", true, false, "resourcing"),
    text: "Status: red. Two of our four engineers were reassigned this week. With the remaining two we cannot make the Q4 commitment, and we have no plan to close the gap. We need a decision on staffing." },
  { id: "r4", facts: "red, requirements churn, no owner", gold: G("red", true, true, "scope"),
    text: "Status: red. The requirements changed three times this month and nobody owns the final call. We cannot finish design until legal and product agree. Dates are meaningless until that is resolved." },
  { id: "r5", facts: "red, missed milestone, recovery plan exists", gold: G("red", false, false, "schedule"),
    text: "Status: red. We missed the beta milestone by 10 days. The cause was an underestimated migration, now understood. A recovery plan with a new date of the 28th is agreed with product and I do not need help." },
  { id: "r6", facts: "red, integration failing, blocked on other team", gold: G("red", true, true, "technical"),
    text: "Status: red. Integration with the inventory service fails on every test. Their team says the fix is not on their roadmap this quarter. We are blocked and the launch depends on it." },

  // ---- WATERMELONS: claims green/yellow, facts red ----
  { id: "w1", facts: "claims green; vendor blocker 3 weeks; will miss date", gold: G("red", true, true, "schedule"),
    text: "Status: green. Team is confident. The vendor security review is still pending, about 3 weeks behind the original plan, but we expect it to land soon. Launch is still targeting Nov 4." },
  { id: "w2", facts: "claims on track; lost engineers; cannot meet date", gold: G("red", true, false, "resourcing"),
    text: "Status: on track. Minor staffing change this week: two engineers moved to a higher priority effort. We will do our best to hold the Q4 date with the team we have." },
  { id: "w3", facts: "claims green; failing integration; no fix on the other side", gold: G("red", true, true, "technical"),
    text: "Status: green. Integration testing is in progress. A few tests are not passing yet against the inventory service, and their team is looking into it. No changes to launch expected." },
  { id: "w4", facts: "claims yellow; actually outage with customer impact", gold: G("red", true, false, "technical"),
    text: "Status: yellow. There was a short payments incident on Tuesday with some checkout failures. Investigation is ongoing. We are keeping an eye on it." },
  { id: "w5", facts: "claims green; scope churn, no owner", gold: G("red", true, true, "scope"),
    text: "Status: green. Requirements are still evolving a bit, and we are aligning with legal and product on the final version. Design is paused for now but should resume shortly." },
  { id: "w6", facts: "claims on track; date 5 weeks late", gold: G("red", true, false, "schedule"),
    text: "Status: on track. Overall in good shape. Beta is now expected 5 weeks later than planned because of platform changes, but the team is motivated and the roadmap remains achievable." },

  // ---- WATERMELONS: claims green, facts yellow ----
  { id: "wy1", facts: "claims green; 8 days behind, recoverable", gold: G("yellow", false, false, "schedule"),
    text: "Status: green. We are a little behind, around 8 days, due to a late dependency, but we believe we can make it up in the next sprint." },
  { id: "wy2", facts: "claims green; perf target missed, fix uncertain", gold: G("yellow", false, false, "technical"),
    text: "Status: green. Performance is not quite at target yet, p95 is 900ms against 600ms, but we have some ideas to try." },

  // ---- REVERSE: over-cautious claim, facts green ----
  { id: "o1", facts: "claims yellow; actually fine", gold: G("green", false, false, "none"),
    text: "Status: yellow. Just being careful: a reviewer is out next week, but reviews are already scheduled and every milestone is on plan. I expect green next update." },
  { id: "o2", facts: "claims red; resolved same day", gold: G("green", false, false, "none"),
    text: "Status: red at 9am, resolved by noon. A config error broke staging deploys; it was fixed and verified. No production impact and no date impact." },

  // ---- Unclear / thin ----
  { id: "u1", facts: "no information", gold: G("unclear", false, false, "none"),
    text: "Status: green. Nothing new this week." },
  { id: "u2", facts: "vague, no facts", gold: G("unclear", false, false, "none"),
    text: "Status: yellow. Things are moving. Will share more when we know more." },
];
