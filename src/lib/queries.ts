import { cache } from "react";
import { query, queryOne } from "./db";
import { monthRange } from "./date";
import type {
  Lead,
  RateCard,
  RewardAdjustment,
  RewardStatusValue,
  Template,
  TemplateRevision,
  TiktokAccount,
  User,
} from "./types";

/* ------------------------------------------------------------------ users */

export const listUsers = cache(async function listUsers(
  opts: { includeInactive?: boolean } = {},
): Promise<User[]> {
  const where = opts.includeInactive ? "" : "WHERE is_active = 1";
  const rows = await query<User>(`SELECT * FROM users ${where}`);
  // Postgres の ORDER BY は日本語が五十音順にならないため、JS側で整列する
  return rows.sort(
    (a, b) =>
      Number(b.role === "admin") - Number(a.role === "admin") ||
      b.is_active - a.is_active ||
      a.name.localeCompare(b.name, "ja"),
  );
});

export const getUser = cache(function getUser(id: number): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE id = ?", [id]);
})

export function getUserByLoginId(loginId: string): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE login_id = ?", [loginId]);
}

/* --------------------------------------------------------------- accounts */

export const listAccounts = cache(function listAccounts(userId?: number): Promise<TiktokAccount[]> {
  if (userId === undefined) {
    return query<TiktokAccount>(
      "SELECT * FROM tiktok_accounts ORDER BY user_id, handle",
    );
  }
  return query<TiktokAccount>(
    "SELECT * FROM tiktok_accounts WHERE user_id = ? ORDER BY handle",
    [userId],
  );
});

export function getAccount(id: number): Promise<TiktokAccount | null> {
  return queryOne<TiktokAccount>("SELECT * FROM tiktok_accounts WHERE id = ?", [
    id,
  ]);
}

/* ------------------------------------------------------------ rate cards */

/** 指定月に適用される単価（その月以前で最も新しいもの）。無ければ全て0。 */
export const getEffectiveRate = cache(async function getEffectiveRate(
  userId: number,
  month: string,
): Promise<RateCard> {
  const row = await queryOne<RateCard>(
    `SELECT * FROM rate_cards
     WHERE user_id = ? AND effective_month <= ?
     ORDER BY effective_month DESC LIMIT 1`,
    [userId, month],
  );
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
});

/** 指定月に適用される単価を全員分まとめて返す（一覧画面用）。 */
export const effectiveRatesFor = cache(async function effectiveRatesFor(
  month: string,
): Promise<Map<number, RateCard>> {
  const rows = await query<RateCard>(
    `SELECT DISTINCT ON (user_id) * FROM rate_cards
     WHERE effective_month <= ?
     ORDER BY user_id, effective_month DESC`,
    [month],
  );
  return new Map(rows.map((r) => [r.user_id, r]));
});

export function listRateCards(userId: number): Promise<RateCard[]> {
  return query<RateCard>(
    "SELECT * FROM rate_cards WHERE user_id = ? ORDER BY effective_month DESC",
    [userId],
  );
}

/* -------------------------------------------------------------- 実績集計 */

export type Totals = { sent: number; reply: number };

export const replyRate = (t: Totals): number =>
  t.sent > 0 ? (t.reply / t.sent) * 100 : 0;

/** 期間内の合計（ユーザー指定可） */
export const totalsInRange = cache(async function totalsInRange(
  start: string,
  end: string,
  userId?: number,
): Promise<Totals> {
  const sql = `SELECT COALESCE(SUM(d.sent_count),0) AS sent, COALESCE(SUM(d.reply_count),0) AS reply
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date BETWEEN ? AND ?${userId !== undefined ? " AND a.user_id = ?" : ""}`;
  const params: unknown[] = [start, end];
  if (userId !== undefined) params.push(userId);
  const row = await queryOne<Totals>(sql, params);
  return row ?? { sent: 0, reply: 0 };
});

/** 期間内の日別合計（グラフ用） */
export function dailySeries(
  start: string,
  end: string,
  userId?: number,
): Promise<{ date: string; sent: number; reply: number }[]> {
  const sql = `SELECT d.report_date AS date,
                      SUM(d.sent_count) AS sent,
                      SUM(d.reply_count) AS reply
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date BETWEEN ? AND ?${userId !== undefined ? " AND a.user_id = ?" : ""}
               GROUP BY d.report_date ORDER BY d.report_date`;
  const params: unknown[] = [start, end];
  if (userId !== undefined) params.push(userId);
  return query(sql, params);
}

/** 期間内のユーザー別合計 */
export const totalsByUser = cache(async function totalsByUser(
  start: string,
  end: string,
): Promise<Map<number, Totals>> {
  const rows = await query<{ user_id: number; sent: number; reply: number }>(
    `SELECT a.user_id AS user_id,
            COALESCE(SUM(d.sent_count),0) AS sent,
            COALESCE(SUM(d.reply_count),0) AS reply
     FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
     WHERE d.report_date BETWEEN ? AND ?
     GROUP BY a.user_id`,
    [start, end],
  );
  return new Map(rows.map((r) => [r.user_id, { sent: r.sent, reply: r.reply }]));
});

