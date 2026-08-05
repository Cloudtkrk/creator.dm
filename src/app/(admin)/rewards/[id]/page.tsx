import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatMonth, monthRange, recentMonths, thisMonth } from "@/lib/date";
import {
  computeReward,
  dailySeries,
  getUser,
  listAccounts,
  replyRate,
  totalsByAccount,
} from "@/lib/queries";
import { REWARD_STATUS_LABEL } from "@/lib/types";
import { Flash, Stat, TrendChart, yen } from "@/components/ui";
import { addAdjustment, deleteAdjustment } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function RewardDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();

  const user = await getUser(Number(id));
  if (!user) notFound();

  const r = await computeReward(user.id, month);
  const { start, end } = monthRange(month);
  const series = await dailySeries(start, end, user.id);
  const accounts = await listAccounts(user.id);
  const byAccount = await totalsByAccount(start, end);
  const history = await Promise.all(
    recentMonths(thisMonth(), 6).map(async (m) => ({
      month: m,
      r: await computeReward(user.id, m),
    })),
  );

  const lines = [
    { label: `DM送付 ${r.sent.toLocaleString("ja-JP")}件 × ${yen(r.rate.dm_unit_price)}`, amount: r.dmAmount },
    { label: `返信 ${r.reply.toLocaleString("ja-JP")}件 × ${yen(r.rate.reply_unit_price)}`, amount: r.replyAmount },
    { label: `LINE登録 ${r.line}件 × ${yen(r.rate.line_bonus)}`, amount: r.lineAmount },
    { label: `面談実施 ${r.meeting}件 × ${yen(r.rate.meeting_bonus)}`, amount: r.meetingAmount },
    { label: "月額固定", amount: r.fixedAmount },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.name} の報酬明細</h1>
          <p>
            {formatMonth(month)} ／ 適用単価：{r.rate.effective_month} 以降の設定 ／
            状態：{REWARD_STATUS_LABEL[r.status]}
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn" href={`/rewards?month=${month}`}>
            一覧に戻る
          </Link>
          <Link className="btn" href={`/members/${user.id}`}>
            単価を編集
          </Link>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="pill-row" style={{ marginBottom: 16 }}>
        {recentMonths(thisMonth(), 6).map((m) => (
          <Link
            key={m}
            className={`pill ${m === month ? "active" : ""}`}
            href={`/rewards/${user.id}?month=${m}`}
          >
            {formatMonth(m)}
          </Link>
        ))}
      </div>

      <div className="grid cols-4">
        <Stat label="報酬合計" value={yen(r.total)} />
        <Stat label="送付数" value={r.sent.toLocaleString("ja-JP")} unit="件" />
        <Stat
          label="返信率"
          value={`${replyRate({ sent: r.sent, reply: r.reply }).toFixed(1)}%`}
          sub={`返信 ${r.reply.toLocaleString("ja-JP")}件`}
        />
        <Stat
          label="LINE登録 / 面談"
          value={`${r.line} / ${r.meeting}`}
          sub={
            r.reply > 0
              ? `返信からのLINE転換 ${((r.line / r.reply) * 100).toFixed(1)}%`
              : undefined
          }
        />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>内訳</h2>
              <p>0円の項目は単価が未設定です。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>項目</th>
                  <th className="num">金額</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td className="num">{yen(l.amount)}</td>
                  </tr>
                ))}
                {r.adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      調整：{a.reason || "（理由なし）"}
                      <form action={deleteAdjustment} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="user_id" value={user.id} />
                        <input type="hidden" name="month" value={month} />
                        <button
                          className="btn small danger"
                          type="submit"
                          style={{ marginLeft: 8 }}
                        >
                          削除
                        </button>
                      </form>
                    </td>
                    <td className="num">{yen(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>合計</td>
                  <td className="num">{yen(r.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <form action={addAdjustment} style={{ marginTop: 12 }}>
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="month" value={month} />
            <div className="toolbar">
              <label className="field grow">
                <span>調整額（マイナス可）</span>
                <input type="number" name="amount" placeholder="-5000" required />
              </label>
              <label className="field grow">
                <span>理由</span>
                <input type="text" name="reason" placeholder="特別賞与 / 控除 など" />
              </label>
              <button className="btn" type="submit">
                調整を追加
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>アカウント別の内訳</h2>
              <p>{formatMonth(month)}</p>
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
                  <th className="num">DM報酬</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const t = byAccount.get(a.id) ?? { sent: 0, reply: 0 };
                  return (
                    <tr key={a.id}>
                      <td>@{a.handle}</td>
                      <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                      <td className="num">{t.reply.toLocaleString("ja-JP")}</td>
                      <td className="num">
                        {t.sent > 0 ? `${replyRate(t).toFixed(1)}%` : "-"}
                      </td>
                      <td className="num">{yen(t.sent * r.rate.dm_unit_price)}</td>
                    </tr>
                  );
                })}
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      アカウントが登録されていません。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{formatMonth(month)}の日次推移</h2>
            <p>棒＝送付数 / 折れ線＝返信率</p>
          </div>
        </div>
        <TrendChart data={series} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>過去6ヶ月の推移</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th className="num">送付</th>
                <th className="num">返信</th>
                <th className="num">返信率</th>
                <th className="num">LINE</th>
                <th className="num">面談</th>
                <th className="num">報酬</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.month}>
                  <td>
                    <Link href={`/rewards/${user.id}?month=${h.month}`}>
                      {formatMonth(h.month)}
                    </Link>
                  </td>
                  <td className="num">{h.r.sent.toLocaleString("ja-JP")}</td>
                  <td className="num">{h.r.reply.toLocaleString("ja-JP")}</td>
                  <td className="num">
                    {h.r.sent > 0
                      ? `${replyRate({ sent: h.r.sent, reply: h.r.reply }).toFixed(1)}%`
                      : "-"}
                  </td>
                  <td className="num">{h.r.line}</td>
                  <td className="num">{h.r.meeting}</td>
                  <td className="num">{yen(h.r.total)}</td>
                  <td>
                    <span className="badge neutral">
                      {REWARD_STATUS_LABEL[h.r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
