import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMonth, monthRange, thisMonth } from "@/lib/date";
import {
  getEffectiveRate,
  listAccounts,
  listUsers,
  replyRate,
  totalsByUser,
} from "@/lib/queries";
import { Flash, yen } from "@/components/ui";
import { saveMember, toggleMemberActive } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const users = await listUsers({ includeInactive: true });
  const editing = users.find((u) => u.id === Number(sp.edit));
  const accounts = await listAccounts();

  const month = thisMonth();
  const { start, end } = monthRange(month);
  const byUser = await totalsByUser(start, end);
  // JSX内では await できないため、単価を先に引いておく
  const rates = new Map(
    await Promise.all(
      users.map(async (u) => [u.id, await getEffectiveRate(u.id, month)] as const),
    ),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>メンバー・単価管理</h1>
          <p>
            運用者の登録と、送付単価・ボーナスの設定を行います。単価は運用者ごとの詳細画面から月単位で設定できます。
          </p>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{editing ? `${editing.name} を編集` : "メンバーを追加"}</h2>
            <p>
              パスワードは8文字以上。編集時に空欄のままにすると変更されません。
            </p>
          </div>
        </div>
        <form action={saveMember}>
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <label className="field grow">
              <span>氏名（必須）</span>
              <input name="name" type="text" defaultValue={editing?.name ?? ""} required />
            </label>
            <label className="field grow">
              <span>ログインID（必須）</span>
              <input
                name="login_id"
                type="text"
                defaultValue={editing?.login_id ?? ""}
                required
              />
            </label>
            <label className="field grow">
              <span>権限</span>
              <select name="role" defaultValue={editing?.role ?? "operator"}>
                <option value="operator">運用者</option>
                <option value="admin">管理者</option>
              </select>
            </label>
            <label className="field grow">
              <span>パスワード{editing ? "（変更する場合のみ）" : "（必須）"}</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required={!editing}
              />
            </label>
          </div>
          <label className="field">
            <span>メモ</span>
            <input name="memo" type="text" defaultValue={editing?.memo ?? ""} />
          </label>
          <div className="toolbar">
            <button className="btn primary" type="submit">
              {editing ? "更新する" : "追加する"}
            </button>
            {editing ? (
              <a className="btn" href="/members">
                キャンセル
              </a>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>メンバー一覧</h2>
            <p>実績は {formatMonth(month)} 累計</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>氏名</th>
                <th>ログインID</th>
                <th>権限</th>
                <th className="num">アカウント</th>
                <th className="num">今月送付</th>
                <th className="num">返信率</th>
                <th className="num">DM単価</th>
                <th className="num">固定</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const t = byUser.get(u.id) ?? { sent: 0, reply: 0 };
                const rate = rates.get(u.id)!;
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/members/${u.id}`}>{u.name}</Link>
                    </td>
                    <td className="muted">{u.login_id}</td>
                    <td>
                      <span
                        className={`badge ${u.role === "admin" ? "warn" : "info"}`}
                      >
                        {u.role === "admin" ? "管理者" : "運用者"}
                      </span>
                    </td>
                    <td className="num">
                      {accounts.filter((a) => a.user_id === u.id).length}
                    </td>
                    <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {t.sent > 0 ? `${replyRate(t).toFixed(1)}%` : "-"}
                    </td>
                    <td className="num">{yen(rate.dm_unit_price)}</td>
                    <td className="num">{yen(rate.monthly_fixed)}</td>
                    <td>
                      <span className={`badge ${u.is_active ? "ok" : "neutral"}`}>
                        {u.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td>
                      <div className="toolbar">
                        <a className="btn small" href={`/members?edit=${u.id}`}>
                          編集
                        </a>
                        <Link className="btn small" href={`/members/${u.id}`}>
                          単価
                        </Link>
                        <form action={toggleMemberActive} className="inline-form">
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn small" type="submit">
                            {u.is_active ? "無効化" : "有効化"}
                          </button>
                        </form>
                      </div>
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
