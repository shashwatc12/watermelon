// Vote store for hosts without Durable Objects: an append-only JSONL file. Node only.
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class FileStore {
  constructor(path = "data/votes.jsonl") {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }
  #rows() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  async record(v, vote) {
    const row = {
      ts: new Date().toISOString(), agree: vote.agree ? 1 : 0, role: vote.role ?? null, comment: vote.comment ?? null,
      claimed: v.claimed ?? null, actual: v.actual ?? null, watermelon: v.watermelon ? 1 : 0, action: v.action ?? null,
      p_escalate: v.pEscalate ?? null, p_blocked: v.pBlocked ?? null, p_slipped: v.pSlipped ?? null, spin: v.spin ?? null,
      health_choice: v.health ?? null, health_conf: v.healthConf ?? null, risk: v.risk ?? null,
      lateness: v.lateness ?? null, update_text: vote.updateText ?? null,
    };
    appendFileSync(this.path, JSON.stringify(row) + "\n");
    return this.stats();
  }
  async stats() {
    const rows = this.#rows(), wm = rows.filter((r) => r.watermelon);
    return { n: rows.length, agreed: rows.filter((r) => r.agree).length,
      watermelonCalls: wm.length, watermelonAgreed: wm.filter((r) => r.agree).length };
  }
  async dump(limit = 500) { return this.#rows().reverse().slice(0, limit); }
  async reset() { writeFileSync(this.path, ""); return this.stats(); }
}
