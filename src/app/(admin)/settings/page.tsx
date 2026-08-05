import { requireAdmin } from "@/lib/auth";
import { getSettings, measureDbLatency, type DbLatency } from "@/lib/db";
import { Flash } from "@/components/ui";
import { saveSettings } from "@/app/actions";

export const dynamic = "force-dynamic";

/** 往復時間から、データベースが近くにあるかを判定する。 */
function verdict(ms: number): { level: string; label: string; note: string } {
  if (ms < 15) {
    return {
      level: "ok",
      label: "近い",
      note: "関数とデータベースが同じ地域にあります。この構成が理想です。",
    };
  }
  if (ms < 60) {
    return {
      level: "warn",
      label: "やや遠い",
      note: "同じ国か近隣地域と思われます。実用上は問題ありませんが、地域を揃えるとさらに速くなります。",
    };
  }
  return {
    level: "danger",
    label: "遠い",
    note: "別の大陸にある可能性が高いです。1回の読み込みごとにこの時間が数回分そのまま上乗せされます。データベースを東京（ap-northeast-1）に作り直して繋ぎ替えることを検討してください。",
  };
}

const FIELDS: {
  key: string;
  label: string;
  unit: string;
  help: string;
}[] = [
  {
    key: "alert_window_days",
    label: "判定対象期間",
    unit: "日",
    help: "アラートを判定する直近の日数。短くすると変化に敏感になります。",
  },
  {
    key: "alert_min_sent",
    label: "判定に必要な最低送付数",
    unit: "件",
    help: "期間内の送付数がこれ未満なら返信率の判定をスキップします（母数が小さいと率が暴れるため）。",
  },
  {
    key: "alert_reply_rate_warn",
    label: "返信率の注意ライン",
    unit: "%",
    help: "この値を下回ると「注意」アラートを出します。",
  },
  {
    key: "alert_reply_rate_danger",
    label: "返信率の危険ライン",
    unit: "%",
    help: "この値を下回ると「危険」アラートを出します。注意ラインより小さい値にしてください。",
  },
  {
    key: "alert_missing_report_days",
    label: "日報未入力の警告日数",
    unit: "日",
    help: "過去この日数分をさかのぼり、日報が未入力の日があれば警告します。",
  },
  {
    key: "alert_line_rate_warn",
    label: "LINE転換率の注意ライン",
    unit: "%",
    help: "返信数に対するLINE登録数の割合がこれを下回ると警告します。",
  },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; t?: string; probe?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await getSettings();

  // 実測は往復を数回使うので、押されたときだけ行う
  let latency: DbLatency | null = null;
  let probeError: string | null = null;
  if (sp.probe) {
    try {
      latency = await measureDbLatency();
    } catch (e) {
      probeError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>アラート設定</h1>
          <p>
            返信率の悪化や日報の未入力を検知する閾値を設定します。
            変更は保存した直後からアラート画面とダッシュボードに反映されます。
          </p>
        </div>
      </div>

      <Flash msg={sp.msg} t={sp.t} />

      <div className="card">
        <form action={saveSettings}>
          {FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span>
                {f.label}（{f.unit}）
              </span>
              <input
                type="number"
                name={f.key}
                min={0}
                step="any"
                defaultValue={settings[f.key]}
              />
              <span className="muted" style={{ fontWeight: 400 }}>
                {f.help}
              </span>
            </label>
          ))}
          <button className="btn primary" type="submit">
            保存する
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>データベースとの往復時間</h2>
            <p>
              画面の待ち時間はほぼ「往復回数 × この時間」で決まります。
              表示が遅いと感じたら、まずここを測ってください。
            </p>
          </div>
          <a className="btn" href="/settings?probe=1">
            {latency || probeError ? "もう一度測る" : "測定する"}
          </a>
        </div>

        {probeError ? (
          <div className="empty">測定できませんでした：{probeError}</div>
        ) : latency ? (
          <>
            <div className="grid cols-4">
              <div className="count-tile">
                <span>1往復（中央値）</span>
                <strong>{latency.medianMs} ms</strong>
              </div>
              <div className="count-tile">
                <span>最速 / 最遅</span>
                <strong>
                  {latency.minMs} / {latency.maxMs} ms
                </strong>
              </div>
              <div className="count-tile">
                <span>接続を開く1回目</span>
                <strong>{latency.firstMs} ms</strong>
              </div>
              <div className="count-tile">
                <span>判定</span>
                <strong>
                  <span className={`badge ${verdict(latency.medianMs).level}`}>
                    {verdict(latency.medianMs).label}
                  </span>
                </strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              {verdict(latency.medianMs).note}
            </p>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              接続先：{latency.host} ／ 現在の作りでは1画面あたり往復2回です
              （＝おおよそ {latency.medianMs * 2} ms がデータベース待ちの時間）。
            </p>
          </>
        ) : (
          <div className="empty">
            「測定する」を押すと、この画面を動かしているサーバーから
            データベースまでの往復時間を実測します。
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>アラートの種類</h2>
            <p>設定値をもとに、以下の観点で自動判定しています。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>種類</th>
                <th className="wrap">判定内容</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>返信率の低下</td>
                <td className="wrap">
                  運用者単位で、期間内の返信率が注意／危険ラインを下回った場合。
                </td>
              </tr>
              <tr>
                <td>アカウント別の返信率</td>
                <td className="wrap">
                  特定のアカウントだけ返信率が低い場合。シャドウバンの検知に使えます。
                </td>
              </tr>
              <tr>
                <td>送付実績ゼロ</td>
                <td className="wrap">
                  稼働中のアカウントなのに、期間内の送付が0件の場合。
                </td>
              </tr>
              <tr>
                <td>日報の未入力</td>
                <td className="wrap">
                  設定日数分さかのぼって、日報が入力されていない日がある場合。
                </td>
              </tr>
              <tr>
                <td>LINE転換率の低下</td>
                <td className="wrap">
                  返信が10件以上あるのに、LINE登録への転換率が注意ラインを下回る場合。
                </td>
              </tr>
              <tr>
                <td>BANアカウント</td>
                <td className="wrap">
                  状態が「BAN」のアカウントが登録されている場合（参考情報）。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
