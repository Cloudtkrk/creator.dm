import { requireAdmin } from "@/lib/auth";
import { formatMonth, monthRange, thisMonth, today } from "@/lib/date";
import {
  getLead,
  leadCounts,
  listAccounts,
  listLeads,
  listUsers,
  totalsInRange,
} from "@/lib/queries";
import { LEAD_STAGE_LABEL, type LeadStage } from "@/lib/types";
import { Flash, Funnel } from "@/components/ui";
import { deleteLead, saveLead, setLeadMilestone } from "@/app/actions";

export const dynamic = "force-dynamic";

const STAGE_BADGE: Record<LeadStage, string> = {
  replied: "info",
  line: "warn",
  meeting: "ok",
  closed: "ok",
  lost: "neutral",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "replied", label: "返信のみ" },
  { value: "line", label: "LINE登録済み" },
  { value: "meeting", label: "面談済み" },
  { value: "closed", label: "成約" },
  { value: "lost", label: "見送り" },
];

/** チェックボックスは未チェックだと送信されないため、hidden の 0 を併記する。 */
function Check({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="check">
      <input type="hidden" name={name} value="0" />
      <input type="checkbox" name={name} value="1" defaultChecked={checked} />
      {label}
    </label>
  );
}

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
  const me = await requireAdmin();
  const sp = await searchParams;

  const users = await listUsers();
  const operators = users.filter((u) => u.role === "operator");
  const filterUser = Number(sp.user) || undefined;

  const leads = await listLeads({
    userId: filterUser,
    stage: sp.stage || undefined,
    keyword: sp.q || undefined,
  });

  const accounts = await listAccounts();
  const editable = sp.edit ? await getLead(Number(sp.edit)) : null;

  const month = thisMonth();
  const { start, end } = monthRange(month);
  const counts = await leadCounts(start, end);
  const monthTotals = await totalsInRange(start, end);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>リード管理（LINE登録・面談）</h1>
          <p>
            送付者はクリエイターID・送付アカウント・返信日・LINE誘導日までを登録します。
            <strong>面談と成約の記録はこの画面で行います。</strong>
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
            <h2>
              {editable ? `@${editable.creator_handle} を編集` : "リードを登録"}
            </h2>
            <p>
              チェックを入れて日付が空の場合は今日の日付が入ります。
              チェックを外すとその記録は取り消されます。
            </p>
          </div>
        </div>
        <form action={saveLead}>
          {editable ? <input type="hidden" name="id" value={editable.id} /> : null}
          <div className="toolbar" style={{ marginBottom: 10 }}>
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
          </div>

          <div className="milestones">
            <div className="milestone">
              <Check
                name="has_line"
                label="LINE登録あり"
                checked={Boolean(editable?.line_at)}
              />
              <input
                type="date"
                name="line_at"
                max={today()}
                defaultValue={editable?.line_at ?? ""}
              />
            </div>
            <div className="milestone">
              <Check
                name="has_meeting"
                label="面談実施あり"
                checked={Boolean(editable?.meeting_at)}
              />
              <input
                type="date"
                name="meeting_at"
                max={today()}
                defaultValue={editable?.meeting_at ?? ""}
              />
            </div>
            <div className="milestone">
              <Check
                name="has_closed"
                label="成約"
                checked={Boolean(editable?.closed_at)}
              />
              <input
                type="date"
                name="closed_at"
                max={today()}
                defaultValue={editable?.closed_at ?? ""}
              />
            </div>
            <div className="milestone">
              <Check
                name="is_lost"
                label="見送り"
                checked={editable?.stage === "lost"}
              />
            </div>
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
            <p>
              {leads.length} 件（最大500件表示）。日付をクリックすると記録を取り消せます。
            </p>
          </div>
          <form className="toolbar">
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
                <th>運用者</th>
                <th>送付アカウント</th>
                <th>状態</th>
                <th>返信</th>
                <th>LINE登録</th>
                <th>面談</th>
                <th>成約</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    @{l.creator_handle}
                    {l.creator_name ? (
                      <span className="muted"> / {l.creator_name}</span>
                    ) : null}
                  </td>
                  <td className="muted">
                    {users.find((u) => u.id === l.user_id)?.name ?? "-"}
                  </td>
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
                  <td>
                    <MilestoneCell
                      leadId={l.id}
                      field="line"
                      date={l.line_at}
                      onLabel="LINE登録"
                    />
                  </td>
                  <td>
                    <MilestoneCell
                      leadId={l.id}
                      field="meeting"
                      date={l.meeting_at}
                      onLabel="面談済"
                    />
                  </td>
                  <td>
                    <MilestoneCell
                      leadId={l.id}
                      field="closed"
                      date={l.closed_at}
                      onLabel="成約"
                    />
                  </td>
                  <td>
                    <div className="toolbar">
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
              ))}
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
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

/** 到達済みなら日付、未到達ならワンクリックで記録できるボタンを出す。 */
function MilestoneCell({
  leadId,
  field,
  date,
  onLabel,
}: {
  leadId: number;
  field: "line" | "meeting" | "closed";
  date: string | null;
  onLabel: string;
}) {
  return (
    <form action={setLeadMilestone} className="inline-form">
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="on" value={date ? "0" : "1"} />
      {date ? (
        <button
          className="btn small done"
          type="submit"
          title="クリックすると記録を取り消します"
        >
          {date}
        </button>
      ) : (
        <button className="btn small" type="submit">
          {onLabel}にする
        </button>
      )}
    </form>
  );
}
