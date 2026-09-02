import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { resetAdminPassword } from "./actions";
import { resetToken, tokenMatches } from "./token";

export const dynamic = "force-dynamic";

type Row = { login_id: string; name: string; role: string; is_active: number };

/**
 * 管理者のログイン情報が分からなくなったときの復旧画面。
 *
 * 環境変数 ADMIN_RESET_TOKEN を設定したときだけ存在する（未設定なら404）。
 * 合言葉が合っていればログインIDの一覧が見られ、パスワードを入れ直せる。
 * 復旧が終わったら環境変数を削除して、この画面ごと閉じること。
 */
export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; msg?: string; t?: string }>;
}) {
  // 未設定のときは、この画面があること自体を伏せる
  if (!resetToken()) notFound();

  const sp = await searchParams;
  const authorized = tokenMatches(sp.token);
  const users = authorized
    ? await query<Row>(
        "SELECT login_id, name, role, is_active FROM users ORDER BY role, login_id",
      )
    : [];

  return (
    <div className="login-page">
      <div className="card login-card" style={{ maxWidth: 560 }}>
        <div className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-dot" />
          creator.dm
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          管理者ログインの復旧
        </p>

        {sp.msg ? (
          <div className={`form-msg ${sp.t === "ok" ? "" : "error"}`}>{sp.msg}</div>
        ) : null}

        {!authorized ? (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              Vercel の環境変数 <code>ADMIN_RESET_TOKEN</code> に設定した合言葉を
              入力してください。
            </p>
            <form>
              <label className="field">
                <span>合言葉</span>
                <input
                  name="token"
                  type="password"
                  autoComplete="off"
                  required
                  autoFocus
                />
              </label>
              <button
                className="btn primary"
                type="submit"
                style={{ width: "100%" }}
              >
                確認する
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">
                <div>
                  <h2>登録されているアカウント</h2>
                  <p>この中のログインIDでログインします。</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ログインID</th>
                      <th>氏名</th>
                      <th>権限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.login_id}>
                        <td>
                          <strong>{u.login_id}</strong>
                        </td>
                        <td>{u.name}</td>
                        <td>
                          <span
                            className={`badge ${u.role === "admin" ? "ok" : "neutral"}`}
                          >
                            {u.role === "admin" ? "管理者" : "運用者"}
                          </span>
                          {u.is_active ? null : (
                            <span className="badge neutral"> 無効</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty">
                          まだ誰も登録されていません。下のフォームで作成できます。
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="muted" style={{ fontSize: 13 }}>
              パスワードは暗号化して保存しているため、元の文字列は取り出せません。
              上のログインIDを選んで<strong>新しいパスワードを設定し直して</strong>ください。
              ここにないIDを入力した場合は、新しく管理者を作成します。
            </p>

            <form action={resetAdminPassword}>
              <input type="hidden" name="token" value={sp.token} />
              <label className="field">
                <span>ログインID</span>
                <input
                  name="login_id"
                  type="text"
                  list="known-login-ids"
                  autoComplete="username"
                  defaultValue={
                    users.find((u) => u.role === "admin")?.login_id ?? ""
                  }
                  required
                />
                <datalist id="known-login-ids">
                  {users.map((u) => (
                    <option key={u.login_id} value={u.login_id} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>氏名（新しく作る場合のみ）</span>
                <input name="name" type="text" placeholder="山田 太郎" />
              </label>
              <label className="field">
                <span>新しいパスワード（8文字以上）</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <button
                className="btn primary"
                type="submit"
                style={{ width: "100%" }}
              >
                このパスワードに設定してログインする
              </button>
            </form>

            <p className="muted" style={{ fontSize: 12 }}>
              復旧が終わったら、Vercel の環境変数 <code>ADMIN_RESET_TOKEN</code> を
              削除して再デプロイしてください。この画面は表示されなくなります。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
