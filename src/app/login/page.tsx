import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { msg } = await searchParams;

  const { n } = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };

  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-dot" />
          creator.dm
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          TikTok Shop クリエイターDM運用管理
        </p>

        {msg ? <div className="form-msg error">{msg}</div> : null}

        {n === 0 ? (
          <div className="form-msg error">
            ユーザーが1件も登録されていません。
            <code>npm run seed</code> を実行して初期管理者を作成してください。
          </div>
        ) : null}

        <form action={login}>
          <label className="field">
            <span>ログインID</span>
            <input name="login_id" type="text" autoComplete="username" required />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn primary" type="submit" style={{ width: "100%" }}>
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
