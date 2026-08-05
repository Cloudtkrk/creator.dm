import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { getSettings, settingNumber } from "@/lib/db";
import {
  addDays,
  formatMonth,
  monthRange,
  recentMonths,
  thisMonth,
  today,
} from "@/lib/date";
import {
  computeReward,
  dailySeries,
  leadCounts,
  listAccounts,
  replyRate,
  totalsByAccount,
  totalsInRange,
} from "@/lib/queries";
import { Funnel, RateBadge, Stat, TrendChart, yen } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requireOperator();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const { start, end } = monthRange(month);

  const settings = await getSettings();
  const warn = settingNumber(settings, "alert_reply_rate_warn");
  const danger = settingNumber(settings, "alert_reply_rate_danger");

  const totals = await totalsInRange(start, end, me.id);
  const leads = await leadCounts(start, end, me.id);
  const reward = await computeReward(me.id, month);
  const series = await dailySeries(addDays(today(), -29), today(), me.id);
  const accounts = await listAccounts(me.id);
  const byAccount = await totalsByAccount(start, end);
  const history = await Promise.all(
    recentMonths(thisMonth(), 6).map(async (m) => ({
      month: m,
      r: await computeReward(me.id, m),
    })),
  );

  return (
    <>
      <div className="op-head">
        <div className="op-date">
          自分の実績
          <small>{formatMonth(month)}（{start} 〜 {end}）</small>
        </div>
        <div className="pill-row">
          {recentMonths(thisMonth(), 4).map((m) => (
            <Link
              key={m}
              className={`pill ${m === month ? "active" : ""}`}
              href={`/my/history?month=${m}`}
            >
              {formatMonth(m)}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid cols-4">
        <Stat
          label="送付数"
          value={totals.sent.toLocaleString("ja-JP")}
          unit="件"
        />
        <Stat
          label="返信数"
          value={totals.reply.toLocaleString("ja-JP")}
          unit="件"
        />
        <Stat
          label="返信率"
          value={`${replyRate(totals).toFixed(1)}%`}
          sub={`注意ライン ${warn}%`}
        />
        <Stat
          label="報酬（見込）"
          value={yen(reward.total)}
          sub="確定前の概算です"
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

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{formatMonth(month)}のファネル</h2>
            <p>LINE登録・面談は「LINE・面談」タブの登録内容から集計しています。</p>
          </div>
        </div>
        <Funnel
          steps={[
            { label: "DM送付", n: totals.sent },
            {
              label: "返信",
              n: totals.reply,
              sub: `${replyRate(totals).toFixed(1)}%`,
            },
            {
              label: "LINE誘導",
              n: leads.guided,
              sub:
                totals.reply > 0
                  ? `返信の${((leads.guided / totals.reply) * 100).toFixed(1)}%`
                  : "-",
            },
            { label: "LINE登録", n: leads.line },
            { label: "面談実施", n: leads.meeting },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>アカウント別</h2>
            <p>
              特定のアカウントだけ返信率が低い場合は、管理者に相談してください。
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>アカウント</th>
                <th className="num">送付</th>
                <th className="num">返信</th>
                <th className="num">返信率</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const t = byAccount.get(a.id) ?? { sent: 0, reply: 0 };
                return (
                  <tr key={a.id}>
                    <td>
                      @{a.handle}
                      {a.nickname ? (
                        <span className="muted"> / {a.nickname}</span>
                      ) : null}
                    </td>
                    <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">{t.reply.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {t.sent > 0 ? (
                        <RateBadge rate={replyRate(t)} warn={warn} danger={danger} />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>月別の実績と報酬</h2>
            <p>報酬は実績と単価から自動計算した概算です。確定額は管理者が確認します。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th className="num">送付</th>
                <th className="num">返信率</th>
                <th className="num">誘導</th>
                <th className="num">LINE</th>
                <th className="num">面談</th>
                <th className="num">報酬</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.month}>
                  <td>
                    <Link href={`/my/history?month=${h.month}`}>
                      {formatMonth(h.month)}
                    </Link>
                  </td>
                  <td className="num">{h.r.sent.toLocaleString("ja-JP")}</td>
                  <td className="num">
                    {h.r.sent > 0
                      ? `${replyRate({ sent: h.r.sent, reply: h.r.reply }).toFixed(1)}%`
                      : "-"}
                  </td>
                  <td className="num">{h.r.guided}</td>
                  <td className="num">{h.r.line}</td>
                  <td className="num">{h.r.meeting}</td>
                  <td className="num">{yen(h.r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
