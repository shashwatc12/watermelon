// Deterministic fact extraction. Jev is unreliable with dates and arithmetic,
// so code reads the numbers and Jev reads the language.

const STATUS_WORDS = {
  green: "green", "on track": "green",
  yellow: "yellow", amber: "yellow", "at risk": "yellow",
  red: "red", "off track": "red",
};
const WORD_RE = new RegExp(`\\b(${Object.keys(STATUS_WORDS).join("|")})\\b`);

/** The status label the author claims, or null if none is stated. Explicit "Status: X" wins. */
export function claimedStatus(text) {
  const t = text.toLowerCase().replace(/-/g, " ");
  const labelled = t.match(new RegExp(`status\\s*[:\\-]\\s*(${Object.keys(STATUS_WORDS).join("|")})\\b`));
  const hit = labelled?.[1] ?? t.match(WORD_RE)?.[1];
  return hit ? STATUS_WORDS[hit] : null;
}

/** Largest "N days/weeks late|behind|delayed|slipped" found, in days; 0 if none. */
export function latenessDays(text) {
  const re = /(\d+(?:\.\d+)?)\s*(day|week)s?\s*(?:late|behind|delayed|of delay|of slip(?:page)?|over|slipped)|(?:slipped|delayed|behind|pushed(?: out)?)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*(day|week)s?/gi;
  let max = 0;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1] ?? m[3]);
    const unit = (m[2] ?? m[4]).toLowerCase();
    max = Math.max(max, unit === "week" ? n * 7 : n);
  }
  return Math.round(max);
}

export function extractFacts(text) {
  return { claimed: claimedStatus(text), latenessDays: latenessDays(text) };
}
