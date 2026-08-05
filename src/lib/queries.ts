import { getDb } from "./db";
import { monthRange } from "./date";
import type {
  Lead,
  RateCard,
  RewardAdjustment,
  RewardStatusValue,
  TiktokAccount,
  User,
} from "./types";

/* ------------------------------------------------------------------ users */

export function listUsers(opts: { includeInactive?: boolean } = {}): User[] {
  const where = opts.includeInactive ? "" : "WHERE is_active = 1";
  const rows = getDb()
    .prepare(`SELECT * FROM users ${where}`)
    .all() as User[];
  // SQLiteのORDER BYはUTF-8バイト順で日本語が五十音順にならないため、JS側で整列する
  return rows.sort(
    (a, b) =>
      Number(b.role === "admin") - Number(a.role === "admin") ||
      b.is_active - a.is_active ||
      a.name.localeCompare(b.name, "ja"),
  );
}

export function getUser(id: number): User | null {
  return (
    (getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null
  );
}

export function getUserByLoginId(loginId: string): User | null {
  return (
    (getDb()
      .prepare("SELECT * FROM users WHERE login_id = ?")
      .get(loginId) as User) ?? null
  );
}

/* --------------------------------------------------------------- accounts */

export function listAccounts(userId?: number): TiktokAccount[] {
  const db = getDb();
  if (userId === undefined) {
    return db
      .prepare("SELECT * FROM tiktok_accounts ORDER BY user_id, handle")
      .all() as TiktokAccount[];
  }
  return db
    .prepare("SELECT * FROM tiktok_accounts WHERE user_id = ? ORDER BY handle")
    .all(userId) as TiktokAccount[];
}

export function getAccount(id: number): TiktokAccount | null {
  return (
    (getDb()
      .prepare("SELECT * FROM tiktok_accounts WHERE id = ?")
      .get(id) as TiktokAccount) ?? null
  );
}

/* ------------------------------------------------------------ rate cards */

/** 指定月に適用される単価（その月以前で最も新しいもの）。無ければ全て0。 */
export function getEffectiveRate(userId: number, month: string): RateCard {
  const row = getDb()
    .prepare(
      `SELECT * FROM rate_cards
       WHERE user_id = ? AND effective_month <= ?
       ORDER BY effective_month DESC LIMIT 1`,
    )
    .get(userId, month) as RateCard | undefined;
  return (
    row ?? {
      id: 0,
      user_id: userId,
      effective_month: month,
      dm_unit_price: 0,
      reply_unit_price: 0,
      line_bonus: 0,
      meeting_bonus: 0,
      monthly_fixed: 0,
    }
  );
}

export function listRateCards(userId: number): RateCard[] {
  return getDb()
    .prepare(
      "SELECT * FROM rate_cards WHERE user_id = ? ORDER BY effective_month DESC",
    )
    .all(userId) as RateCard[];
}

/* -------------------------------------------------------------- 実績集計 */

export type Totals = { sent: number; reply: number };

export const replyRate = (t: Totals): number =>
  t.sent > 0 ? (t.reply / t.sent) * 100 : 0;

/** 期間内の合計（ユーザー指定可） */
export function totalsInRange(
  start: string,
  end: string,
  userId?: number,
): Totals {
  const db = getDb();
  const sql = `SELECT COALESCE(SUM(d.sent_count),0) AS sent, COALESCE(SUM(d.reply_count),0) AS reply
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date BETWEEN ? AND ?${userId !== undefined ? " AND a.user_id = ?" : ""}`;
  const params: unknown[] = [start, end];
  if (userId !== undefined) params.push(userId);
  return db.prepare(sql).get(...params) as Totals;
}

/** 期間内の日別合計（グラフ用） */
export function dailySeries(
  start: string,
  end: string,
  userId?: number,
): { date: string; sent: number; reply: number }[] {
  const sql = `SELECT d.report_date AS date,
                      SUM(d.sent_count) AS sent,
                      SUM(d.reply_count) AS reply
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date BETWEEN ? AND ?${userId !== undefined ? " AND a.user_id = ?" : ""}
               GROUP BY d.report_date ORDER BY d.report_date`;
  const params: unknown[] = [start, end];
  if (userId !== undefined) params.push(userId);
  return getDb().prepare(sql).all(...params) as {
    date: string;
    sent: number;
    reply: number;
  }[];
}

/** 期間内のユーザー別合計 */
export function totalsByUser(
  start: string,
  end: string,
): Map<number, Totals> {
  const rows = getDb()
    .prepare(
      `SELECT a.user_id AS user_id,
              COALESCE(SUM(d.sent_count),0) AS sent,
              COALESCE(SUM(d.reply_count),0) AS reply
       FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
       WHERE d.report_date BETWEEN ? AND ?
       GROUP BY a.user_id`,
    )
    .all(start, end) as { user_id: number; sent: number; reply: number }[];
  return new Map(rows.map((r) => [r.user_id, { sent: r.sent, reply: r.reply }]));
}

/** 期間内のアカウント別合計 */
export function totalsByAccount(
  start: string,
  end: string,
): Map<number, Totals> {
  const rows = getDb()
    .prepare(
      `SELECT account_id,
              COALESCE(SUM(sent_count),0) AS sent,
              COALESCE(SUM(reply_count),0) AS reply
       FROM daily_reports
       WHERE report_date BETWEEN ? AND ?
       GROUP BY account_id`,
    )
    .all(start, end) as { account_id: number; sent: number; reply: number }[];
  return new Map(
    rows.map((r) => [r.account_id, { sent: r.sent, reply: r.reply }]),
  );
}

/** ある日のアカウント別実績（日報入力画面用） */
export function reportsOnDate(
  date: string,
  userId?: number,
): Map<number, { sent: number; reply: number; memo: string }> {
  const sql = `SELECT d.account_id, d.sent_count AS sent, d.reply_count AS reply, d.memo
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date = ?${userId !== undefined ? " AND a.user_id = ?" : ""}`;
  const params: unknown[] = [date];
  if (userId !== undefined) params.push(userId);
  const rows = getDb().prepare(sql).all(...params) as {
    account_id: number;
    sent: number;
    reply: number;
    memo: string;
  }[];
  return new Map(
    rows.map((r) => [
      r.account_id,
      { sent: r.sent, reply: r.reply, memo: r.memo },
    ]),
  );
}

/** 日報が1件でも入力されている日付の集合（未入力アラート用） */
export function reportedDates(
  start: string,
  end: string,
  userId: number,
): Set<string> {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT d.report_date AS date
       FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
       WHERE d.report_date BETWEEN ? AND ? AND a.user_id = ?`,
    )
    .all(start, end, userId) as { date: string }[];
  return new Set(rows.map((r) => r.date));
}

/* ------------------------------------------------------------------ leads */

export function listLeads(filter: {
  userId?: number;
  stage?: string;
  keyword?: string;
}): Lead[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.userId !== undefined) {
    clauses.push("user_id = ?");
    params.push(filter.userId);
  }
  if (filter.stage) {
    clauses.push("stage = ?");
    params.push(filter.stage);
  }
  if (filter.keyword) {
    clauses.push("(creator_handle LIKE ? OR creator_name LIKE ? OR memo LIKE ?)");
    const kw = `%${filter.keyword}%`;
    params.push(kw, kw, kw);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM leads ${where} ORDER BY updated_at DESC LIMIT 500`)
    .all(...params) as Lead[];
}

