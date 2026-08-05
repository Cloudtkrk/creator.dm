import { cache } from "react";
import { getSettings, settingNumber } from "./db";
import { addDays, today } from "./date";
import {
  leadCountsByUser,
  listAccounts,
  listUsers,
  replyRate,
  reportedDatesByUser,
  totalsByAccount,
  totalsByUser,
} from "./queries";
import type { User } from "./types";

export type AlertLevel = "danger" | "warn" | "info";

export type Alert = {
  level: AlertLevel;
  userId: number;
  userName: string;
  kind:
    | "reply_rate"
    | "missing_report"
    | "no_activity"
    | "account_reply_rate"
    | "line_rate"
    | "account_banned";
  title: string;
  detail: string;
};

const LEVEL_ORDER: Record<AlertLevel, number> = {
  danger: 0,
  warn: 1,
  info: 2,
};

const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * アラートは全画面のサイドバー（件数バッジ）から呼ばれるうえ、集計に数本の
 * クエリが要る。直近の結果を短時間だけ使い回して往復を減らす。
 * 閾値を変えたときは setSetting から invalidateAlerts() が呼ばれるので、
 * 設定変更が遅れて反映されることはない。
 */
const MEMO_MS = 60_000;
let memo: { at: number; value: Promise<Alert[]> } | undefined;

export function invalidateAlerts() {
  memo = undefined;
}

export function alertsSnapshot(): Promise<Alert[]> {
  const now = Date.now();
  if (!memo || now - memo.at > MEMO_MS) {
    const value = computeAlerts().catch((e) => {
      memo = undefined; // 失敗した結果は残さない
      throw e;
    });
    memo = { at: now, value };
  }
  return memo.value;
}

/**
 * 全ユーザー分のアラートを計算する。userId を渡すとその人の分だけに絞る。
 * 判定は「直近 alert_window_days 日」を対象とし、母数が alert_min_sent
 * 未満の場合は返信率の判定をスキップする（少数だと率が暴れるため）。
 */
export const computeAlerts = cache(async function computeAlerts(
  userId?: number,
): Promise<Alert[]> {
  const settings = await getSettings();
  const windowDays = settingNumber(settings, "alert_window_days");
  const warnRate = settingNumber(settings, "alert_reply_rate_warn");
  const dangerRate = settingNumber(settings, "alert_reply_rate_danger");
  const minSent = settingNumber(settings, "alert_min_sent");
  const missingDays = settingNumber(settings, "alert_missing_report_days");
  const lineRateWarn = settingNumber(settings, "alert_line_rate_warn");

  const end = today();
  const start = addDays(end, -(windowDays - 1));

  const checkStart = addDays(end, -missingDays);
  const [allUsers, userTotals, accountTotals, leads, allAccounts, filledByUser] =
    await Promise.all([
      listUsers(),
      totalsByUser(start, end),
      totalsByAccount(start, end),
      leadCountsByUser(start, end),
      listAccounts(),
      reportedDatesByUser(checkStart, addDays(end, -1)),
    ]);

  const users = allUsers.filter(
    (u) => u.role === "operator" && (userId === undefined || u.id === userId),
  );

  const alerts: Alert[] = [];
  const push = (u: User, a: Omit<Alert, "userId" | "userName">) =>
    alerts.push({ ...a, userId: u.id, userName: u.name });

  for (const u of users) {
    const accounts = allAccounts.filter((a) => a.user_id === u.id);
    const t = userTotals.get(u.id) ?? { sent: 0, reply: 0 };
    const rate = replyRate(t);

    /* 1. 返信率 */
    if (t.sent >= minSent) {
      if (rate < dangerRate) {
        push(u, {
          level: "danger",
          kind: "reply_rate",
          title: `返信率 ${pct(rate)}（危険水準）`,
          detail: `直近${windowDays}日：送付${t.sent}件 / 返信${t.reply}件。危険ライン${dangerRate}%を下回っています。文章の見直しかアカウントの状態確認が必要です。`,
        });
      } else if (rate < warnRate) {
        push(u, {
          level: "warn",
          kind: "reply_rate",
          title: `返信率 ${pct(rate)}（要注意）`,
          detail: `直近${windowDays}日：送付${t.sent}件 / 返信${t.reply}件。注意ライン${warnRate}%を下回っています。`,
        });
      }
    }

    /* 2. 日報の未入力 */
    if (accounts.length > 0 && missingDays > 0) {
      const filled = filledByUser.get(u.id) ?? new Set<string>();
      const missing: string[] = [];
      for (let d = checkStart; d < end; d = addDays(d, 1)) {
        if (!filled.has(d)) missing.push(d);
      }
      if (missing.length > 0) {
        push(u, {
          level: missing.length >= missingDays ? "danger" : "warn",
          kind: "missing_report",
          title: `日報の未入力が${missing.length}日分`,
          detail: `未入力：${missing.join(" / ")}`,
        });
      }
    }

    /* 3. 稼働中アカウントなのに送付ゼロ */
    for (const acc of accounts) {
      if (acc.status !== "active") continue;
      const at = accountTotals.get(acc.id) ?? { sent: 0, reply: 0 };
      if (at.sent === 0) {
        push(u, {
          level: "warn",
          kind: "no_activity",
          title: `@${acc.handle} の送付実績がありません`,
          detail: `稼働中アカウントですが直近${windowDays}日の送付が0件です。アカウント状態（凍結・制限）を確認してください。`,
        });
        continue;
      }
      const ar = replyRate(at);
      if (at.sent >= minSent && ar < dangerRate) {
        push(u, {
          level: "warn",
          kind: "account_reply_rate",
          title: `@${acc.handle} の返信率 ${pct(ar)}`,
          detail: `直近${windowDays}日：送付${at.sent}件 / 返信${at.reply}件。特定アカウントだけ低い場合はシャドウバンの可能性があります。`,
        });
      }
    }

    /* 4. BAN / 停止中アカウント */
    const dead = accounts.filter((a) => a.status === "banned");
    if (dead.length > 0) {
      push(u, {
        level: "info",
        kind: "account_banned",
        title: `BANアカウント ${dead.length}件`,
        detail:
          dead.map((a) => `@${a.handle}`).join(" / ") +
          "（代替アカウントの用意を検討）",
      });
    }

    /* 5. 返信 → LINE登録の転換率 */
    const lc = leads.get(u.id) ?? { line: 0, meeting: 0, closed: 0 };
    if (t.reply >= 10) {
      const lineRate = (lc.line / t.reply) * 100;
      if (lineRate < lineRateWarn) {
        push(u, {
          level: "warn",
          kind: "line_rate",
          title: `LINE転換率 ${pct(lineRate)}`,
          detail: `直近${windowDays}日：返信${t.reply}件に対しLINE登録${lc.line}件。注意ライン${lineRateWarn}%を下回っています。返信後のトークスクリプトを確認してください。`,
        });
      }
    }
  }

  return alerts.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      a.userName.localeCompare(b.userName, "ja"),
  );
});
