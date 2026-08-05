import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings, settingNumber } from "@/lib/db";
import {
  addDays,
  formatMonth,
  monthRange,
  thisMonth,
  today,
} from "@/lib/date";
import {
  computeReward,
  dailySeries,
  leadCounts,
  leadCountsByUser,
  listAccounts,
  listUsers,
  replyRate,
  totalsByAccount,
  totalsByUser,
  totalsInRange,
} from "@/lib/queries";
import { computeAlerts } from "@/lib/alerts";
import { ACCOUNT_STATUS_LABEL } from "@/lib/types";
import { Funnel, RateBadge, Stat, TrendChart, yen } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const { start, end } = monthRange(month);

  const settings = getSettings();
  const warn = settingNumber(settings, "alert_reply_rate_warn");
  const danger = settingNumber(settings, "alert_reply_rate_danger");

  const day = today();
  const monthTotals = totalsInRange(start, end);
  const todayTotals = totalsInRange(day, day);
  const leads = leadCounts(start, end);
  const series = dailySeries(addDays(day, -29), day);
  const alerts = computeAlerts().filter((a) => a.level !== "info");

  const users = listUsers().filter((u) => u.role === "operator");
  const byUser = totalsByUser(start, end);
  const leadsByUser = leadCountsByUser(start, end);
  const accounts = listAccounts();
  const byAccount = totalsByAccount(start, end);

  const rewardTotal = users.reduce(
    (s, u) => s + computeReward(u.id, month).total,
    0,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>全体ダッシュボード</h1>
          <p>
            {formatMonth(month)}の実績（{start} 〜 {end}）
          </p>
        </div>
        <form className="toolbar">
          <label className="field">
            <span>対象月</span>
            <input type="month" name="month" defaultValue={month} />
          </label>
          <button className="btn" type="submit">
            表示
          </button>
        </form>
      </div>

      <div className="grid cols-4">
        <Stat
          label="今日の送付"
          value={todayTotals.sent.toLocaleString("ja-JP")}
          unit="件"
          sub={`返信 ${todayTotals.reply}件 / ${replyRate(todayTotals).toFixed(1)}%`}
        />
        <Stat
          label="今月の送付"
          value={monthTotals.sent.toLocaleString("ja-JP")}
          unit="件"
          sub={`返信 ${monthTotals.reply.toLocaleString("ja-JP")}件`}
        />
        <Stat
          label="今月の返信率"
          value={`${replyRate(monthTotals).toFixed(1)}%`}
          sub={`注意ライン ${warn}% / 危険ライン ${danger}%`}
        />
        <Stat
          label="今月の報酬合計（見込）"
          value={yen(rewardTotal)}
          sub={`運用者 ${users.length}名の合計`}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>直近30日の推移</h2>
            <p>棒＝送付数（灰＝土日） / 折れ線＝返信率</p>
          </div>
        </div>
        <TrendChart data={series} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{formatMonth(month)}のファネル</h2>
              <p>DM送付からLINE登録・面談までの転換</p>
            </div>
          </div>
          <Funnel
            steps={[
              { label: "DM送付", n: monthTotals.sent },
              {
                label: "返信",
                n: monthTotals.reply,
                sub: `${replyRate(monthTotals).toFixed(1)}%`,
              },
              {
                label: "LINE登録",
                n: leads.line,
                sub:
                  monthTotals.reply > 0
                    ? `返信の${((leads.line / monthTotals.reply) * 100).toFixed(1)}%`
                    : "-",
              },
              {
                label: "面談実施",
                n: leads.meeting,
                sub:
                  leads.line > 0
                    ? `LINEの${((leads.meeting / leads.line) * 100).toFixed(1)}%`
                    : "-",
              },
              {
                label: "成約",
                n: leads.closed,
                sub:
                  leads.meeting > 0
                    ? `面談の${((leads.closed / leads.meeting) * 100).toFixed(1)}%`
                    : "-",
              },
            ]}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>要対応アラート</h2>
              <p>直近{settingNumber(settings, "alert_window_days")}日の状況から自動判定</p>
            </div>
            <Link className="btn small" href="/alerts">
              すべて見る
            </Link>
          </div>
          {alerts.length === 0 ? (
            <div className="empty">対応が必要なアラートはありません。</div>
          ) : (
            alerts.slice(0, 5).map((a, i) => (
              <div className={`alert-row ${a.level}`} key={i}>
                <span className="alert-mark">
                  {a.level === "danger" ? "🔴" : "🟡"}
                </span>
                <div className="alert-body">
                  <span className="alert-who">{a.userName}</span>
                  <strong>{a.title}</strong>
                  <span>{a.detail}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2>運用者別サマリー</h2>
              <p>{formatMonth(month)}</p>
            </div>
            <Link className="btn small" href={`/rewards?month=${month}`}>
              報酬管理へ
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>運用者</th>
                  <th className="num">アカウント</th>
                  <th className="num">送付</th>
                  <th className="num">返信</th>
                  <th className="num">返信率</th>
                  <th className="num">LINE</th>
                  <th className="num">面談</th>
                  <th className="num">報酬見込</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const t = byUser.get(u.id) ?? { sent: 0, reply: 0 };
                  const lc = leadsByUser.get(u.id) ?? {
                    line: 0,
                    meeting: 0,
                    closed: 0,
                  };
                  const accCount = accounts.filter(
                    (a) => a.user_id === u.id,
                  ).length;
                  return (
                    <tr key={u.id}>
                      <td>
                        <Link href={`/members/${u.id}`}>{u.name}</Link>
                      </td>
                      <td className="num">{accCount}</td>
                      <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                      <td className="num">{t.reply.toLocaleString("ja-JP")}</td>
                      <td className="num">
                        {t.sent > 0 ? (
                          <RateBadge
                            rate={replyRate(t)}
                            warn={warn}
                            danger={danger}
                          />
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="num">{lc.line}</td>
                      <td className="num">{lc.meeting}</td>
                      <td className="num">
                        {yen(computeReward(u.id, month).total)}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      運用者が登録されていません。
                      <Link href="/members">メンバー管理</Link>から追加してください。
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td>合計</td>
                  <td className="num">{accounts.length}</td>
                  <td className="num">
                    {monthTotals.sent.toLocaleString("ja-JP")}
                  </td>
                  <td className="num">
                    {monthTotals.reply.toLocaleString("ja-JP")}
                  </td>
                  <td className="num">{replyRate(monthTotals).toFixed(1)}%</td>
                  <td className="num">{leads.line}</td>
                  <td className="num">{leads.meeting}</td>
                  <td className="num">{yen(rewardTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>アカウント別実績</h2>
            <p>{formatMonth(month)}</p>
          </div>
          <Link className="btn small" href="/daily">
            代理入力する
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>アカウント</th>
                <th>運用者</th>
                <th>状態</th>
                <th className="num">送付</th>
                <th className="num">返信</th>
                <th className="num">返信率</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const t = byAccount.get(a.id) ?? { sent: 0, reply: 0 };
                const owner = users.find((u) => u.id === a.user_id);
                return (
                  <tr key={a.id}>
                    <td>
                      @{a.handle}
                      {a.nickname ? (
                        <span className="muted"> / {a.nickname}</span>
                      ) : null}
                    </td>
                    <td className="muted">{owner?.name ?? "-"}</td>
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
                    <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">{t.reply.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {t.sent > 0 ? (
                        <RateBadge
                          rate={replyRate(t)}
                          warn={warn}
                          danger={danger}
                        />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    アカウントが登録されていません。
                    <Link href="/accounts">アカウント管理</Link>から追加してください。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
