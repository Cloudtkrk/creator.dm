import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMonth, recentMonths, thisMonth } from "@/lib/date";
import { computeRewards, listUsers } from "@/lib/queries";
import { REWARD_STATUS_LABEL, type RewardStatusValue } from "@/lib/types";
import { Flash, Stat, yen } from "@/components/ui";
import { setRewardStatus } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<RewardStatusValue, string> = {
  draft: "neutral",
  confirmed: "warn",
  paid: "ok",
};

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();

  const operators = (await listUsers({ includeInactive: true })).filter(
    (u) => u.role === "operator",
  );
  const rewards = await computeRewards(month);
  const rows = operators.map((u) => ({ user: u, r: rewards.get(u.id)! }));
  const visible = rows.filter((x) => x.user.is_active || x.r.total !== 0);

  const total = visible.reduce((s, x) => s + x.r.total, 0);
  const sent = visible.reduce((s, x) => s + x.r.sent, 0);
  const unpaid = visible
    .filter((x) => x.r.status !== "paid")
    .reduce((s, x) => s + x.r.total, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>月間報酬管理</h1>
          <p>
            {formatMonth(month)}の実績から自動計算しています。単価は運用者ごとに
            <Link href="/members">メンバー・単価</Link>で設定します。
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

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-4">
        <Stat label="報酬合計" value={yen(total)} sub={`${visible.length}名分`} />
        <Stat label="未払い残" value={yen(unpaid)} sub="支払済を除いた金額" />
        <Stat label="総送付数" value={sent.toLocaleString("ja-JP")} unit="件" />
        <Stat
          label="1件あたり平均"
          value={sent > 0 ? yen(Math.round(total / sent)) : "-"}
          sub="報酬合計 ÷ 送付数"
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>{formatMonth(month)}の報酬明細</h2>
            <p>金額は「送付 × 単価」に返信・LINE・面談のボーナスと調整を加えたものです。</p>
          </div>
          <div className="pill-row">
            {recentMonths(thisMonth(), 6).map((m) => (
              <Link
                key={m}
                className={`pill ${m === month ? "active" : ""}`}
                href={`/rewards?month=${m}`}
              >
                {formatMonth(m)}
              </Link>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>運用者</th>
                <th className="num">DM単価</th>
                <th className="num">送付</th>
                <th className="num">DM報酬</th>
                <th className="num">返信</th>
                <th className="num">LINE</th>
                <th className="num">面談</th>
                <th className="num">固定・ボーナス</th>
                <th className="num">調整</th>
                <th className="num">合計</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ user, r }) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/rewards/${user.id}?month=${month}`}>
                      {user.name}
                    </Link>
                    {user.is_active ? null : (
                      <span className="badge neutral" style={{ marginLeft: 6 }}>
                        無効
                      </span>
                    )}
                  </td>
                  <td className="num">{yen(r.rate.dm_unit_price)}</td>
                  <td className="num">{r.sent.toLocaleString("ja-JP")}</td>
                  <td className="num">{yen(r.dmAmount)}</td>
                  <td className="num">
                    {r.reply.toLocaleString("ja-JP")}
                    {r.replyAmount ? (
                      <span className="muted"> / {yen(r.replyAmount)}</span>
                    ) : null}
                  </td>
                  <td className="num">
                    {r.line}
                    {r.lineAmount ? (
                      <span className="muted"> / {yen(r.lineAmount)}</span>
                    ) : null}
                  </td>
                  <td className="num">
                    {r.meeting}
                    {r.meetingAmount ? (
                      <span className="muted"> / {yen(r.meetingAmount)}</span>
                    ) : null}
                  </td>
                  <td className="num">{yen(r.fixedAmount)}</td>
                  <td className="num">
                    {r.adjustmentTotal ? yen(r.adjustmentTotal) : "-"}
                  </td>
                  <td className="num">
                    <strong>{yen(r.total)}</strong>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>
                      {REWARD_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>
                    <form action={setRewardStatus} className="toolbar nowrap">
                      <input type="hidden" name="user_id" value={user.id} />
                      <input type="hidden" name="month" value={month} />
                      <select name="status" defaultValue={r.status}>
                        <option value="draft">未確定</option>
                        <option value="confirmed">確定</option>
                        <option value="paid">支払済</option>
                      </select>
                      <button className="btn small" type="submit">
                        変更
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={12} className="empty">
                    対象月の実績がありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td>合計</td>
                <td className="num"></td>
                <td className="num">{sent.toLocaleString("ja-JP")}</td>
                <td className="num">
                  {yen(visible.reduce((s, x) => s + x.r.dmAmount, 0))}
                </td>
                <td className="num">
                  {visible.reduce((s, x) => s + x.r.reply, 0).toLocaleString("ja-JP")}
                </td>
                <td className="num">{visible.reduce((s, x) => s + x.r.line, 0)}</td>
                <td className="num">
                  {visible.reduce((s, x) => s + x.r.meeting, 0)}
                </td>
                <td className="num">
                  {yen(visible.reduce((s, x) => s + x.r.fixedAmount, 0))}
                </td>
                <td className="num">
                  {yen(visible.reduce((s, x) => s + x.r.adjustmentTotal, 0))}
                </td>
                <td className="num">{yen(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
