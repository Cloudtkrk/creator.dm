import { redirect } from "next/navigation";
import { queryOne } from "@/lib/db";
import { createFirstAdmin } from "./actions";

export const dynamic = "force-dynamic";

/**
 * 初回セットアップ。デプロイ直後にコマンドを叩かなくても、この画面から
 * 最初の管理者を作成できる。ユーザーが1人でもいる場合は使えない。
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const { n } = (await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users",
  )) ?? { n: 0 };
  if (n > 0) redirect("/login");

  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-dot" />
          creator.dm
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          初回セットアップ：管理者アカウントを作成します
        </p>

        {msg ? <div className="form-msg error">{msg}</div> : null}

        <form action={createFirstAdmin}>
          <label className="field">
            <span>氏名</span>
            <input name="name" type="text" placeholder="山田 太郎" required />
          </label>
          <label className="field">
            <span>ログインID</span>
            <input
              name="login_id"
              type="text"
              autoComplete="username"
              placeholder="admin"
              required
            />
          </label>
          <label className="field">
            <span>パスワード（8文字以上）</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="btn primary" type="submit" style={{ width: "100%" }}>
            管理者を作成してはじめる
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12 }}>
          この画面は、まだ誰も登録されていないときだけ表示されます。
        </p>
      </div>
    </div>
  );
}
