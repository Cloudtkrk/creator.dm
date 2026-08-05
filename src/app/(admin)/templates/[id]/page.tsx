import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import {
  getTemplate,
  getUser,
  listTemplateRevisions,
} from "@/lib/queries";
import { TEMPLATE_KINDS, TEMPLATE_KIND_LABEL } from "@/lib/types";
import { Flash } from "@/components/ui";
import {
  deleteTemplate,
  restoreTemplateRevision,
  saveTemplate,
  toggleTemplateActive,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TemplateDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const template = await getTemplate(Number(id));
  if (!template) notFound();

  const owner = await getUser(template.user_id);
  // JSX内では await できないため、更新者名まで含めて先に読み込む
  const revisions = await Promise.all(
    (await listTemplateRevisions(template.id)).map(async (r) => ({
      ...r,
      changedByName: (await getUser(r.changed_by ?? 0))?.name ?? "不明",
    })),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{template.title}</h1>
          <p>
            {TEMPLATE_KIND_LABEL[template.kind]} / 担当：{owner?.name ?? "-"} / 現在 v
            {template.version} / 最終更新 {formatDateTime(template.updated_at)}
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn" href="/templates">
            一覧に戻る
          </Link>
          <form action={toggleTemplateActive} className="inline-form">
            <input type="hidden" name="id" value={template.id} />
            <button className="btn" type="submit">
              {template.is_active ? "使用停止にする" : "使用中に戻す"}
            </button>
          </form>
          <form action={deleteTemplate} className="inline-form">
            <input type="hidden" name="id" value={template.id} />
            <button className="btn danger" type="submit">
              削除
            </button>
          </form>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>本文を編集</h2>
            <p>保存すると v{template.version + 1} として履歴に記録されます。</p>
          </div>
        </div>
        <form action={saveTemplate}>
          <input type="hidden" name="id" value={template.id} />
          <label className="field">
            <span>種別</span>
            <select name="kind" defaultValue={template.kind}>
              {TEMPLATE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>タイトル</span>
            <input name="title" type="text" defaultValue={template.title} required />
          </label>
          <label className="field">
            <span>本文</span>
            <textarea name="body" rows={14} defaultValue={template.body} required />
          </label>
          <label className="field">
            <span>変更メモ</span>
            <input
              name="note"
              type="text"
              placeholder="冒頭の挨拶を変更 / 料率の記載を追加 など"
            />
          </label>
          <button className="btn primary" type="submit">
            保存して新しい版を作る
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>変更履歴</h2>
            <p>{revisions.length} 版。過去の文面に戻すこともできます。</p>
          </div>
        </div>
        {revisions.length === 0 ? (
          <div className="empty">履歴がありません。</div>
        ) : (
          revisions.map((r) => (
            <details className="rev" key={r.id} open={r.version === template.version}>
              <summary>
                v{r.version} ・ {formatDateTime(r.changed_at)} ・{" "}
                {r.changedByName}
                {r.note ? ` ・ ${r.note}` : ""}
              </summary>
              <div className="template-body">{r.body}</div>
              {r.version !== template.version ? (
                <form action={restoreTemplateRevision} style={{ marginTop: 8 }}>
                  <input type="hidden" name="template_id" value={template.id} />
                  <input type="hidden" name="revision_id" value={r.id} />
                  <button className="btn small" type="submit">
                    この版に戻す
                  </button>
                </form>
              ) : null}
            </details>
          ))
        )}
      </div>
    </>
  );
}
