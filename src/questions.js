// Typed questions sent to Jev for every status update.
export const QUESTIONS = {
  health: {
    type: "choice",
    instructions: "Overall program health implied by this weekly status update",
    criteria: {
      green: "On track; no material risks or slips reported",
      yellow: "Some risk or minor slip, but recoverable without help",
      red: "Off track, blocked, or a committed date will be missed",
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
  risk: {
    type: "choice",
    instructions: "The dominant risk category in this update",
    criteria: {
      schedule: "Dates, milestones, delays",
      scope: "Scope creep, changing requirements, unclear ownership",
      resourcing: "People, capacity, budget",
      technical: "Bugs, architecture, performance, integration failures",
      none: "No meaningful risk reported",
    },
  },
};

export const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000; // output tokens are free
