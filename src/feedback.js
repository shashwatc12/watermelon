import { DurableObject } from "cloudflare:workers";

// One append-only log of reviewer votes. Only feedback submissions reach it, never
// assessments, so a single instance is the right coordination atom at this volume.
export class FeedbackLog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          agree INTEGER NOT NULL,
          role TEXT,
          comment TEXT,
          claimed TEXT,
          actual TEXT,
          watermelon INTEGER NOT NULL DEFAULT 0,
          action TEXT,
          p_escalate REAL,
          p_blocked REAL,
          p_slipped REAL,
          spin REAL,
          health_choice TEXT,
          health_conf REAL,
          risk TEXT,
          lateness INTEGER,
          update_text TEXT
        )`);
    });
  }

  /** `v` is a verified receipt payload; `vote` is the reviewer's input. */
  async record(v, vote) {
    this.ctx.storage.sql.exec(
      `INSERT INTO votes (ts, agree, role, comment, claimed, actual, watermelon, action,
        p_escalate, p_blocked, p_slipped, spin, health_choice, health_conf, risk, lateness, update_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      new Date().toISOString(), vote.agree ? 1 : 0, vote.role ?? null, vote.comment ?? null,
      v.claimed ?? null, v.actual ?? null, v.watermelon ? 1 : 0, v.action ?? null,
      v.pEscalate ?? null, v.pBlocked ?? null, v.pSlipped ?? null, v.spin ?? null,
      v.health ?? null, v.healthConf ?? null, v.risk ?? null, v.lateness ?? null,
      vote.updateText ?? null,
    );
    return this.stats();
  }

  async stats() {
    const row = this.ctx.storage.sql.exec(`
      SELECT COUNT(*) AS n,
             SUM(agree) AS agreed,
             SUM(CASE WHEN watermelon = 1 THEN 1 ELSE 0 END) AS wm,
             SUM(CASE WHEN watermelon = 1 AND agree = 1 THEN 1 ELSE 0 END) AS wmAgreed
      FROM votes`).one();
    return { n: row.n ?? 0, agreed: row.agreed ?? 0, watermelonCalls: row.wm ?? 0, watermelonAgreed: row.wmAgreed ?? 0 };
  }

  /** Owner-only: clears test data so a published tally only ever counts real reviewers. */
  async reset() {
    this.ctx.storage.sql.exec("DELETE FROM votes");
    return this.stats();
  }

  /** Owner-only export, including comments and any opted-in text. */
  async dump(limit = 500) {
    return this.ctx.storage.sql.exec("SELECT * FROM votes ORDER BY id DESC LIMIT ?", limit).toArray();
  }
}