/** 期間内のアカウント別合計 */
export const totalsByAccount = cache(async function totalsByAccount(
  start: string,
  end: string,
): Promise<Map<number, Totals>> {
  const rows = await query<{ account_id: number; sent: number; reply: number }>(
    `SELECT account_id,
            COALESCE(SUM(sent_count),0) AS sent,
            COALESCE(SUM(reply_count),0) AS reply
     FROM daily_reports
     WHERE report_date BETWEEN ? AND ?
     GROUP BY account_id`,
    [start, end],
  );
  return new Map(
    rows.map((r) => [r.account_id, { sent: r.sent, reply: r.reply }]),
  );
});

/** ある日のアカウント別実績（日報入力画面用） */
export async function reportsOnDate(
  date: string,
  userId?: number,
): Promise<Map<number, { sent: number; reply: number; memo: string }>> {
  const sql = `SELECT d.account_id, d.sent_count AS sent, d.reply_count AS reply, d.memo
               FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
               WHERE d.report_date = ?${userId !== undefined ? " AND a.user_id = ?" : ""}`;
  const params: unknown[] = [date];
  if (userId !== undefined) params.push(userId);
  const rows = await query<{
    account_id: number;
    sent: number;
    reply: number;
    memo: string;
  }>(sql, params);
  return new Map(
    rows.map((r) => [
      r.account_id,
      { sent: r.sent, reply: r.reply, memo: r.memo },
    ]),
  );
}

/**
 * 日報が1件でも入力されている日付を運用者ごとに返す（未入力アラート用）。
 * 以前は運用者1人につき1本のクエリを投げていたため、人数分の往復が発生していた。
 */
export const reportedDatesByUser = cache(async function reportedDatesByUser(
  start: string,
  end: string,
): Promise<Map<number, Set<string>>> {
  const rows = await query<{ user_id: number; date: string }>(
    `SELECT DISTINCT a.user_id AS user_id, d.report_date AS date
     FROM daily_reports d JOIN tiktok_accounts a ON a.id = d.account_id
     WHERE d.report_date BETWEEN ? AND ?`,
    [start, end],
  );
  const out = new Map<number, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.user_id) ?? new Set<string>();
    set.add(r.date);
    out.set(r.user_id, set);
  }
  return out;
});

/* ------------------------------------------------------------------ leads */

export function listLeads(filter: {
  userId?: number;
  stage?: string;
  keyword?: string;
}): Promise<Lead[]> {
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
    clauses.push("(creator_handle ILIKE ? OR creator_name ILIKE ? OR memo ILIKE ?)");
    const kw = `%${filter.keyword}%`;
    params.push(kw, kw, kw);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return query<Lead>(
    `SELECT * FROM leads ${where} ORDER BY updated_at DESC LIMIT 500`,
    params,
  );
}

export function getLead(id: number): Promise<Lead | null> {
  return queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]);
}

export type LeadCounts = { line: number; meeting: number };

/** 期間内に LINE登録／面談／成約 に至った件数（ユーザー別） */
export const leadCountsByUser = cache(async function leadCountsByUser(
  start: string,
  end: string,
): Promise<Map<number, LeadCounts>> {
  const rows = await query<LeadCounts & { user_id: number }>(
    `SELECT user_id,
            SUM(CASE WHEN line_at    BETWEEN ? AND ? THEN 1 ELSE 0 END) AS line,
            SUM(CASE WHEN meeting_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS meeting
     FROM leads GROUP BY user_id`,
    [start, end, start, end],
  );
  return new Map(
    rows.map((r) => [r.user_id, { line: r.line, meeting: r.meeting }]),
  );
});

export const leadCounts = cache(async function leadCounts(
  start: string,
  end: string,
  userId?: number,
): Promise<LeadCounts> {
  const sql = `SELECT
      SUM(CASE WHEN line_at    BETWEEN ? AND ? THEN 1 ELSE 0 END) AS line,
      SUM(CASE WHEN meeting_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS meeting
    FROM leads${userId !== undefined ? " WHERE user_id = ?" : ""}`;
  const params: unknown[] = [start, end, start, end];
  if (userId !== undefined) params.push(userId);
  const row = await queryOne<Partial<LeadCounts>>(sql, params);
  return { line: row?.line ?? 0, meeting: row?.meeting ?? 0 };
});

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

/**
 * 月内の全運用者の報酬をまとめて計算する。
 * 1人ずつ computeReward を呼ぶと人数×5本のクエリになるため、
 * 一覧画面では必ずこちらを使う。
 */
