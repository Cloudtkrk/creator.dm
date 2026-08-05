import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { addDays, formatShortDate, lastNDates, today } from "@/lib/date";
import {
  dailySeries,
  listAccounts,
  replyRate,
  reportsOnDate,
  totalsInRange,
} from "@/lib/queries";
import DailyEntryForm, { type EntryRow } from "@/components/DailyEntryForm";
import { Flash } from "@/components/ui";
import { saveDailyReports } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MyEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; msg?: string; t?: string }>;
}) {
  const me = await requireOperator();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today();

  const week = lastNDates(date, 7);
  // 順番に await すると1本ずつ往復して待ち時間が積み上がるため、まとめて投げる
  const [allAccounts, existing, seriesRows, weekTotals] = await Promise.all([
    listAccounts(me.id),
    reportsOnDate(date, me.id),
    dailySeries(week[0], date, me.id),
    totalsInRange(week[0], date, me.id),
  ]);

  // 停止中・BANのアカウントは入力対象から外す（誤入力を防ぐ）
  const accounts = allAccounts.filter((a) => a.status === "active");

  const rows: EntryRow[] = accounts.map((a) => {
    const cur = existing.get(a.id);
    return {
      id: a.id,
      handle: a.handle,
      nickname: a.nickname,
      dailyGoal: a.daily_goal,
      sent: cur?.sent ?? 0,
      reply: cur?.reply ?? 0,
      memo: cur?.memo ?? "",
    };
  });

  const formKey = `${date}|${rows
    .map((r) => `${r.id}:${r.sent}:${r.reply}`)
    .join(",")}`;

  const series = new Map(seriesRows.map((d) => [d.date, d] as const));
  const alreadySaved = existing.size > 0;

  return (
    <>
      <div className="op-head">
        <div className="op-date">
          {formatShortDate(date)} の入力
          <small>
            {date === today() ? "今日" : "過去の日を修正しています"} ／{" "}
            {alreadySaved ? "入力済み（上書きできます）" : "未入力"}
          </small>
        </div>
        <div className="pill-row">
          <Link className="pill" href={`/my?date=${addDays(date, -1)}`}>
            ← 前日
          </Link>
          {date !== today() ? (
            <Link className="pill" href="/my">
              今日
            </Link>
          ) : null}
          {date < today() ? (
            <Link className="pill" href={`/my?date=${addDays(date, 1)}`}>
              翌日 →
            </Link>
          ) : null}
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            稼働中のアカウントが登録されていません。管理者に登録を依頼してください。
          </div>
        </div>
      ) : (
        /*
         * key に「日付＋読み込んだ実績」を入れて、別の日に移動したときに
         * 入力欄を必ず作り直す。これが無いと前の日の数字が残ったままになり、
         * そのまま保存すると移動先の日の実績を上書きしてしまう。
         */
        <DailyEntryForm
          key={formKey}
          action={saveDailyReports}
          date={date}
          targetUserId={me.id}
          backTo="/my"
          rows={rows}
        />
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <div>
            <h2>直近7日の入力状況</h2>
            <p>
              合計 送付{weekTotals.sent.toLocaleString("ja-JP")}件 ／ 返信率{" "}
              {replyRate(weekTotals).toFixed(1)}%。未入力の日をタップすると修正できます。
            </p>
          </div>
        </div>
        <div className="streak">
          {week.map((d) => {
            const row = series.get(d);
            const cls = row ? "filled" : "missing";
            return (
              <Link
                key={d}
                href={`/my?date=${d}`}
                className={`${cls}${d === date ? " current" : ""}`}
              >
                <div className="d">{formatShortDate(d)}</div>
                <div className="v">{row ? row.sent : "—"}</div>
                <div className="s">{row ? `返信${row.reply}` : "未入力"}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
