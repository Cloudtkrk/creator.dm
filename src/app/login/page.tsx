import { redirect } from "next/navigation";
import { currentUser, homePathFor } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const signedIn = await currentUser();
  if (signedIn) redirect(homePathFor(signedIn));

  // まだ誰も登録されていない＝デプロイ直後なので、初回セットアップへ直接送る
  const n =
    (await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0;
  if (n === 0) redirect("/setup");

  const { msg } = await searchParams;

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
