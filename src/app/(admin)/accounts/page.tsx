import { requireAdmin } from "@/lib/auth";
import { getSettings, settingNumber } from "@/lib/db";
import { addDays, formatMonth, monthRange, thisMonth, today } from "@/lib/date";
import { listAccounts, listUsers, replyRate, totalsByAccount } from "@/lib/queries";
import { ACCOUNT_STATUS_LABEL, type AccountStatus } from "@/lib/types";
import { Flash, RateBadge } from "@/components/ui";
import { deleteAccount, saveAccount } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUSES: AccountStatus[] = ["active", "paused", "banned"];

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; msg?: string; t?: string }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;

  const month = thisMonth();
  const { start, end } = monthRange(month);
  const [accounts, users, monthTotals, weekTotals, settings] = await Promise.all([
    listAccounts(),
    listUsers(),
    totalsByAccount(start, end),
    totalsByAccount(addDays(today(), -6), today()),
    getSettings(),
  ]);

  const operators = users.filter((u) => u.role === "operator");
  const editing = accounts.find((a) => a.id === Number(sp.edit));
  const warn = settingNumber(settings, "alert_reply_rate_warn");
  const danger = settingNumber(settings, "alert_reply_rate_danger");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>TikTokアカウント管理</h1>
          <p>
            DM送付に使っているアカウントの登録・状態管理。1人あたり複数アカウントを登録できます。
          </p>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{editing ? `@${editing.handle} を編集` : "アカウントを追加"}</h2>
              <p>アカウントIDは@なしで入力してください。</p>
            </div>
          </div>
          <form action={saveAccount}>
            {editing ? (
              <input type="hidden" name="id" value={editing.id} />
            ) : null}
            <label className="field">
              <span>運用者</span>
              <select
                name="user_id"
                defaultValue={String(editing?.user_id ?? operators[0]?.id ?? me.id)}
              >
                {operators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>アカウントID（必須）</span>
              <input
                name="handle"
                type="text"
                defaultValue={editing?.handle ?? ""}
                placeholder="creator_dm_01"
                required
              />
            </label>
            <label className="field">
              <span>表示名・メモ用の名前</span>
              <input
                name="nickname"
                type="text"
                defaultValue={editing?.nickname ?? ""}
                placeholder="美容ジャンル用"
              />
            </label>
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <label className="field grow">
                <span>状態</span>
                <select name="status" defaultValue={editing?.status ?? "active"}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ACCOUNT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field grow">
                <span>1日の送付目標</span>
                <input
                  name="daily_goal"
                  type="number"
                  min={0}
                  defaultValue={editing?.daily_goal ?? 0}
                />
              </label>
            </div>
            <label className="field">
              <span>メモ</span>
              <textarea name="memo" rows={2} defaultValue={editing?.memo ?? ""} />
            </label>
            <div className="toolbar">
              <button className="btn primary" type="submit">
                {editing ? "更新する" : "追加する"}
              </button>
              {editing ? (
                <a className="btn" href="/accounts">
                  キャンセル
                </a>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>状態サマリー</h2>
              <p>登録 {accounts.length} アカウント</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>状態</th>
                  <th className="num">件数</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((s) => (
                  <tr key={s}>
                    <td>{ACCOUNT_STATUS_LABEL[s]}</td>
                    <td className="num">
                      {accounts.filter((a) => a.status === s).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            アカウントを削除すると、そのアカウントの日報も一緒に削除されます。
            一時的に使わないだけなら「停止中」にしてください。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>アカウント一覧</h2>
            <p>
              実績は {formatMonth(month)} 累計 / 直近7日
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>アカウント</th>
                <th>運用者</th>
                <th>状態</th>
                <th className="num">目標/日</th>
                <th className="num">今月送付</th>
                <th className="num">今月返信率</th>
                <th className="num">直近7日送付</th>
                <th className="num">直近7日返信率</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const m = monthTotals.get(a.id) ?? { sent: 0, reply: 0 };
                const w = weekTotals.get(a.id) ?? { sent: 0, reply: 0 };
                return (
                  <tr key={a.id}>
                    <td>
                      @{a.handle}
                      {a.nickname ? (
                        <span className="muted"> / {a.nickname}</span>
                      ) : null}
                    </td>
                    <td className="muted">
                      {users.find((u) => u.id === a.user_id)?.name ?? "-"}
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
                    <td className="num">{a.daily_goal || "-"}</td>
                    <td className="num">{m.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {m.sent > 0 ? (
                        <RateBadge rate={replyRate(m)} warn={warn} danger={danger} />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td className="num">{w.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {w.sent > 0 ? (
                        <RateBadge rate={replyRate(w)} warn={warn} danger={danger} />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="toolbar">
                        <a className="btn small" href={`/accounts?edit=${a.id}`}>
                          編集
                        </a>
                        <form action={deleteAccount} className="inline-form">
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn small danger" type="submit">
                            削除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    まだアカウントが登録されていません。
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
