import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import { listTemplates, listUsers } from "@/lib/queries";
import { Flash } from "@/components/ui";
import { saveTemplate, toggleTemplateActive } from "../actions";

export const dynamic = "force-dynamic";

const PLACEHOLDER_HELP = [
  ["{{creator}}", "クリエイター名"],
  ["{{brand}}", "ブランド・商品名"],
  ["{{rate}}", "料率"],
];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; msg?: string; t?: string }>;
}) {
  const me = await requireUser();
  const isAdmin = me.role === "admin";
  const sp = await searchParams;

  const users = listUsers();
  const operators = users.filter((u) => u.role === "operator");
  const filterUser = isAdmin ? Number(sp.user) || 0 : me.id;
  const templates = listTemplates(filterUser || undefined).filter((t) =>
    isAdmin ? true : t.user_id === me.id,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>送付文章の管理</h1>
          <p>
            運用者ごとにDMの文面を管理します。編集するたびにバージョンが増え、いつでも過去の文面に戻せます。
          </p>
        </div>
        {isAdmin ? (
          <form className="toolbar">
            <label className="field">
              <span>運用者で絞り込み</span>
              <select name="user" defaultValue={String(filterUser)}>
                <option value="0">全員</option>
                {operators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">
              表示
            </button>
          </form>
        ) : null}
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>新しい文章を作成</h2>
            <p>
              差し込み文字：
              {PLACEHOLDER_HELP.map(([k, v]) => (
                <code key={k} style={{ marginRight: 8 }}>
                  {k}={v}
                </code>
              ))}
            </p>
          </div>
        </div>
        <form action={saveTemplate}>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            {isAdmin ? (
              <label className="field grow">
                <span>運用者</span>
                <select
                  name="user_id"
                  defaultValue={String(filterUser || operators[0]?.id || me.id)}
                >
                  {operators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field grow">
              <span>タイトル（必須）</span>
              <input
                name="title"
                type="text"
                placeholder="美容ジャンル向け 初回DM"
                required
              />
            </label>
          </div>
          <label className="field">
            <span>本文（必須）</span>
            <textarea
              name="body"
              rows={8}
              placeholder={"{{creator}}さん\nはじめまして。..."}
              required
            />
          </label>
          <label className="field">
            <span>変更メモ（履歴に残ります）</span>
            <input name="note" type="text" placeholder="初版" />
          </label>
          <button className="btn primary" type="submit">
            作成する
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>文章一覧</h2>
            <p>{templates.length} 件</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>タイトル</th>
                {isAdmin ? <th>運用者</th> : null}
                <th className="num">版</th>
                <th>状態</th>
                <th>最終更新</th>
                <th className="wrap">冒頭</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/templates/${t.id}`}>{t.title}</Link>
                  </td>
                  {isAdmin ? (
                    <td className="muted">
                      {users.find((u) => u.id === t.user_id)?.name ?? "-"}
                    </td>
                  ) : null}
                  <td className="num">v{t.version}</td>
                  <td>
                    <span className={`badge ${t.is_active ? "ok" : "neutral"}`}>
                      {t.is_active ? "使用中" : "停止"}
                    </span>
                  </td>
                  <td className="muted">{formatDateTime(t.updated_at)}</td>
                  <td className="wrap muted">
                    {t.body.slice(0, 40).replace(/\n/g, " ")}
                    {t.body.length > 40 ? "…" : ""}
                  </td>
                  <td>
                    <div className="toolbar">
                      <Link className="btn small" href={`/templates/${t.id}`}>
                        編集
                      </Link>
                      <form action={toggleTemplateActive} className="inline-form">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="btn small" type="submit">
                          {t.is_active ? "停止" : "再開"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="empty">
                    まだ文章が登録されていません。
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