export function getLead(id: number): Lead | null {
  return (
    (getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead) ?? null
  );
}

export type LeadCounts = { line: number; meeting: number; closed: number };

/** 期間内に LINE登録／面談／成約 に至った件数（ユーザー別） */
export function leadCountsByUser(
  start: string,
  end: string,
): Map<number, LeadCounts> {
  const rows = getDb()
    .prepare(
      `SELECT user_id,
              SUM(CASE WHEN line_at    BETWEEN ? AND ? THEN 1 ELSE 0 END) AS line,
              SUM(CASE WHEN meeting_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS meeting,
              SUM(CASE WHEN closed_at  BETWEEN ? AND ? THEN 1 ELSE 0 END) AS closed
       FROM leads GROUP BY user_id`,
    )
    .all(start, end, start, end, start, end) as (LeadCounts & {
    user_id: number;
  })[];
  return new Map(
    rows.map((r) => [
      r.user_id,
      { line: r.line, meeting: r.meeting, closed: r.closed },
    ]),
  );
}

export function leadCounts(
  start: string,
  end: string,
  userId?: number,
): LeadCounts {
  const sql = `SELECT
      SUM(CASE WHEN line_at    BETWEEN ? AND ? THEN 1 ELSE 0 END) AS line,
      SUM(CASE WHEN meeting_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS meeting,
      SUM(CASE WHEN closed_at  BETWEEN ? AND ? THEN 1 ELSE 0 END) AS closed
    FROM leads${userId !== undefined ? " WHERE user_id = ?" : ""}`;
  const params: unknown[] = [start, end, start, end, start, end];
  if (userId !== undefined) params.push(userId);
  const row = getDb().prepare(sql).get(...params) as Partial<LeadCounts>;
  return {
    line: row.line ?? 0,
    meeting: row.meeting ?? 0,
    closed: row.closed ?? 0,
  };
}

