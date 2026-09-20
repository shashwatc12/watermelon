// Combines Jev's judgments with extracted facts into a decision a TPM can act on.
// The escalation thresholds are policy, not model output. See docs/THRESHOLDS.md.

export const POLICY = {
  escalateAt: 0.2,    // noul >= this: escalate (Jev's escalate noul runs low; see docs/THRESHOLDS.md)
  reviewAt: 0.1,      // noul between reviewAt and escalateAt: human review band
  yellowAfterDays: 7, // code floors health at yellow when the text states this much lateness
  redAfterDays: 21,   // ...and at red beyond this
};

const RANK = { green: 0, yellow: 1, red: 2 };
const NAME = ["green", "yellow", "red"];

export function verdict(answers, facts, policy = POLICY) {
  const jevHealth = answers.health.choice;
  let actual = jevHealth === "unclear" ? null : jevHealth;
  let floorApplied = null;

  if (actual) {
    const floor =
      facts.latenessDays >= policy.redAfterDays ? "red" :
      facts.latenessDays >= policy.yellowAfterDays ? "yellow" : null;
    if (floor && RANK[floor] > RANK[actual]) { floorApplied = floor; actual = floor; }
  }

  const esc = answers.escalate.noul;
  const action =
    esc >= policy.escalateAt ? "escalate" :
    esc >= policy.reviewAt || actual === null ? "human_review" : "no_action";

  const watermelon = Boolean(
    facts.claimed && actual && RANK[actual] > RANK[facts.claimed],
  );
  return {
    claimed: facts.claimed,
    actual: actual ?? "unclear",
    watermelon,
    gap: facts.claimed && actual ? RANK[actual] - RANK[facts.claimed] : 0,
    floorApplied,
    action,
  };
}
export { NAME as HEALTH_LEVELS };
