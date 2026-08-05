import { requireUser } from "@/lib/auth";
import { formatMonth, monthRange, thisMonth, today } from "@/lib/date";
import {
  getLead,
  leadCounts,
  listAccounts,
  listLeads,
  listUsers,
  totalsInRange,
} from "@/lib/queries";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABEL,
  type LeadStage,
} from "@/lib/types";
import { Flash, Funnel } from "@/components/ui";
import { advanceLead, deleteLead, saveLead } from "../actions";

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

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    user?: string;
    stage?: string;
    q?: string;
    edit?: string;
    msg?: string;
    t?: string;
  }>;
}) {
  const me = await requireUser();
  const isAdmin = me.role === "admin";
  const sp = await searchParams;

  const users = listUsers();
  const operators = users.filter((u) => u.role === "operator");
  const filterUser = isAdmin ? Number(sp.user) || undefined : me.id;

  const leads = listLeads({
    userId: filterUser,
    stage: sp.stage || undefined,
    keyword: sp.q || undefined,
  });

  const accounts = listAccounts(isAdmin ? undefined : me.id);
  const editing = sp.edit ? getLead(Number(sp.edit)) : null;
  const editable =
    editing && (isAdmin || editing.user_id === me.id) ? editing : null;

  const month = thisMonth();
  const { start, end } = monthRange(month);
  const counts = leadCounts(start, end, isAdmin ? undefined : me.id);
  const monthTotals = totalsInRange(start, end, isAdmin ? undefined : me.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>リード管理（LINE登録・面談）</h1>
          <p>
            DMから返信のあったクリエイターを登録し、LINE登録・面談・成約まで追跡します。
            ここで記録した日付が報酬計算のボーナス集計にも使われます。
          </p>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{formatMonth(month)}の転換状況</h2>
            <p>各ステージに到達した日付ベースで集計</p>
          </div>
        </div>
        <Funnel
          steps={[
            { label: "DM送付", n: monthTotals.sent },
            { label: "返信", n: monthTotals.reply },
            { label: "LINE登録", n: counts.line },
            { label: "面談実施", n: counts.meeting },
            { label: "成約", n: counts.closed },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{editable ? `@${editable.creator_handle} を編集` : "リードを登録"}</h2>
            <p>
              ステージを進めた時に日付が未入力なら、自動で今日の日付が入ります。
            </p>
          </div>
        </div>
        <form action={saveLead}>
          {editable ? <input type="hidden" name="id" value={editable.id} /> : null}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            {isAdmin ? (
              <label className="field grow">
                <span>運用者</span>
                <select
                  name="user_id"
                  defaultValue={String(editable?.user_id ?? operators[0]?.id ?? me.id)}
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
              <a className="btn" href="/leads">
                キャンセル
              </a>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>リード一覧</h2>
            <p>{leads.length} 件（最大500件表示）</p>
          </div>
          <form className="toolbar">
            {isAdmin ? (
              <label className="field">
                <span>運用者</span>
                <select name="user" defaultValue={String(filterUser ?? "")}>
                  <option value="">全員</option>
                  {operators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
                {isAdmin ? <th>運用者</th> : null}
                <th>送付元</th>
                <th>ステージ</th>
                <th>返信</th>
                <th>LINE</th>
                <th>面談</th>
                <th>成約</th>
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
                    {isAdmin ? (
                      <td className="muted">
                        {users.find((u) => u.id === l.user_id)?.name ?? "-"}
                      </td>
                    ) : null}
                    <td className="muted">
                      {accounts.find((a) => a.id === l.account_id)
                        ? `@${accounts.find((a) => a.id === l.account_id)!.handle}`
                        : "-"}
                    </td>
                    <td>
                      <span className={`badge ${STAGE_BADGE[l.stage]}`}>
                        {LEAD_STAGE_LABEL[l.stage]}
                      </span>
                    </td>
                    <td className="muted">{l.replied_at ?? "-"}</td>
                    <td className="muted">{l.line_at ?? "-"}</td>
                    <td className="muted">{l.meeting_at ?? "-"}</td>
                    <td className="muted">{l.closed_at ?? "-"}</td>
                    <td className="wrap muted">{l.memo}</td>
                    <td>
                      <div className="toolbar">
                        {next ? (
                          <form action={advanceLead} className="inline-form">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="stage" value={next} />
                            <button className="btn small primary" type="submit">
                              {LEAD_STAGE_LABEL[next]}へ
                            </button>
                          </form>
                        ) : null}
                        <a className="btn small" href={`/leads?edit=${l.id}`}>
                          編集
                        </a>
                        <form action={deleteLead} className="inline-form">
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
                  <td colSpan={isAdmin ? 10 : 9} className="empty">
                    該当するリードがありません。
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
