// Typed questions sent to Jev for every status update.
// Design rules, from Jev's docs: one judgment per question, concrete criteria,
// an exit option for incomplete input, and no arithmetic (code does the maths, see extract.js).
export const QUESTIONS = {
  health: {
    type: "choice",
    instructions: "Overall program health that the facts in this weekly status update actually support, whatever status label the author gives it",
    criteria: {
      green: "On track; no material risks or slips described",
      yellow: "Some risk or minor slip described, but recoverable without outside help",
      red: "Off track, blocked, or a committed date will be missed",
      unclear: "Too little information to judge",
    },
  },
  blocked: {
    type: "noul",
    instructions: "Progress is blocked waiting on another team, vendor or decision",
  },
  slipped: {
    type: "noul",
    instructions: "A previously committed date or milestone has slipped or will slip",
  },
  escalate: {
    type: "noul",
    instructions: "This needs executive or cross-org attention now",
  },
  spin: {
    type: "score",
    instructions: "How much the wording downplays problems that the update itself describes",
    criteria: [
      "Candid: problems are stated plainly",
      "Softened: problems are mentioned but minimized",
      "Downplayed: real problems are framed as fine",
    ],
  },
  risk: {
    type: "choice",
    instructions: "The dominant risk category in this update",
    criteria: {
      schedule: "Dates, milestones, delays",
      scope: "Scope creep, changing requirements, unclear ownership",
      resourcing: "People, capacity, budget",
      technical: "Bugs, architecture, performance, integration failures",
      none: "No meaningful risk described",
    },
  },
};

export const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000; // output tokens are free
