"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, setSetting } from "@/lib/db";
import { nowIso, today } from "@/lib/date";
import {
  assertCanAccessUser,
  assertOwnsAccount,
  destroySession,
  hashPassword,
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import {
  getAccount,
  getLead,
  getTemplate,
  getUserByLoginId,
} from "@/lib/queries";
import type { LeadStage } from "@/lib/types";

/* ------------------------------------------------------------- helpers */

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? n : 0;
};
const intOrNull = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v ? Number(v) : null;
};
const dateOrNull = (fd: FormData, key: string) => str(fd, key) || null;

/** 処理結果をクエリに載せて元の画面に戻す。path はクエリ付きでもよい。 */
function back(path: string, message: string, type: "ok" | "err" = "ok"): never {
  const [base, qs] = path.split("?");
  const params = new URLSearchParams(qs);
  params.set("msg", message);
  params.set("t", type);
  revalidatePath(base);
  redirect(`${base}?${params.toString()}`);
}

/**
 * 同じ操作を管理画面と運用者画面の両方から行うため、フォームの back_to で
 * 戻り先を指定できるようにする。外部URLへ飛ばされないよう相対パスのみ許可。
 */
function returnTo(fd: FormData, fallback: string): string {
  const to = str(fd, "back_to");
  return to.startsWith("/") && !to.startsWith("//") ? to : fallback;
}

/* ---------------------------------------------------------------- auth */

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* --------------------------------------------------------------- 日報 */

/** 1日分をアカウントごとにまとめて保存する（0件の行は削除ではなく0で記録）。 */
export async function saveDailyReports(fd: FormData) {
  const user = await requireUser();
  const date = str(fd, "date") || today();
  const accountIds = fd
    .getAll("account_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  // 管理者が他の運用者の代わりに入力することがあるため、対象者も引き継ぐ
  const home = returnTo(fd, "/daily");
  const target = str(fd, "target_user");
  const query = `?date=${date}${target ? `&user=${target}` : ""}`;
  if (accountIds.length === 0)
    back(home, "保存対象のアカウントがありません。", "err");

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO daily_reports (account_id, report_date, sent_count, reply_count, memo, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, report_date) DO UPDATE SET
       sent_count = excluded.sent_count,
       reply_count = excluded.reply_count,
       memo = excluded.memo,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  );

  const rows = accountIds.map((id) => {
    assertOwnsAccount(user, id);
    const sent = Math.max(0, Math.trunc(num(fd, `sent_${id}`)));
    const reply = Math.max(0, Math.trunc(num(fd, `reply_${id}`)));
    if (reply > sent) {
      back(
        `${home}${query}`,
        `@${getAccount(id)?.handle ?? id} の返信数（${reply}）が送付数（${sent}）を上回っています。入力を確認してください。`,
        "err",
      );
    }
    return { id, sent, reply, memo: str(fd, `memo_${id}`) };
  });

  const ts = nowIso();
  db.transaction(() => {
    for (const r of rows) {
      upsert.run(r.id, date, r.sent, r.reply, r.memo, user.id, ts);
    }
  })();

  const total = rows.reduce((s, r) => s + r.sent, 0);
  back(
    `${home}${query}`,
    `${date} の実績を保存しました（送付 ${total}件）。`,
  );
}

/* ---------------------------------------------------------- アカウント */

