import { requireAdmin } from "@/lib/auth";
import { formatMonth, monthRange, thisMonth, today } from "@/lib/date";
import {
  countLeadsOnDate,
  getLead,
  leadCounts,
  listAccounts,
  listLeadsPage,
  listUsers,
  totalsInRange,
} from "@/lib/queries";
import { LEAD_STAGE_LABEL, type LeadStage } from "@/lib/types";
import { Flash, Funnel } from "@/components/ui";
import {
  bulkSetLeadMilestone,
  deleteLead,
  saveLead,
  setLeadMilestone,
  shiftLeadDates,
} from "@/app/actions";

export const dynamic = "force-dynamic";

const STAGE_BADGE: Record<LeadStage, string> = {
  replied: "info",
  guided: "warn",
  line: "warn",
  meeting: "ok",
  closed: "ok",
  lost: "neutral",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "replied", label: "返信のみ" },
  { value: "guided", label: "LINE誘導済み（未確認）" },
  { value: "line", label: "LINE登録済み" },
  { value: "meeting", label: "面談済み" },
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
    page?: string;
    as_of?: string;
    fix?: string;
    msg?: string;
    t?: string;
  }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;

  // ワンクリックの記録に使う日付。過去の分をまとめて入力するときに変えられる。
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(sp.as_of ?? "") ? sp.as_of! : today();

  const filterUser = Number(sp.user) || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const month = thisMonth();
  const { start, end } = monthRange(month);

  // 付け替え画面の初期値。今日の分を直したい場面がほとんどなので既定は今日。
  const fixFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.fix ?? "") ? sp.fix! : today();

  // 順番に await すると1本ずつ往復して待ち時間が積み上がるため、まとめて投げる
  const [users, leadPage, accounts, editable, counts, monthTotals, onFixDate] =
    await Promise.all([
      listUsers(),
      listLeadsPage(
        {
          userId: filterUser,
          stage: sp.stage || undefined,
          keyword: sp.q || undefined,
        },
        page,
      ),
      listAccounts(),
      sp.edit ? getLead(Number(sp.edit)) : Promise.resolve(null),
      leadCounts(start, end),
      totalsInRange(start, end),
      countLeadsOnDate(fixFrom),
    ]);
  const { leads, total, pages } = leadPage;
  const operators = users.filter((u) => u.role === "operator");

  // 行ごとに find すると件数×アカウント数の走査になるため、先に索引を作る
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (sp.user) q.set("user", sp.user);
    if (sp.stage) q.set("stage", sp.stage);
    if (sp.q) q.set("q", sp.q);
    if (sp.as_of) q.set("as_of", sp.as_of);
    if (sp.fix) q.set("fix", sp.fix);
    q.set("page", String(n));
    return `/leads?${q}`;
  };
  // ワンクリック記録のあと、同じ絞り込み・同じページに戻ってくるようにする
  const listHref = pageHref(page);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>リード管理（LINE登録・面談）</h1>
          <p>
            送付者が登録するのは<strong>LINE誘導日まで</strong>です（申告）。
            <strong>実際にLINE登録されたかの確認と面談の記録は、この画面で行います。</strong>
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
            { label: "LINE誘導", n: counts.guided },
            { label: "LINE登録", n: counts.line },
            { label: "面談実施", n: counts.meeting },
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
            <label className="field grow">
              <span>LINE誘導日（送付者の申告）</span>
              <input
                type="date"
                name="line_guided_at"
                max={today()}
                defaultValue={editable?.line_guided_at ?? ""}
              />
            </label>
          </div>

          <div className="milestones">
            <div className="milestone">
              <Check
                name="has_line"
                label="LINE登録を確認"
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
            <h2>一括で記録する</h2>
            <p>
              クリエイターIDを貼り付けて、LINE登録や面談をまとめて記録します。
              スプレッドシートで突き合わせた結果を取り込むときに使ってください。
              <strong>既に日付が入っているものは飛ばす</strong>ので、
              二重に実行しても重複しません。
            </p>
          </div>
        </div>
        <form action={bulkSetLeadMilestone}>
          <input type="hidden" name="back_to" value={listHref} />
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <label className="field">
              <span>記録する項目</span>
              <select name="field" defaultValue="line">
                <option value="line">LINE登録</option>
                <option value="meeting">面談実施</option>
                <option value="guided">LINE誘導</option>
              </select>
            </label>
            <label className="field">
              <span>記録する日付</span>
              <input type="date" name="date" defaultValue={asOf} required />
            </label>
          </div>
          <label className="field">
            <span>クリエイターID（1行に1件）</span>
            <textarea
              name="handles"
              rows={6}
              placeholder={"black.stones.726\nwaka_rakuraku\nac_uyu\t2026-10-05"}
            />
            <span className="muted" style={{ fontWeight: 400 }}>
              @は付けても付けなくても構いません。大文字小文字は区別しません。
              IDのあとにタブかスペースを空けて日付を書くと、その行だけ別の日付で記録します。
            </span>
          </label>
          <div className="milestones">
            <Check
              name="overwrite"
              label="既に日付が入っているものも上書きする"
              checked={false}
            />
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn primary" type="submit">
              この内容で記録する
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>記録日をまとめて付け替える</h2>
            <p>
              一覧のボタンで記録すると、その日の日付が入ります。前の月の分をまとめて
              入力したときなど、<strong>あとから正しい日付に直せます。</strong>
              日付が変わると<strong>報酬の集計月も変わります。</strong>
            </p>
          </div>
        </div>

        <form className="toolbar" style={{ marginBottom: 10 }}>
          <label className="field">
            <span>いつ付けの記録を直すか</span>
            <input type="date" name="fix" defaultValue={fixFrom} max={today()} />
          </label>
          {sp.user ? <input type="hidden" name="user" value={sp.user} /> : null}
          {sp.stage ? <input type="hidden" name="stage" value={sp.stage} /> : null}
          {sp.q ? <input type="hidden" name="q" value={sp.q} /> : null}
          <button className="btn" type="submit">
            件数を確認
          </button>
        </form>

        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <div className="count-tile">
            <span>LINE誘導</span>
            <strong>{onFixDate.guided.toLocaleString("ja-JP")}件</strong>
          </div>
          <div className="count-tile">
            <span>LINE登録</span>
            <strong>{onFixDate.line.toLocaleString("ja-JP")}件</strong>
          </div>
          <div className="count-tile">
            <span>面談実施</span>
            <strong>{onFixDate.meeting.toLocaleString("ja-JP")}件</strong>
          </div>
        </div>

        {onFixDate.guided + onFixDate.line + onFixDate.meeting === 0 ? (
          <div className="empty">{fixFrom} 付けの記録はありません。</div>
        ) : (
          <form action={shiftLeadDates}>
            <input type="hidden" name="from_date" value={fixFrom} />
            <input type="hidden" name="back_to" value={pageHref(page)} />
            <div className="toolbar">
              <label className="field">
                <span>変更前</span>
                <input type="date" value={fixFrom} disabled />
              </label>
              <label className="field">
                <span>変更後の日付</span>
                <input type="date" name="to_date" max={today()} required />
              </label>
            </div>
            <div className="milestones">
              <Check name="field_line" label={`LINE登録 ${onFixDate.line}件`} checked />
              <Check
                name="field_meeting"
                label={`面談実施 ${onFixDate.meeting}件`}
                checked
              />
              <Check
                name="field_guided"
                label={`LINE誘導 ${onFixDate.guided}件`}
                checked={false}
              />
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="btn primary" type="submit">
                チェックした記録を変更後の日付に付け替える
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>リード一覧</h2>
            <p>
              全{total.toLocaleString("ja-JP")}件。日付をクリックすると記録を取り消せます。
              ボタンで記録する日付は
              <strong>
                {asOf === today() ? `今日（${asOf}）` : asOf}
              </strong>
              です。
            </p>
          </div>
          <form className="toolbar">
            <label className="field">
              <span>記録する日付</span>
              <input type="date" name="as_of" defaultValue={asOf} max={today()} />
            </label>
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
                <th>LINE誘導</th>
                <th>LINE登録</th>
                <th>面談</th>
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
                    {userById.get(l.user_id)?.name ?? "-"}
                  </td>
                  <td className="muted">
                    {l.account_id && accountById.has(l.account_id)
                      ? `@${accountById.get(l.account_id)!.handle}`
                      : "-"}
                  </td>
                  <td>
                    <span className={`badge ${STAGE_BADGE[l.stage]}`}>
                      {LEAD_STAGE_LABEL[l.stage]}
                    </span>
                  </td>
                  <td className="muted">{l.replied_at ?? "-"}</td>
                  <td className="muted">{l.line_guided_at ?? "-"}</td>
                  <td>
                    <MilestoneCell
                      leadId={l.id}
                      field="line"
                      date={l.line_at}
                      onLabel="LINE登録"
                      asOf={asOf}
                      backTo={listHref}
                    />
                  </td>
                  <td>
                    <MilestoneCell
                      leadId={l.id}
                      field="meeting"
                      date={l.meeting_at}
                      onLabel="面談済"
                      asOf={asOf}
                      backTo={listHref}
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

/** 到達済みなら日付、未到達ならワンクリックで記録できるボタンを出す。 */
function MilestoneCell({
  leadId,
  field,
  date,
  onLabel,
  asOf,
  backTo,
}: {
  leadId: number;
  field: "guided" | "line" | "meeting";
  date: string | null;
  onLabel: string;
  /** 記録する日付。既定は今日だが、過去の分をまとめて入れるときに変えられる */
  asOf: string;
  backTo: string;
}) {
  return (
    <form action={setLeadMilestone} className="inline-form">
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="on" value={date ? "0" : "1"} />
      <input type="hidden" name="as_of" value={asOf} />
      <input type="hidden" name="back_to" value={backTo} />
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
