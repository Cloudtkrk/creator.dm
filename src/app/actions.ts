"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exec, queryOne, setSetting, transaction } from "@/lib/db";
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
import { deriveStage, type TemplateKind } from "@/lib/types";

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
  const q = `?date=${date}${target ? `&user=${target}` : ""}`;
  if (accountIds.length === 0)
    back(home, "保存対象のアカウントがありません。", "err");

  const rows: { id: number; sent: number; reply: number; memo: string }[] = [];
  for (const id of accountIds) {
    await assertOwnsAccount(user, id);
    const sent = Math.max(0, Math.trunc(num(fd, `sent_${id}`)));
    const reply = Math.max(0, Math.trunc(num(fd, `reply_${id}`)));
    if (reply > sent) {
      const acc = await getAccount(id);
      back(
        `${home}${q}`,
        `@${acc?.handle ?? id} の返信数（${reply}）が送付数（${sent}）を上回っています。入力を確認してください。`,
        "err",
      );
    }
    rows.push({ id, sent, reply, memo: str(fd, `memo_${id}`) });
  }

  const ts = nowIso();
  await transaction(async (tx) => {
    for (const r of rows) {
      await tx.exec(
        `INSERT INTO daily_reports (account_id, report_date, sent_count, reply_count, memo, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, report_date) DO UPDATE SET
           sent_count = EXCLUDED.sent_count,
           reply_count = EXCLUDED.reply_count,
           memo = EXCLUDED.memo,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at`,
        [r.id, date, r.sent, r.reply, r.memo, user.id, ts],
      );
    }
  });

  const total = rows.reduce((s, r) => s + r.sent, 0);
  back(`${home}${q}`, `${date} の実績を保存しました（送付 ${total}件）。`);
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

  const status = str(fd, "status") || "active";
  const goal = Math.max(0, Math.trunc(num(fd, "daily_goal")));

  try {
    if (id) {
      await assertOwnsAccount(user, id);
      await exec(
        `UPDATE tiktok_accounts
         SET user_id = ?, handle = ?, nickname = ?, status = ?, daily_goal = ?, memo = ?
         WHERE id = ?`,
        [
          targetUserId,
          handle,
          str(fd, "nickname"),
          status,
          goal,
          str(fd, "memo"),
          id,
        ],
      );
    } else {
      await exec(
        `INSERT INTO tiktok_accounts (user_id, handle, nickname, status, daily_goal, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          targetUserId,
          handle,
          str(fd, "nickname"),
          status,
          goal,
          str(fd, "memo"),
          nowIso(),
        ],
      );
    }
  } catch (e) {
    if (String(e).includes("duplicate key")) {
      back("/accounts", `@${handle} は既に登録されています。`, "err");
    }
    throw e;
  }
  back("/accounts", `@${handle} を保存しました。`);
}

export async function deleteAccount(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  await assertOwnsAccount(user, id);
  await exec("DELETE FROM tiktok_accounts WHERE id = ?", [id]);
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
  const kind: TemplateKind = str(fd, "kind") === "reply" ? "reply" : "dm";
  if (!title || !body.trim()) {
    back(
      returnTo(fd, "/templates"),
      "タイトルと本文の両方を入力してください。",
      "err",
    );
  }

  const ts = nowIso();

  if (id) {
    const current = await getTemplate(id);
    if (!current) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
    assertCanAccessUser(user, current.user_id);

    const dest = returnTo(fd, `/templates/${id}`);
    if (
      current.title === title &&
      current.body === body &&
      current.kind === kind
    ) {
      back(dest, "変更内容がありません。", "err");
    }
    const version = current.version + 1;
    await transaction(async (tx) => {
      await tx.exec(
        "UPDATE templates SET title = ?, body = ?, kind = ?, version = ?, updated_at = ? WHERE id = ?",
        [title, body, kind, version, ts, id],
      );
      await tx.exec(
        `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, version, title, body, note, user.id, ts],
      );
    });
    back(dest, `v${version} として保存しました。`);
  }

  const newId = await transaction(async (tx) => {
    const [row] = await tx.query<{ id: number }>(
      `INSERT INTO templates (user_id, title, body, kind, version, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?) RETURNING id`,
      [targetUserId, title, body, kind, ts, ts],
    );
    await tx.exec(
      `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
      [row.id, title, body, note || "初版", user.id, ts],
    );
    return row.id;
  });

  back(returnTo(fd, `/templates/${newId}`), "文章を作成しました。");
}

export async function toggleTemplateActive(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const t = await getTemplate(id);
  if (!t) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);
  await exec(
    "UPDATE templates SET is_active = ?, updated_at = ? WHERE id = ?",
    [t.is_active ? 0 : 1, nowIso(), id],
  );
  back(
    returnTo(fd, "/templates"),
    t.is_active ? "使用停止にしました。" : "使用中に戻しました。",
  );
}

export async function restoreTemplateRevision(fd: FormData) {
  const user = await requireUser();
  const templateId = num(fd, "template_id");
  const revisionId = num(fd, "revision_id");
  const t = await getTemplate(templateId);
  if (!t) back(returnTo(fd, "/templates"), "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);

  const dest = returnTo(fd, `/templates/${templateId}`);
  const rev = await queryOne<{ version: number; title: string; body: string }>(
    "SELECT * FROM template_revisions WHERE id = ? AND template_id = ?",
    [revisionId, templateId],
  );
  if (!rev) back(dest, "履歴が見つかりません。", "err");

  const version = t.version + 1;
  const ts = nowIso();
  await transaction(async (tx) => {
    await tx.exec(
      "UPDATE templates SET title = ?, body = ?, version = ?, updated_at = ? WHERE id = ?",
      [rev.title, rev.body, version, ts, templateId],
    );
    await tx.exec(
      `INSERT INTO template_revisions (template_id, version, title, body, note, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        version,
        rev.title,
        rev.body,
        `v${rev.version} から復元`,
        user.id,
        ts,
      ],
    );
  });
  back(dest, `v${rev.version} の内容を復元しました。`);
}