export const computeRewards = cache(async function computeRewards(
  month: string,
): Promise<Map<number, RewardBreakdown>> {
  const { start, end } = monthRange(month);
  const [users, rates, totals, leads, adjustments, statuses] = await Promise.all([
    listUsers({ includeInactive: true }),
    query<RateCard>(
      `SELECT DISTINCT ON (user_id) * FROM rate_cards
       WHERE effective_month <= ?
       ORDER BY user_id, effective_month DESC`,
      [month],
    ),
    totalsByUser(start, end),
    leadCountsByUser(start, end),
    query<RewardAdjustment>(
      "SELECT * FROM reward_adjustments WHERE month = ? ORDER BY id",
      [month],
    ),
    query<{ user_id: number; status: RewardStatusValue }>(
      "SELECT user_id, status FROM reward_statuses WHERE month = ?",
      [month],
    ),
  ]);

  const rateByUser = new Map(rates.map((r) => [r.user_id, r]));
  const statusByUser = new Map(statuses.map((r) => [r.user_id, r.status]));
  const adjByUser = new Map<number, RewardAdjustment[]>();
  for (const a of adjustments) {
    adjByUser.set(a.user_id, [...(adjByUser.get(a.user_id) ?? []), a]);
  }

  const out = new Map<number, RewardBreakdown>();
  for (const u of users) {
    out.set(
      u.id,
      buildBreakdown({
        userId: u.id,
        month,
        rate: rateByUser.get(u.id) ?? emptyRate(u.id, month),
        totals: totals.get(u.id) ?? { sent: 0, reply: 0 },
        leads: leads.get(u.id) ?? { line: 0, meeting: 0 },
        adjustments: adjByUser.get(u.id) ?? [],
        status: statusByUser.get(u.id) ?? "draft",
      }),
    );
  }
  return out;
});

const emptyRate = (userId: number, month: string): RateCard => ({
  id: 0,
  user_id: userId,
  effective_month: month,
  dm_unit_price: 0,
  reply_unit_price: 0,
  line_bonus: 0,
  meeting_bonus: 0,
  monthly_fixed: 0,
});

function buildBreakdown(a: {
  userId: number;
  month: string;
  rate: RateCard;
  totals: Totals;
  leads: LeadCounts;
  adjustments: RewardAdjustment[];
  status: RewardStatusValue;
}): RewardBreakdown {
  const adjustmentTotal = a.adjustments.reduce((s, x) => s + x.amount, 0);
  const dmAmount = a.totals.sent * a.rate.dm_unit_price;
  const replyAmount = a.totals.reply * a.rate.reply_unit_price;
  const lineAmount = a.leads.line * a.rate.line_bonus;
  const meetingAmount = a.leads.meeting * a.rate.meeting_bonus;
  const fixedAmount = a.rate.monthly_fixed;
  return {
    userId: a.userId,
    month: a.month,
    rate: a.rate,
    sent: a.totals.sent,
    reply: a.totals.reply,
    line: a.leads.line,
    meeting: a.leads.meeting,
    dmAmount,
    replyAmount,
    lineAmount,
    meetingAmount,
    fixedAmount,
    adjustments: a.adjustments,
    adjustmentTotal,
    total:
      dmAmount +
      replyAmount +
      lineAmount +
      meetingAmount +
      fixedAmount +
      adjustmentTotal,
    status: a.status,
  };
}

/** 1人分の報酬。一覧では computeRewards を使うこと。 */
export const computeReward = cache(async function computeReward(
  userId: number,
  month: string,
): Promise<RewardBreakdown> {
  const { start, end } = monthRange(month);
  const [rate, t, lc, adjustments, statusRow] = await Promise.all([
    getEffectiveRate(userId, month),
    totalsInRange(start, end, userId),
    leadCounts(start, end, userId),
    query<RewardAdjustment>(
      "SELECT * FROM reward_adjustments WHERE user_id = ? AND month = ? ORDER BY id",
      [userId, month],
    ),
    queryOne<{ status: RewardStatusValue }>(
      "SELECT status FROM reward_statuses WHERE user_id = ? AND month = ?",
      [userId, month],
    ),
  ]);

  return buildBreakdown({
    userId,
    month,
    rate,
    totals: t,
    leads: lc,
    adjustments,
    status: statusRow?.status ?? "draft",
  });
});

/* ------------------------------------------------------------ templates */

export function listTemplates(userId?: number): Promise<Template[]> {
  if (userId === undefined) {
    return query<Template>(
      "SELECT * FROM templates ORDER BY is_active DESC, user_id, updated_at DESC",
    );
  }
  return query<Template>(
    "SELECT * FROM templates WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC",
    [userId],
  );
}

export function getTemplate(id: number): Promise<Template | null> {
  return queryOne<Template>("SELECT * FROM templates WHERE id = ?", [id]);
}

export function listTemplateRevisions(
  templateId: number,
): Promise<TemplateRevision[]> {
  return query<TemplateRevision>(
    "SELECT * FROM template_revisions WHERE template_id = ? ORDER BY version DESC",
    [templateId],
  );
}
