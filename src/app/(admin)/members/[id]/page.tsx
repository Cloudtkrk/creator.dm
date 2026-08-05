import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatMonth, recentMonths, thisMonth } from "@/lib/date";
import {
  computeReward,
  getEffectiveRate,
  getUser,
  listAccounts,
  listRateCards,
  listTemplates,
  replyRate,
} from "@/lib/queries";
import { ACCOUNT_STATUS_LABEL } from "@/lib/types";
import { Flash, Stat, yen } from "@/components/ui";
import { deleteRateCard, saveRateCard } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MemberDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const user = await getUser(Number(id));
  if (!user) notFound();

  const month = thisMonth();
  // 順番に await すると1本ずつ往復して待ち時間が積み上がるため、まとめて投げる
  const [current, rateCards, accounts, templates, history] = await Promise.all([
    getEffectiveRate(user.id, month),
    listRateCards(user.id),
    listAccounts(user.id),
    listTemplates(user.id),
    Promise.all(
      recentMonths(month, 6).map(async (m) => ({
        month: m,
        r: await computeReward(user.id, m),
      })),
    ),
  ]);
  const thisMonthReward = history[0].r;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.name}</h1>
          <p>
            ログインID：{user.login_id} ／{" "}
            {user.role === "admin" ? "管理者" : "運用者"} ／{" "}
            {user.is_active ? "有効" : "無効"}
            {user.memo ? ` ／ ${user.memo}` : ""}
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn" href="/members">
            一覧に戻る
          </Link>
          <Link className="btn" href={`/rewards/${user.id}?month=${month}`}>
            報酬明細
          </Link>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-4">
        <Stat label="登録アカウント" value={accounts.length} unit="件" />
        <Stat
          label={`${formatMonth(month)}送付`}
          value={thisMonthReward.sent.toLocaleString("ja-JP")}
          unit="件"
        />
        <Stat
          label="返信率"
          value={
            thisMonthReward.sent > 0
              ? `${replyRate({ sent: thisMonthReward.sent, reply: thisMonthReward.reply }).toFixed(1)}%`
              : "-"
          }
        />
        <Stat label="今月の報酬見込" value={yen(thisMonthReward.total)} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>単価設定</h2>
            <p>
              適用開始月を指定して登録します。過去の月の報酬は、その時点で有効だった単価で計算されるため、
              単価を変更しても過去の金額は変わりません。
            </p>
          </div>
        </div>

        <form action={saveRateCard}>
          <input type="hidden" name="user_id" value={user.id} />
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <label className="field grow">
              <span>適用開始月</span>
              <input type="month" name="effective_month" defaultValue={month} required />
            </label>
            <label className="field grow">
              <span>DM送付1件（円）</span>
              <input
                type="number"
                name="dm_unit_price"
                defaultValue={current.dm_unit_price}
              />
            </label>
            <label className="field grow">
              <span>返信1件（円）</span>
              <input
                type="number"
                name="reply_unit_price"
                defaultValue={current.reply_unit_price}
              />
            </label>
          </div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <label className="field grow">
              <span>LINE登録1件（円）</span>
              <input type="number" name="line_bonus" defaultValue={current.line_bonus} />
            </label>
            <label className="field grow">
              <span>面談1件（円）</span>
              <input
                type="number"
                name="meeting_bonus"
                defaultValue={current.meeting_bonus}
              />
            </label>
            <label className="field grow">
              <span>月額固定（円）</span>
              <input
                type="number"
                name="monthly_fixed"
                defaultValue={current.monthly_fixed}
              />
            </label>
          </div>
          <button className="btn primary" type="submit">
            この単価を保存
          </button>
        </form>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>適用開始月</th>
                <th className="num">DM</th>
                <th className="num">返信</th>
                <th className="num">LINE</th>
                <th className="num">面談</th>
                <th className="num">月額固定</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rateCards.map((rc) => (
                <tr key={rc.id}>
                  <td>{formatMonth(rc.effective_month)}〜</td>
                  <td className="num">{yen(rc.dm_unit_price)}</td>
                  <td className="num">{yen(rc.reply_unit_price)}</td>
                  <td className="num">{yen(rc.line_bonus)}</td>
                  <td className="num">{yen(rc.meeting_bonus)}</td>
                  <td className="num">{yen(rc.monthly_fixed)}</td>
                  <td>
                    <form action={deleteRateCard} className="inline-form">
                      <input type="hidden" name="id" value={rc.id} />
                      <input type="hidden" name="user_id" value={user.id} />
                      <button className="btn small danger" type="submit">
                        削除
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {rateCards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    単価が未設定です。報酬はすべて0円で計算されます。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>担当アカウント</h2>
            </div>
            <Link className="btn small" href="/accounts">
              管理する
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>アカウント</th>
                  <th>状態</th>
                  <th className="num">目標/日</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>@{a.handle}</td>
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
                    <td className="num">{a.daily_goal || "-"}</td>
                  </tr>
                ))}
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      アカウント未登録
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>送付文章</h2>
            </div>
            <Link className="btn small" href={`/templates?user=${user.id}`}>
              管理する
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th className="num">版</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/templates/${t.id}`}>{t.title}</Link>
                    </td>
                    <td className="num">v{t.version}</td>
                    <td>
                      <span className={`badge ${t.is_active ? "ok" : "neutral"}`}>
                        {t.is_active ? "使用中" : "停止"}
                      </span>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      文章未登録
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
            <h2>過去6ヶ月の実績と報酬</h2>
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
                <th className="num">DM単価</th>
                <th className="num">報酬</th>
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
                  <td className="num">{yen(h.r.rate.dm_unit_price)}</td>
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