export async function saveAccount(fd: FormData) {
  const user = await requireUser();
  const id = intOrNull(fd, "id");
  const targetUserId =
    user.role === "admin" ? num(fd, "user_id") || user.id : user.id;
  assertCanAccessUser(user, targetUserId);

  const handle = str(fd, "handle").replace(/^@/, "");
  if (!handle) back("/accounts", "アカウントIDを入力してください。", "err");

  const db = getDb();
  try {
    if (id) {
      assertOwnsAccount(user, id);
      db.prepare(
        `UPDATE tiktok_accounts
         SET user_id = ?, handle = ?, nickname = ?, status = ?, daily_goal = ?, memo = ?
         WHERE id = ?`,
      ).run(
        targetUserId,
        handle,
        str(fd, "nickname"),
        str(fd, "status") || "active",
        Math.max(0, Math.trunc(num(fd, "daily_goal"))),
        str(fd, "memo"),
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO tiktok_accounts (user_id, handle, nickname, status, daily_goal, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        targetUserId,
        handle,
        str(fd, "nickname"),
        str(fd, "status") || "active",
        Math.max(0, Math.trunc(num(fd, "daily_goal"))),
        str(fd, "memo"),
        nowIso(),
      );
    }
  } catch (e) {
    const msg = String(e);
    if (msg.includes("UNIQUE")) {
      back("/accounts", `@${handle} は既に登録されています。`, "err");
    }
    throw e;
  }
  back("/accounts", `@${handle} を保存しました。`);
}

export async function deleteAccount(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  assertOwnsAccount(user, id);
  getDb().prepare("DELETE FROM tiktok_accounts WHERE id = ?").run(id);
  back("/accounts", "アカウントと紐づく日報を削除しました。");
}

/* -------------------------------------------------------------- 文章 */

export async function saveTemplate(fd: FormData) {
  const user = await requireUser();
  const id = intOrNull(fd, "id");
  const targetUserId =
    user.role === "admin" ? num(fd, "user_id") || user.id : user.id;
  assertCanAccessUser(user, targetUserId);

  const title = str(fd, "title");
  const body = String(fd.get("body") ?? "");
  const note = str(fd, "note");
  if (!title || !body.trim()) {
    back(returnTo(fd, "/templates"), "タイトルと本文の両方を入力してください。", "err");
  }

  const db = getDb();
  const ts = nowIso();

  if (id) {
    const current = getTemplate(id);
    if (!current) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
    assertCanAccessUser(user, current.user_id);

    const dest = returnTo(fd, `/templates/${id}`);
    if (current.title === title && current.body === body) {
      back(dest, "変更内容がありません。", "err");
    }
    const version = current.version + 1;
    db.transaction(() => {
      db.prepare(
        `UPDATE templates SET title = ?, body = ?, version = ?, updated_at = ? WHERE id = ?`,
      ).run(title, body, version, ts, id);
      db.prepare(
        `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, version, title, body, note, user.id, ts);
    })();
    back(dest, `v${version} として保存しました。`);
  }

  const info = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO templates (user_id, title, body, version, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(targetUserId, title, body, ts, ts);
    db.prepare(
      `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
    ).run(r.lastInsertRowid, title, body, note || "初版", user.id, ts);
    return r;
  })();

  back(
    returnTo(fd, `/templates/${Number(info.lastInsertRowid)}`),
    "文章を作成しました。",
  );
}

export async function toggleTemplateActive(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const t = getTemplate(id);
  if (!t) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);
  getDb()
    .prepare("UPDATE templates SET is_active = ?, updated_at = ? WHERE id = ?")
    .run(t.is_active ? 0 : 1, nowIso(), id);
  back(
    returnTo(fd, "/templates"),
    t.is_active ? "使用停止にしました。" : "使用中に戻しました。",
  );
}

export async function restoreTemplateRevision(fd: FormData) {
  const user = await requireUser();
  const templateId = num(fd, "template_id");
  const revisionId = num(fd, "revision_id");
  const t = getTemplate(templateId);
  if (!t) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);

  const dest = returnTo(fd, `/templates/${templateId}`);
  const db = getDb();
  const rev = db
    .prepare("SELECT * FROM template_revisions WHERE id = ? AND template_id = ?")
    .get(revisionId, templateId) as
    | { version: number; title: string; body: string }
    | undefined;
  if (!rev) back(dest, "履歴が見つかりません。", "err");

  const version = t.version + 1;
  const ts = nowIso();
  db.transaction(() => {
    db.prepare(
      "UPDATE templates SET title = ?, body = ?, version = ?, updated_at = ? WHERE id = ?",
    ).run(rev.title, rev.body, version, ts, templateId);
    db.prepare(
      `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      templateId,
      version,
      rev.title,
      rev.body,
      `v${rev.version} から復元`,
      user.id,
      ts,
    );
  })();
  back(dest, `v${rev.version} の内容を復元しました。`);
}

export async function deleteTemplate(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const t = getTemplate(id);
  if (!t) back("/templates", "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);
  getDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
  back("/templates", "文章を削除しました。");
}

/* -------------------------------------------------------------- リード */

const STAGE_DATE_COLUMN: Record<LeadStage, string | null> = {
  replied: "replied_at",
  line: "line_at",
  meeting: "meeting_at",
  closed: "closed_at",
  lost: null,
};

export async function saveLead(fd: FormData) {
  const user = await requireUser();
  const id = intOrNull(fd, "id");
  const targetUserId =
    user.role === "admin" ? num(fd, "user_id") || user.id : user.id;
  assertCanAccessUser(user, targetUserId);

  const handle = str(fd, "creator_handle").replace(/^@/, "");
  if (!handle) back(returnTo(fd, "/leads"), "クリエイターのアカウントIDを入力してください。", "err");

  const stage = (str(fd, "stage") || "replied") as LeadStage;
  const accountId = intOrNull(fd, "account_id");
  if (accountId) assertOwnsAccount(user, accountId);

  const ts = nowIso();
  const values = {
    replied_at: dateOrNull(fd, "replied_at") ?? today(),
    line_at: dateOrNull(fd, "line_at"),
    meeting_at: dateOrNull(fd, "meeting_at"),
    closed_at: dateOrNull(fd, "closed_at"),
  };
  // ステージを進めたのに日付が空なら今日で補完する（報酬集計は日付ベースのため）
  const col = STAGE_DATE_COLUMN[stage];
  if (col && !values[col as keyof typeof values]) {
    values[col as keyof typeof values] = today();
  }

  const db = getDb();
  if (id) {
    const lead = getLead(id);
    if (!lead) back("/leads", "リードが見つかりません。", "err");
    assertCanAccessUser(user, lead.user_id);
    db.prepare(
      `UPDATE leads SET user_id = ?, account_id = ?, creator_handle = ?, creator_name = ?,
        stage = ?, replied_at = ?, line_at = ?, meeting_at = ?, closed_at = ?, memo = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      targetUserId,
      accountId,
      handle,
      str(fd, "creator_name"),
      stage,
      values.replied_at,
      values.line_at,
      values.meeting_at,
      values.closed_at,
      str(fd, "memo"),
      ts,
      id,
    );
    back(returnTo(fd, "/leads"), `@${handle} を更新しました。`);
  }

  db.prepare(
    `INSERT INTO leads (user_id, account_id, creator_handle, creator_name, stage,
       replied_at, line_at, meeting_at, closed_at, memo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    targetUserId,
    accountId,
    handle,
    str(fd, "creator_name"),
    stage,
    values.replied_at,
    values.line_at,
    values.meeting_at,
    values.closed_at,
    str(fd, "memo"),
    ts,
    ts,
  );
  back(returnTo(fd, "/leads"), `@${handle} を登録しました。`);
}

/** 一覧からワンクリックでステージを進める。 */
export async function advanceLead(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const stage = str(fd, "stage") as LeadStage;
  const lead = getLead(id);
  if (!lead) back("/leads", "リードが見つかりません。", "err");
  assertCanAccessUser(user, lead.user_id);

  const col = STAGE_DATE_COLUMN[stage];
  const ts = nowIso();
  if (col && !lead[col as keyof typeof lead]) {
    getDb()
      .prepare(
        `UPDATE leads SET stage = ?, ${col} = ?, updated_at = ? WHERE id = ?`,
      )
      .run(stage, today(), ts, id);
  } else {
    getDb()
      .prepare("UPDATE leads SET stage = ?, updated_at = ? WHERE id = ?")
      .run(stage, ts, id);
  }
  back(returnTo(fd, "/leads"), `@${lead.creator_handle} のステージを更新しました。`);
}

export async function deleteLead(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const lead = getLead(id);
  if (!lead) back("/leads", "リードが見つかりません。", "err");
  assertCanAccessUser(user, lead.user_id);
  getDb().prepare("DELETE FROM leads WHERE id = ?").run(id);
  back(returnTo(fd, "/leads"), "リードを削除しました。");
}

/* ------------------------------------------------------- メンバー(管理者) */

export async function saveMember(fd: FormData) {
  await requireAdmin();
  const id = intOrNull(fd, "id");
  const name = str(fd, "name");
  const loginId = str(fd, "login_id");
  const role = str(fd, "role") === "admin" ? "admin" : "operator";
  const password = str(fd, "password");

  if (!name || !loginId) back("/members", "氏名とログインIDは必須です。", "err");

  const db = getDb();
  if (id) {
    const dup = getUserByLoginId(loginId);
    if (dup && dup.id !== id) {
      back("/members", `ログインID「${loginId}」は既に使われています。`, "err");
    }
    db.prepare(
      "UPDATE users SET name = ?, login_id = ?, role = ?, memo = ? WHERE id = ?",
    ).run(name, loginId, role, str(fd, "memo"), id);
    if (password) {
      if (password.length < 8) {
        back("/members", "パスワードは8文字以上にしてください。", "err");
      }
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        hashPassword(password),
        id,
      );
    }
    back("/members", `${name} を更新しました。`);
  }

  if (password.length < 8) {
    back("/members", "パスワードは8文字以上にしてください。", "err");
  }
  if (getUserByLoginId(loginId)) {
    back("/members", `ログインID「${loginId}」は既に使われています。`, "err");
  }
  db.prepare(
    `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(name, loginId, hashPassword(password), role, str(fd, "memo"), nowIso());
  back("/members", `${name} を追加しました。`);
}

export async function toggleMemberActive(fd: FormData) {
  const admin = await requireAdmin();
  const id = num(fd, "id");
  if (id === admin.id) back("/members", "自分自身は無効化できません。", "err");
  const row = getDb()
    .prepare("SELECT is_active, name FROM users WHERE id = ?")
    .get(id) as { is_active: number; name: string } | undefined;
  if (!row) back("/members", "メンバーが見つかりません。", "err");
  getDb()
    .prepare("UPDATE users SET is_active = ? WHERE id = ?")
    .run(row.is_active ? 0 : 1, id);
  back("/members", `${row.name} を${row.is_active ? "無効化" : "有効化"}しました。`);
}

export async function saveRateCard(fd: FormData) {
  await requireAdmin();
  const userId = num(fd, "user_id");
  const month = str(fd, "effective_month");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    back("/members", "適用開始月を YYYY-MM 形式で指定してください。", "err");
  }
  getDb()
    .prepare(
      `INSERT INTO rate_cards (user_id, effective_month, dm_unit_price, reply_unit_price, line_bonus, meeting_bonus, monthly_fixed)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, effective_month) DO UPDATE SET
         dm_unit_price = excluded.dm_unit_price,
         reply_unit_price = excluded.reply_unit_price,
         line_bonus = excluded.line_bonus,
         meeting_bonus = excluded.meeting_bonus,
         monthly_fixed = excluded.monthly_fixed`,
    )
    .run(
      userId,
      month,
      Math.trunc(num(fd, "dm_unit_price")),
      Math.trunc(num(fd, "reply_unit_price")),
      Math.trunc(num(fd, "line_bonus")),
      Math.trunc(num(fd, "meeting_bonus")),
      Math.trunc(num(fd, "monthly_fixed")),
    );
  back(`/members/${userId}`, `${month} 以降の単価を保存しました。`);
}

export async function deleteRateCard(fd: FormData) {
  await requireAdmin();
  const id = num(fd, "id");
  const userId = num(fd, "user_id");
  getDb().prepare("DELETE FROM rate_cards WHERE id = ?").run(id);
  back(`/members/${userId}`, "単価設定を削除しました。");
}

/* ---------------------------------------------------------- 報酬(管理者) */

export async function addAdjustment(fd: FormData) {
  await requireAdmin();
  const userId = num(fd, "user_id");
  const month = str(fd, "month");
  const amount = Math.trunc(num(fd, "amount"));
  if (!amount) back(`/rewards?month=${month}`, "金額を入力してください。", "err");
  getDb()
    .prepare(
      "INSERT INTO reward_adjustments (user_id, month, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(userId, month, amount, str(fd, "reason"), nowIso());
  back(`/rewards/${userId}?month=${month}`, "調整を追加しました。");
}

export async function deleteAdjustment(fd: FormData) {
  await requireAdmin();
  const id = num(fd, "id");
  const userId = num(fd, "user_id");
  const month = str(fd, "month");
  getDb().prepare("DELETE FROM reward_adjustments WHERE id = ?").run(id);
  back(`/rewards/${userId}?month=${month}`, "調整を削除しました。");
}

export async function setRewardStatus(fd: FormData) {
  await requireAdmin();
  const userId = num(fd, "user_id");
  const month = str(fd, "month");
  const status = str(fd, "status");
  if (!["draft", "confirmed", "paid"].includes(status)) {
    back(`/rewards?month=${month}`, "不正なステータスです。", "err");
  }
  getDb()
    .prepare(
      `INSERT INTO reward_statuses (user_id, month, status, confirmed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, month) DO UPDATE SET status = excluded.status, confirmed_at = excluded.confirmed_at`,
    )
    .run(userId, month, status, status === "draft" ? null : nowIso());
  back(`/rewards?month=${month}`, "支払ステータスを更新しました。");
}

/* -------------------------------------------------------- 設定(管理者) */

const SETTING_KEYS = [
  "alert_reply_rate_warn",
  "alert_reply_rate_danger",
  "alert_window_days",
  "alert_min_sent",
  "alert_missing_report_days",
  "alert_line_rate_warn",
];

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  for (const key of SETTING_KEYS) {
    const raw = str(fd, key);
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      back("/settings", `${key} の値が不正です。`, "err");
    }
    setSetting(key, String(n));
  }
  back("/settings", "アラート設定を保存しました。");
}