export async function deleteTemplate(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const t = await getTemplate(id);
  if (!t) back("/templates", "文章が見つかりません。", "err");
  assertCanAccessUser(user, t.user_id);
  await exec("DELETE FROM templates WHERE id = ?", [id]);
  back("/templates", "文章を削除しました。");
}

/* -------------------------------------------------------------- リード */

/**
 * チェックボックスは未チェックだと何も送られてこないため、同名の hidden("0") を
 * 併記して「その項目がフォームに存在したか」を判別できるようにしている。
 */
const hasField = (fd: FormData, key: string) => fd.getAll(key).length > 0;
const isChecked = (fd: FormData, key: string) =>
  fd.getAll(key).some((v) => String(v) === "1");

/**
 * 「有無チェック＋日付」または「日付のみ」のどちらの形でも受け取れるようにする。
 * チェックを外したら日付は消し、チェックしたのに日付が空なら今日を入れる。
 */
function milestoneDate(
  fd: FormData,
  flagKey: string,
  dateKey: string,
): string | null {
  if (!hasField(fd, flagKey)) return dateOrNull(fd, dateKey);
  return isChecked(fd, flagKey) ? (dateOrNull(fd, dateKey) ?? today()) : null;
}

export async function saveLead(fd: FormData) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const id = intOrNull(fd, "id");
  const home = returnTo(fd, "/leads");

  const existing = id ? await getLead(id) : null;
  if (id && !existing) back(home, "リードが見つかりません。", "err");
  if (existing) assertCanAccessUser(user, existing.user_id);

  const targetUserId = isAdmin
    ? num(fd, "user_id") || existing?.user_id || user.id
    : user.id;
  assertCanAccessUser(user, targetUserId);

  const handle = str(fd, "creator_handle").replace(/^@/, "");
  if (!handle) {
    back(home, "クリエイターのアカウントIDを入力してください。", "err");
  }

  const accountId = intOrNull(fd, "account_id");
  if (accountId) await assertOwnsAccount(user, accountId);

  const repliedAt = dateOrNull(fd, "replied_at") ?? today();
  // 作業者が申告する「LINE誘導日」。管理者が確認する「LINE登録」とは別物。
  const guidedAt = dateOrNull(fd, "line_guided_at");

  // LINE登録の確認・面談・見送りは管理者が管理する。
  // 運用者の保存では既存の値をそのまま保つ。
  const lineAt = isAdmin
    ? milestoneDate(fd, "has_line", "line_at")
    : (existing?.line_at ?? null);
  const meetingAt = isAdmin
    ? milestoneDate(fd, "has_meeting", "meeting_at")
    : (existing?.meeting_at ?? null);
  const lost = isAdmin ? isChecked(fd, "is_lost") : existing?.stage === "lost";

  const stage = deriveStage({ guidedAt, lineAt, meetingAt, lost });
  const name = isAdmin ? str(fd, "creator_name") : (existing?.creator_name ?? "");
  const memo = isAdmin ? str(fd, "memo") : (existing?.memo ?? "");
  const ts = nowIso();

  if (existing) {
    await exec(
      `UPDATE leads SET user_id = ?, account_id = ?, creator_handle = ?, creator_name = ?,
        stage = ?, replied_at = ?, line_guided_at = ?, line_at = ?, meeting_at = ?,
        memo = ?, updated_at = ?
       WHERE id = ?`,
      [
        targetUserId,
        accountId,
        handle,
        name,
        stage,
        repliedAt,
        guidedAt,
        lineAt,
        meetingAt,
        memo,
        ts,
        existing.id,
      ],
    );
    back(home, `@${handle} を更新しました。`);
  }

  await exec(
    `INSERT INTO leads (user_id, account_id, creator_handle, creator_name, stage,
       replied_at, line_guided_at, line_at, meeting_at, memo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      targetUserId,
      accountId,
      handle,
      name,
      stage,
      repliedAt,
      guidedAt,
      lineAt,
      meetingAt,
      memo,
      ts,
      ts,
    ],
  );
  back(home, `@${handle} を登録しました。`);
}

const MILESTONE_COLUMN = {
  guided: "line_guided_at",
  line: "line_at",
  meeting: "meeting_at",
} as const;

const MILESTONE_LABEL = {
  guided: "LINE誘導",
  line: "LINE登録",
  meeting: "面談実施",
} as const;

/** 一覧からワンクリックで各段階の到達／取り消しを切り替える。 */
export async function setLeadMilestone(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const field = str(fd, "field") as keyof typeof MILESTONE_COLUMN;
  const on = str(fd, "on") === "1";
  const home = returnTo(fd, "/leads");

  if (!(field in MILESTONE_COLUMN)) back(home, "不正な操作です。", "err");
  // 作業者が触れるのはLINE誘導の申告まで。LINE登録の確認と面談は管理者のみ。
  if (field !== "guided" && user.role !== "admin") {
    back(home, "LINE登録の確認と面談の記録は管理者のみが行えます。", "err");
  }

  const lead = await getLead(id);
  if (!lead) back(home, "リードが見つかりません。", "err");
  assertCanAccessUser(user, lead.user_id);

  const dates = {
    guidedAt: lead.line_guided_at,
    lineAt: lead.line_at,
    meetingAt: lead.meeting_at,
  };
  const key = (
    { guided: "guidedAt", line: "lineAt", meeting: "meetingAt" } as const
  )[field];
  dates[key] = on ? (lead[MILESTONE_COLUMN[field]] ?? today()) : null;

  await exec(
    `UPDATE leads SET ${MILESTONE_COLUMN[field]} = ?, stage = ?, updated_at = ? WHERE id = ?`,
    [
      dates[key],
      deriveStage({ ...dates, lost: lead.stage === "lost" }),
      nowIso(),
      id,
    ],
  );
  back(
    home,
    `@${lead.creator_handle} を${MILESTONE_LABEL[field]}${on ? "済み" : "未"}にしました。`,
  );
}

export async function deleteLead(fd: FormData) {
  const user = await requireUser();
  const id = num(fd, "id");
  const lead = await getLead(id);
  if (!lead) back(returnTo(fd, "/leads"), "リードが見つかりません。", "err");
  assertCanAccessUser(user, lead.user_id);
  await exec("DELETE FROM leads WHERE id = ?", [id]);
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

  if (id) {
    const dup = await getUserByLoginId(loginId);
    if (dup && dup.id !== id) {
      back("/members", `ログインID「${loginId}」は既に使われています。`, "err");
    }
    await exec(
      "UPDATE users SET name = ?, login_id = ?, role = ?, memo = ? WHERE id = ?",
      [name, loginId, role, str(fd, "memo"), id],
    );
    if (password) {
      if (password.length < 8) {
        back("/members", "パスワードは8文字以上にしてください。", "err");
      }
      await exec("UPDATE users SET password_hash = ? WHERE id = ?", [
        hashPassword(password),
        id,
      ]);
    }
    back("/members", `${name} を更新しました。`);
  }

  if (password.length < 8) {
    back("/members", "パスワードは8文字以上にしてください。", "err");
  }
  if (await getUserByLoginId(loginId)) {
    back("/members", `ログインID「${loginId}」は既に使われています。`, "err");
  }
  await exec(
    `INSERT INTO users (name, login_id, password_hash, role, is_active, memo, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [name, loginId, hashPassword(password), role, str(fd, "memo"), nowIso()],
  );
  back("/members", `${name} を追加しました。`);
}

