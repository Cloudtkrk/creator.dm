import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import { KEEP_BACKUPS, listBackups } from "@/lib/backup";
import { Flash, Stat } from "@/components/ui";
import { backupNow, restoreFromUpload } from "./actions";

export const dynamic = "force-dynamic";

const TABLE_LABEL: Record<string, string> = {
  users: "メンバー",
  rate_cards: "単価",
  tiktok_accounts: "アカウント",
  daily_reports: "日報",
  templates: "送付文章",
  template_revisions: "文章の履歴",
  leads: "リード",
  reward_adjustments: "報酬の調整",
  reward_statuses: "報酬の状態",
  settings: "設定",
};

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(n / 1024))}KB`;

/** 最終取得からどれくらい経ったか。1日以上空いていたら警告する。 */
function freshness(iso: string | undefined) {
  if (!iso) return { label: "未取得", level: "danger" as const };
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 26) return { label: "正常", level: "ok" as const };
  if (hours < 50) return { label: "1日以上前", level: "warn" as const };
  return { label: `${Math.floor(hours / 24)}日以上前`, level: "danger" as const };
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const backups = await listBackups();
  const latest = backups[0];
  const state = freshness(latest?.created_at);
  const counts: Record<string, number> = latest
    ? JSON.parse(latest.row_counts)
    : {};

  return (
    <>
      <div className="page-head">
        <div>
          <h1>バックアップ</h1>
          <p>
            毎日自動で全データの控えを取ります。直近{KEEP_BACKUPS}件を保管し、
            古いものから自動で削除されます。
          </p>
        </div>
        <form action={backupNow}>
          <button className="btn primary" type="submit">
            今すぐバックアップ
          </button>
        </form>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="grid cols-3">
        <Stat
          label="最終取得"
          value={latest ? formatDateTime(latest.created_at) : "—"}
          sub={`状態：${state.label}`}
        />
        <Stat label="保管数" value={backups.length} unit={`/ ${KEEP_BACKUPS}件`} />
        <Stat
          label="最新の容量"
          value={latest ? kb(latest.size_bytes) : "—"}
          sub="gzip圧縮後"
        />
      </div>

      {state.level !== "ok" ? (
        <div className="form-msg error" style={{ marginTop: 16 }}>
          最後のバックアップから時間が経っています（{state.label}）。
          自動実行が止まっている可能性があるため、Vercel の Cron Jobs の状態を確認してください。
        </div>
      ) : null}

      {latest ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2>最新バックアップの中身</h2>
              <p>{formatDateTime(latest.created_at)} 時点の件数</p>
            </div>
          </div>
          <div className="grid cols-4">
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} className="count-tile">
                <span>{TABLE_LABEL[k] ?? k}</span>
                <strong>{v.toLocaleString("ja-JP")}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div>
            <h2>取得履歴</h2>
            <p>
              ダウンロードしたファイルは、下の「バックアップから復元する」でそのまま戻せます。
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>取得日時</th>
                <th>種別</th>
                <th className="num">容量</th>
                <th className="num">日報</th>
                <th className="num">リード</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => {
                const c: Record<string, number> = JSON.parse(b.row_counts);
                return (
                  <tr key={b.id}>
                    <td>{formatDateTime(b.created_at)}</td>
                    <td>
                      <span
                        className={`badge ${b.kind === "daily" ? "info" : "neutral"}`}
                      >
                        {b.kind === "daily" ? "自動" : "手動"}
                      </span>
                    </td>
                    <td className="num">{kb(b.size_bytes)}</td>
                    <td className="num">
                      {(c.daily_reports ?? 0).toLocaleString("ja-JP")}
                    </td>
                    <td className="num">{(c.leads ?? 0).toLocaleString("ja-JP")}</td>
                    <td>
                      <div className="toolbar">
                        <a className="btn small" href={`/api/backups/${b.id}`}>
                          JSON
                        </a>
                        <a
                          className="btn small"
                          href={`/api/backups/${b.id}?gz=1`}
                          title="圧縮したまま保存します。復元・引っ越しにはこちらを使ってください"
                        >
                          .gz
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    まだバックアップがありません。「今すぐバックアップ」で1件作れます。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card danger-zone">
        <div className="card-head">
          <div>
            <h2>バックアップから復元する</h2>
            <p>
              ダウンロードしたファイル（<code>.json</code> でも{" "}
              <code>.json.gz</code> でも可）を読み込んで、
              <strong>現在のデータを全て置き換えます。</strong>
              誤操作やデータ消失からの復旧のほか、
              <strong>別のデータベースへ引っ越すとき</strong>にも使います。
            </p>
          </div>
        </div>

        <div className="form-msg error" style={{ marginBottom: 12 }}>
          いまのデータは全て消えます。実行する前に、上の「今すぐバックアップ」で
          現在の状態を取ってダウンロードしておいてください。
          復元は1つのまとまりとして行うため、途中で失敗した場合は元の状態に戻ります。
        </div>

        <form action={restoreFromUpload}>
          <label className="field">
            <span>バックアップのファイル</span>
            <input type="file" name="file" accept=".json,.gz,application/json,application/gzip" required />
          </label>
          <label className="field">
            <span>確認のため「復元する」と入力してください</span>
            <input
              type="text"
              name="confirm"
              placeholder="復元する"
              autoComplete="off"
              required
            />
          </label>
          <button className="btn danger" type="submit">
            このファイルの内容で全て置き換える
          </button>
        </form>
      </div>
    </>
  );
}
