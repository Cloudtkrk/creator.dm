import { requireOperator } from "@/lib/auth";
import { monthRange, thisMonth, today } from "@/lib/date";
import { getLead, leadCounts, listAccounts, listLeads } from "@/lib/queries";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABEL,
  type LeadStage,
} from "@/lib/types";
import { Flash, Stat } from "@/components/ui";
import { advanceLead, deleteLead, saveLead } from "@/app/actions";

export const dynamic = "force-dynamic";

const STAGE_BADGE: Record<LeadStage, string> = {
  replied: "info",
  line: "warn",
  meeting: "ok",
  closed: "ok",
  lost: "neutral",
};

const NEXT_STAGE: Partial<Record<LeadStage, LeadStage>> = {
  replied: "line",
  line: "meeting",
  meeting: "closed",
};

export default async function MyLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    q?: string;
    edit?: string;
    msg?: string;
    t?: string;
  }>;
}) {
  const me = await requireOperator();
  const sp = await searchParams;

  const leads = await listLeads({
    userId: me.id,
    stage: sp.stage || undefined,
    keyword: sp.q || undefined,
  });
  const accounts = await listAccounts(me.id);
  const editing = sp.edit ? await getLead(Number(sp.edit)) : null;
  const editable = editing && editing.user_id === me.id ? editing : null;

  const { start, end } = monthRange(thisMonth());
  const counts = await leadCounts(start, end, me.id);

  return (
    <>
      <div className="op-head">
        <div className="op-date">
          LINE・面談の記録
          <small>
            返信のあったクリエイターを登録して、進んだら次のステージに進めてください。
          </small>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-3">
        <Stat label="今月のLINE登録" value={counts.line} unit="件" />
        <Stat label="今月の面談実施" value={counts.meeting} unit="件" />
        <Stat label="今月の成約" value={counts.closed} unit="件" />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>
              {editable ? `@${editable.creator_handle} を編集` : "新しく登録する"}
            </h2>
            <p>日付が空のままステージを進めた場合は、今日の日付が自動で入ります。</p>
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
              <span>クリエイター名</span>
              <input
                name="creator_name"
                type="text"
                defaultValue={editable?.creator_name ?? ""}
              />
            </label>
            <label className="field grow">
              <span>送付元アカウント</span>
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
              <span>ステージ</span>
              <select name="stage" defaultValue={editable?.stage ?? "replied"}>
                {LEAD_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
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
              <span>LINE登録日</span>
              <input
                type="date"
                name="line_at"
                defaultValue={editable?.line_at ?? ""}
              />
            </label>
            <label className="field grow">
              <span>面談実施日</span>
              <input
                type="date"
                name="meeting_at"
                defaultValue={editable?.meeting_at ?? ""}
              />
            </label>
            <label className="field grow">
              <span>成約日</span>
              <input
                type="date"
                name="closed_at"
                defaultValue={editable?.closed_at ?? ""}
              />
            </label>
          </div>
          <label className="field">
            <span>メモ</span>
            <textarea name="memo" rows={2} defaultValue={editable?.memo ?? ""} />
          </label>
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
            <p>{leads.length} 件</p>
          </div>
          <form className="toolbar">
            <label className="field">
              <span>ステージ</span>
              <select name="stage" defaultValue={sp.stage ?? ""}>
                <option value="">すべて</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>検索</span>
              <input type="search" name="q" defaultValue={sp.q ?? ""} />
            </label>
            <button className="btn" type="submit">
              絞り込み
            </button>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>クリエイター</th>
                <th>ステージ</th>
                <th>返信</th>
                <th>LINE</th>
                <th>面談</th>
                <th className="wrap">メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const next = NEXT_STAGE[l.stage];
                return (
                  <tr key={l.id}>
                    <td>
                      @{l.creator_handle}
                      {l.creator_name ? (
                        <span className="muted"> / {l.creator_name}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${STAGE_BADGE[l.stage]}`}>
                        {LEAD_STAGE_LABEL[l.stage]}
                      </span>
                    </td>
                    <td className="muted">{l.replied_at ?? "-"}</td>
                    <td className="muted">{l.line_at ?? "-"}</td>
                    <td className="muted">{l.meeting_at ?? "-"}</td>
                    <td className="wrap muted">{l.memo}</td>
                    <td>
                      <div className="toolbar">
                        {next ? (
                          <form action={advanceLead} className="inline-form">
                            <input type="hidden" name="back_to" value="/my/leads" />
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="stage" value={next} />
                            <button className="btn small primary" type="submit">
                              {LEAD_STAGE_LABEL[next]}へ
                            </button>
                          </form>
                        ) : null}
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
                );
              })}
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
      </div>
    </>
  );
}
