import { requireOperator } from "@/lib/auth";
import { monthRange, thisMonth, today } from "@/lib/date";
import {
  getLead,
  leadCounts,
  listAccounts,
  listLeadsPage,
} from "@/lib/queries";
import { Flash, Stat } from "@/components/ui";
import { deleteLead, saveLead, setLeadMilestone } from "@/app/actions";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "すべて" },
  { value: "replied", label: "返信のみ" },
  { value: "guided", label: "LINE誘導済み" },
  { value: "line", label: "LINE登録済み" },
  { value: "meeting", label: "面談済み" },
];

export default async function MyLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    q?: string;
    edit?: string;
    page?: string;
    msg?: string;
    t?: string;
  }>;
}) {
  const me = await requireOperator();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const { start, end } = monthRange(thisMonth());

  // 順番に await すると1本ずつ往復して待ち時間が積み上がるため、まとめて投げる
  const [leadPage, accounts, editing, counts] = await Promise.all([
    listLeadsPage(
      {
        userId: me.id,
        stage: sp.stage || undefined,
        keyword: sp.q || undefined,
      },
      page,
    ),
    listAccounts(me.id),
    sp.edit ? getLead(Number(sp.edit)) : Promise.resolve(null),
    leadCounts(start, end, me.id),
  ]);
  const { leads, total, pages } = leadPage;
  const editable = editing && editing.user_id === me.id ? editing : null;
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (sp.stage) q.set("stage", sp.stage);
    if (sp.q) q.set("q", sp.q);
    q.set("page", String(n));
    return `/my/leads?${q}`;
  };

  return (
    <>
      <div className="op-head">
        <div className="op-date">
          返信者管理
          <small>
            返信のあったクリエイターを登録し、LINEに誘導できたら日付を入れてください。
            LINE登録の確認と面談の記録は管理者が行います。
          </small>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-3">
        <Stat label="今月のLINE誘導" value={counts.guided} unit="件" />
        <Stat
          label="うちLINE登録"
          value={counts.line}
          unit="件"
          sub="管理者が確認したもの"
        />
        <Stat
          label="今月の面談"
          value={counts.meeting}
          unit="件"
          sub="管理者が記録します"
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>
              {editable ? `@${editable.creator_handle} を編集` : "新しく登録する"}
            </h2>
            <p>入力するのはこの4項目だけです。</p>
          </div>
        </div>
        <form action={saveLead}>
          <input type="hidden" name="back_to" value="/my/leads" />
          {editable ? <input type="hidden" name="id" value={editable.id} /> : null}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <label className="field grow">
              <span>クリエイターID（必須）</span>
              <input
                name="creator_handle"
                type="text"
                defaultValue={editable?.creator_handle ?? ""}
                placeholder="creator_abc"
                required
              />
            </label>
            <label className="field grow">
              <span>送付アカウント</span>
              <select
                name="account_id"
                defaultValue={String(editable?.account_id ?? "")}
              >
                <option value="">未指定</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.handle}
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>返信日</span>
              <input
                type="date"
                name="replied_at"
                max={today()}
                defaultValue={editable?.replied_at ?? today()}
              />
            </label>
            <label className="field grow">
              <span>LINE誘導日（まだなら空欄）</span>
              <input
                type="date"
                name="line_guided_at"
                max={today()}
                defaultValue={editable?.line_guided_at ?? ""}
              />
            </label>
          </div>
          <div className="toolbar">
            <button className="btn primary" type="submit">
              {editable ? "更新する" : "登録する"}
            </button>
            {editable ? (
              <a className="btn" href="/my/leads">
                キャンセル
              </a>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>自分のリード</h2>
            <p>全{total.toLocaleString("ja-JP")}件</p>
          </div>
          <form className="toolbar">
            <label className="field">
              <span>絞り込み</span>
              <select name="stage" defaultValue={sp.stage ?? ""}>
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>検索</span>
              <input type="search" name="q" defaultValue={sp.q ?? ""} />
            </label>
            <button className="btn" type="submit">
              表示
            </button>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>クリエイター</th>
                <th>送付アカウント</th>
                <th>返信日</th>
                <th>LINE誘導日</th>
                <th>LINE登録</th>
                <th>面談</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>@{l.creator_handle}</td>
                  <td className="muted">
                    {l.account_id && accountById.has(l.account_id)
                      ? `@${accountById.get(l.account_id)!.handle}`
                      : "-"}
                  </td>
                  <td className="muted">{l.replied_at ?? "-"}</td>
                  <td>
                    {l.line_guided_at ? (
                      <span className="badge ok">{l.line_guided_at}</span>
                    ) : (
                      <span className="muted">未</span>
                    )}
                  </td>
                  <td>
                    {l.line_at ? (
                      <span className="badge ok">{l.line_at}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    {l.meeting_at ? (
                      <span className="badge ok">{l.meeting_at}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="toolbar">
                      {l.line_guided_at ? null : (
                        <form action={setLeadMilestone} className="inline-form">
                          <input type="hidden" name="back_to" value="/my/leads" />
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="field" value="guided" />
                          <input type="hidden" name="on" value="1" />
                          <button className="btn small primary" type="submit">
                            LINE誘導済みにする
                          </button>
                        </form>
                      )}
                      <a className="btn small" href={`/my/leads?edit=${l.id}`}>
                        編集
                      </a>
                      <form action={deleteLead} className="inline-form">
                        <input type="hidden" name="back_to" value="/my/leads" />
                        <input type="hidden" name="id" value={l.id} />
                        <button className="btn small danger" type="submit">
                          削除
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    まだ登録がありません。返信があったクリエイターを登録してください。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={total} href={pageHref} />
      </div>
    </>
  );
}

/** 件数が多いと1画面に収まらないため、ページ送りを出す。 */
function Pager({
  page,
  pages,
  total,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  href: (p: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      {page > 1 ? (
        <a className="btn small" href={href(page - 1)}>
          ← 前の100件
        </a>
      ) : (
        <span />
      )}
      <span className="muted">
        {total.toLocaleString("ja-JP")}件中 {(page - 1) * 100 + 1}〜
        {Math.min(page * 100, total)}件（{page} / {pages}ページ）
      </span>
      {page < pages ? (
        <a className="btn small" href={href(page + 1)}>
          次の100件 →
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

