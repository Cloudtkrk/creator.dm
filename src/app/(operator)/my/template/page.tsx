import { requireOperator } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import { listTemplates, listUsers, revisionsByTemplateFor } from "@/lib/queries";
import { TEMPLATE_KINDS, type TemplateKind } from "@/lib/types";
import CopyButton from "@/components/CopyButton";
import { Flash } from "@/components/ui";
import { restoreTemplateRevision, saveTemplate } from "@/app/actions";

export const dynamic = "force-dynamic";

const PLACEHOLDERS = [
  ["{{creator}}", "クリエイター名"],
  ["{{brand}}", "ブランド・商品名"],
  ["{{rate}}", "料率"],
];

export default async function MyTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; t?: string }>;
}) {
  const me = await requireOperator();
  const sp = await searchParams;

  // JSX内では await できないため、履歴と更新者名までまとめて読み込んでおく。
  // 版ごとに名前を引くと版数分の往復になるので、名前は一覧から引き当てる
  const [tpls, users, revisions] = await Promise.all([
    listTemplates(me.id),
    listUsers({ includeInactive: true }),
    revisionsByTemplateFor(me.id),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const templates = tpls.map((tpl) => ({
    tpl,
    revisions: (revisions.get(tpl.id) ?? []).map((r) => ({
      ...r,
      changedByName: nameById.get(r.changed_by ?? 0) ?? "不明",
    })),
  }));

  const byKind = (kind: TemplateKind) =>
    templates.filter((t) => t.tpl.kind === kind);

  return (
    <>
      <div className="op-head">
        <div className="op-date">
          自分の文章
          <small>
            初回に送るDMと、返信をもらったあとに送る返信文を管理できます。
            編集して保存すると新しい版として記録され、いつでも前の文面に戻せます。
          </small>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      {TEMPLATE_KINDS.map((kind) => {
        const items = byKind(kind.value);
        return (
          <section key={kind.value} style={{ marginBottom: 24 }}>
            <div className="op-head" style={{ marginBottom: 8 }}>
              <div>
                <h2>{kind.label}</h2>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {kind.hint}
                </p>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="card">
                <div className="empty">
                  まだ登録がありません。下の「新しい文章を作る」から追加できます。
                </div>
              </div>
            ) : null}

            {items.map(({ tpl, revisions }) => (
              <div className="card" key={tpl.id}>
                <div className="card-head">
                  <div>
                    <h2>{tpl.title}</h2>
                    <p>
                      v{tpl.version} ／ 最終更新 {formatDateTime(tpl.updated_at)} ／{" "}
                      {tpl.is_active ? "使用中" : "使用停止中"}
                    </p>
                  </div>
                  <CopyButton text={tpl.body} />
                </div>

                <div className="template-body">{tpl.body}</div>

                <details className="rev" style={{ marginTop: 12 }}>
                  <summary>この文章を編集する</summary>
                  <form action={saveTemplate} style={{ marginTop: 8 }}>
                    <input type="hidden" name="back_to" value="/my/template" />
                    <input type="hidden" name="id" value={tpl.id} />
                    <input type="hidden" name="kind" value={tpl.kind} />
                    <label className="field">
                      <span>タイトル</span>
                      <input
                        name="title"
                        type="text"
                        defaultValue={tpl.title}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>本文</span>
                      <textarea
                        name="body"
                        rows={12}
                        defaultValue={tpl.body}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>変更メモ（何を変えたか）</span>
                      <input
                        name="note"
                        type="text"
                        placeholder="冒頭の挨拶を変更 / 料率の記載を追加 など"
                      />
                    </label>
                    <button className="btn primary" type="submit">
                      保存する
                    </button>
                  </form>
                </details>

                <details className="rev">
                  <summary>変更履歴（{revisions.length}版）</summary>
                  {revisions.map((r) => (
                    <div key={r.id} style={{ marginTop: 8 }}>
                      <div
                        className="muted"
                        style={{ fontSize: 12, fontWeight: 700 }}
                      >
                        v{r.version} ・ {formatDateTime(r.changed_at)} ・{" "}
                        {r.changedByName}
                        {r.note ? ` ・ ${r.note}` : ""}
                      </div>
                      <div className="template-body" style={{ maxHeight: 160 }}>
                        {r.body}
                      </div>
                      {r.version !== tpl.version ? (
                        <form
                          action={restoreTemplateRevision}
                          style={{ marginTop: 6 }}
                        >
                          <input type="hidden" name="back_to" value="/my/template" />
                          <input type="hidden" name="template_id" value={tpl.id} />
                          <input type="hidden" name="revision_id" value={r.id} />
                          <button className="btn small" type="submit">
                            この版に戻す
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </details>
              </div>
            ))}
          </section>
        );
      })}

      <div className="card">
        <div className="card-head">
          <div>
            <h2>新しい文章を作る</h2>
            <p>
              差し込み文字：
              {PLACEHOLDERS.map(([k, v]) => (
                <code key={k} style={{ marginRight: 8 }}>
                  {k}={v}
                </code>
              ))}
            </p>
          </div>
        </div>
        <form action={saveTemplate}>
          <input type="hidden" name="back_to" value="/my/template" />
          <label className="field">
            <span>種別（必須）</span>
            <select name="kind" defaultValue="dm">
              {TEMPLATE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>タイトル（必須）</span>
            <input
              name="title"
              type="text"
              placeholder="美容ジャンル向け 初回DM"
              required
            />
          </label>
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
            <span>変更メモ</span>
            <input name="note" type="text" placeholder="初版" />
          </label>
          <button className="btn primary" type="submit">
            作成する
          </button>
        </form>
      </div>
    </>
  );
}
