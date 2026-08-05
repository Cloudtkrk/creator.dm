import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings, settingNumber } from "@/lib/db";
import { addDays, formatShortDate, lastNDates, today } from "@/lib/date";
import {
  dailySeries,
  listAccounts,
  listUsers,
  replyRate,
  reportsOnDate,
  totalsInRange,
} from "@/lib/queries";
import { ACCOUNT_STATUS_LABEL } from "@/lib/types";
import { Flash, RateBadge, Stat } from "@/components/ui";
import { saveDailyReports } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; user?: string; msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today();
  const week = lastNDates(date, 7);

  // 対象者は一覧から決まるので、ここだけは先に引く必要がある
  const [allUsers, settings] = await Promise.all([listUsers(), getSettings()]);
  const operators = allUsers.filter((u) => u.role === "operator");
  const targetUserId = Number(sp.user) || operators[0]?.id || 0;
  const targetName =
    operators.find((u) => u.id === targetUserId)?.name ?? "運用者未登録";

  // 対象者が決まったあとの読み込みは、1本ずつ待たずまとめて投げる
  const [accounts, existing, dayTotals, weekSeries, weekTotals] =
    await Promise.all([
      listAccounts(targetUserId),
      reportsOnDate(date, targetUserId),
      totalsInRange(date, date, targetUserId),
      dailySeries(week[0], date, targetUserId),
      totalsInRange(week[0], date, targetUserId),
    ]);
  const seriesMap = new Map(weekSeries.map((d) => [d.date, d]));

  const warn = settingNumber(settings, "alert_reply_rate_warn");
  const danger = settingNumber(settings, "alert_reply_rate_danger");

  // 日付や対象者を切り替えたときに入力欄を作り直すための識別子
  const formKey = `${targetUserId}|${date}|${accounts
    .map((a) => {
      const cur = existing.get(a.id);
      return `${a.id}:${cur?.sent ?? 0}:${cur?.reply ?? 0}`;
    })
    .join(",")}`;

  const goalTotal = accounts
    .filter((a) => a.status === "active")
    .reduce((s, a) => s + a.daily_goal, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>日報の代理入力</h1>
          <p>
            運用者は自分の入力画面（/my）から登録します。この画面は、運用者が入力できない
            ときに管理者が代わりに登録・修正するためのものです。
          </p>
        </div>
        <form className="toolbar">
          <label className="field">
            <span>運用者</span>
            <select name="user" defaultValue={String(targetUserId)}>
              {operators.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>対象日</span>
            <input type="date" name="date" defaultValue={date} max={today()} />
          </label>
          <button className="btn" type="submit">
            表示
          </button>
        </form>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-4">
        <Stat
          label={`${formatShortDate(date)} の送付`}
          value={dayTotals.sent.toLocaleString("ja-JP")}
          unit="件"
          sub={goalTotal > 0 ? `目標 ${goalTotal}件` : undefined}
        />
        <Stat
          label={`${formatShortDate(date)} の返信`}
          value={dayTotals.reply.toLocaleString("ja-JP")}
          unit="件"
          sub={`返信率 ${replyRate(dayTotals).toFixed(1)}%`}
        />
        <Stat
          label="直近7日の送付"
          value={weekTotals.sent.toLocaleString("ja-JP")}
          unit="件"
        />
        <Stat
          label="直近7日の返信率"
          value={`${replyRate(weekTotals).toFixed(1)}%`}
          sub={`返信 ${weekTotals.reply}件`}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>{targetName}／{date} の入力</h2>
            <p>
              すでに入力済みの値は初期表示されます。まとめて保存できます。
            </p>
          </div>
          <div className="pill-row">
            <Link
              className="pill"
              href={`/daily?date=${addDays(date, -1)}&user=${targetUserId}`}
            >
              ← 前日
            </Link>
            <Link
              className="pill"
              href={`/daily?date=${today()}&user=${targetUserId}`}
            >
              今日
            </Link>
            {date < today() ? (
              <Link
                className="pill"
                href={`/daily?date=${addDays(date, 1)}&user=${targetUserId}`}
              >
                翌日 →
              </Link>
            ) : null}
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="empty">
            アカウントが登録されていません。
            <Link href="/accounts">アカウント管理</Link>から追加してください。
          </div>
        ) : (
          <form action={saveDailyReports} key={formKey}>
            <p className="entry-guide">
              <b>返信数は「有効な返信」だけを数えます。</b>
              お断りやスタンプのみなど、コミュニケーションに繋がらなかったものは含めません。
            </p>
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="target_user" value={targetUserId} />
            <input type="hidden" name="back_to" value="/daily" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>アカウント</th>
                    <th>状態</th>
                    <th className="num" style={{ width: 110 }}>
                      送付数
                    </th>
                    <th className="num" style={{ width: 110 }}>
                      返信数<span className="fine">有効な返信のみ</span>
                    </th>
                    <th className="num">返信率</th>
                    <th style={{ minWidth: 220 }}>メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const cur = existing.get(a.id);
                    const rate =
                      cur && cur.sent > 0 ? (cur.reply / cur.sent) * 100 : null;
                    return (
                      <tr key={a.id}>
                        <td>
                          <input type="hidden" name="account_id" value={a.id} />
                          @{a.handle}
                          {a.nickname ? (
                            <span className="muted"> / {a.nickname}</span>
                          ) : null}
                          {a.daily_goal > 0 ? (
                            <span className="muted"> （目標{a.daily_goal}）</span>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              a.status === "active"
                                ? "ok"
                                : a.status === "paused"
                                  ? "neutral"
                                  : "danger"
                            }`}
                          >
                            {ACCOUNT_STATUS_LABEL[a.status]}
                          </span>
                        </td>
                        <td>
                          <input
                            className="compact"
                            type="number"
                            min={0}
                            name={`sent_${a.id}`}
                            defaultValue={cur?.sent ?? 0}
                          />
                        </td>
                        <td>
                          <input
                            className="compact"
                            type="number"
                            min={0}
                            name={`reply_${a.id}`}
                            defaultValue={cur?.reply ?? 0}
                          />
                        </td>
                        <td className="num">
                          {rate === null ? (
                            <span className="muted">-</span>
                          ) : (
                            <RateBadge rate={rate} warn={warn} danger={danger} />
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            name={`memo_${a.id}`}
                            defaultValue={cur?.memo ?? ""}
                            placeholder="制限がかかった 等"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit">
                この日の実績を保存
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>直近7日の入力状況</h2>
            <p>未入力の日は「未入力」と表示されます。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th className="num">送付</th>
                <th className="num">返信</th>
                <th className="num">返信率</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {week
                .slice()
                .reverse()
                .map((d) => {
                  const row = seriesMap.get(d);
                  return (
                    <tr key={d}>
                      <td>{formatShortDate(d)}</td>
                      <td className="num">
                        {row ? row.sent.toLocaleString("ja-JP") : "-"}
                      </td>
                      <td className="num">
                        {row ? row.reply.toLocaleString("ja-JP") : "-"}
                      </td>
                      <td className="num">
                        {row && row.sent > 0 ? (
                          <RateBadge
                            rate={(row.reply / row.sent) * 100}
                            warn={warn}
                            danger={danger}
                          />
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        {row ? (
                          <Link
                            className="btn small"
                            href={`/daily?date=${d}&user=${targetUserId}`}
                          >
                            修正
                          </Link>
                        ) : (
                          <Link
                            className="btn small danger"
                            href={`/daily?date=${d}&user=${targetUserId}`}
                          >
                            未入力
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