export async function toggleMemberActive(fd: FormData) {
  const admin = await requireAdmin();
  const id = num(fd, "id");
  if (id === admin.id) back("/members", "自分自身は無効化できません。", "err");
  const row = await queryOne<{ is_active: number; name: string }>(
    "SELECT is_active, name FROM users WHERE id = ?",
    [id],
  );
  if (!row) back("/members", "メンバーが見つかりません。", "err");
  await exec("UPDATE users SET is_active = ? WHERE id = ?", [
    row.is_active ? 0 : 1,
    id,
  ]);
  back(
    "/members",
    `${row.name} を${row.is_active ? "無効化" : "有効化"}しました。`,
  );
}

export async function saveRateCard(fd: FormData) {
  await requireAdmin();
  const userId = num(fd, "user_id");
  const month = str(fd, "effective_month");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    back("/members", "適用開始月を YYYY-MM 形式で指定してください。", "err");
  }
  await exec(
    `INSERT INTO rate_cards (user_id, effective_month, dm_unit_price, reply_unit_price, line_bonus, meeting_bonus, monthly_fixed)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, effective_month) DO UPDATE SET
       dm_unit_price = EXCLUDED.dm_unit_price,
       reply_unit_price = EXCLUDED.reply_unit_price,
       line_bonus = EXCLUDED.line_bonus,
       meeting_bonus = EXCLUDED.meeting_bonus,
       monthly_fixed = EXCLUDED.monthly_fixed`,
    [
      userId,
      month,
      Math.trunc(num(fd, "dm_unit_price")),
      Math.trunc(num(fd, "reply_unit_price")),
      Math.trunc(num(fd, "line_bonus")),
      Math.trunc(num(fd, "meeting_bonus")),
      Math.trunc(num(fd, "monthly_fixed")),
    ],
  );
  back(`/members/${userId}`, `${month} 以降の単価を保存しました。`);
}