/* ----------------------------------------------------------------- 報酬 */

export type RewardBreakdown = {
  userId: number;
  month: string;
  rate: RateCard;
  sent: number;
  reply: number;
  line: number;
  meeting: number;
  dmAmount: number;
  replyAmount: number;
  lineAmount: number;
  meetingAmount: number;
  fixedAmount: number;
  adjustments: RewardAdjustment[];
  adjustmentTotal: number;
  total: number;
  status: RewardStatusValue;
};

export function computeReward(userId: number, month: string): RewardBreakdown {
  const { start, end } = monthRange(month);
  const rate = getEffectiveRate(userId, month);
  const t = totalsInRange(start, end, userId);
  const lc = leadCounts(start, end, userId);

  const adjustments = getDb()
    .prepare(
      "SELECT * FROM reward_adjustments WHERE user_id = ? AND month = ? ORDER BY id",
    )
    .all(userId, month) as RewardAdjustment[];
  const adjustmentTotal = adjustments.reduce((s, a) => s + a.amount, 0);

  const dmAmount = t.sent * rate.dm_unit_price;
  const replyAmount = t.reply * rate.reply_unit_price;
  const lineAmount = lc.line * rate.line_bonus;
  const meetingAmount = lc.meeting * rate.meeting_bonus;
  const fixedAmount = rate.monthly_fixed;

  const status =
    ((
      getDb()
        .prepare(
          "SELECT status FROM reward_statuses WHERE user_id = ? AND month = ?",
        )
        .get(userId, month) as { status: RewardStatusValue } | undefined
    )?.status as RewardStatusValue) ?? "draft";

  return {
    userId,
    month,
    rate,
    sent: t.sent,
    reply: t.reply,
    line: lc.line,
    meeting: lc.meeting,
    dmAmount,
    replyAmount,
    lineAmount,
    meetingAmount,
    fixedAmount,
    adjustments,
    adjustmentTotal,
    total:
      dmAmount +
      replyAmount +
      lineAmount +
      meetingAmount +
      fixedAmount +
      adjustmentTotal,
    status,
  };
}

/* ------------------------------------------------------------ templates */

export function listTemplates(userId?: number) {
  const db = getDb();
  if (userId === undefined) {
    return db
      .prepare(
        "SELECT * FROM templates ORDER BY is_active DESC, user_id, updated_at DESC",
      )
      .all() as import("./types").Template[];
  }
  return db
    .prepare(
      "SELECT * FROM templates WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC",
    )
    .all(userId) as import("./types").Template[];
}

export function getTemplate(id: number) {
  return (
    (getDb()
      .prepare("SELECT * FROM templates WHERE id = ?")
      .get(id) as import("./types").Template) ?? null
  );
}

export function listTemplateRevisions(templateId: number) {
  return getDb()
    .prepare(
      "SELECT * FROM template_revisions WHERE template_id = ? ORDER BY version DESC",
    )
    .all(templateId) as import("./types").TemplateRevision[];
}