export async function deleteRateCard(fd: FormData) {
  await requireAdmin();
  const id = num(fd, "id");
  const userId = num(fd, "user_id");
  await exec("DELETE FROM rate_cards WHERE id = ?", [id]);
  back(`/members/${userId}`, "単価設定を削除しました。");
}

/* ---------------------------------------------------------- 報酬(管理者) */

export async function addAdjustment(fd: FormData) {
  await requireAdmin();
  const userId = num(fd, "user_id");
  const month = str(fd, "month");
  const amount = Math.trunc(num(fd, "amount"));
  if (!amount) back(`/rewards?month=${month}`, "金額を入力してください。", "err");
  await exec(
    "INSERT INTO reward_adjustments (user_id, month, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, month, amount, str(fd, "reason"), nowIso()],
  );
  back(`/rewards/${userId}?month=${month}`, "調整を追加しました。");
}

export async function deleteAdjustment(fd: FormData) {
  await requireAdmin();
  const id = num(fd, "id");
  const userId = num(fd, "user_id");
  const month = str(fd, "month");
  await exec("DELETE FROM reward_adjustments WHERE id = ?", [id]);
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
  await exec(
    `INSERT INTO reward_statuses (user_id, month, status, confirmed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, month) DO UPDATE SET status = EXCLUDED.status, confirmed_at = EXCLUDED.confirmed_at`,
    [userId, month, status, status === "draft" ? null : nowIso()],
  );
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
    await setSetting(key, String(n));
  }
  back("/settings", "アラート設定を保存しました。");
}
