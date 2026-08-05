import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings, settingNumber } from "@/lib/db";
import { addDays, today } from "@/lib/date";
import { computeAlerts, type AlertLevel } from "@/lib/alerts";
import { listUsers, replyRate, totalsByUser } from "@/lib/queries";
import { RateBadge, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const MARK: Record<AlertLevel, string> = {
  danger: "🔴",
  warn: "🟡",
  info: "🔵",
};

const LEVEL_LABEL: Record<AlertLevel, string> = {
  danger: "危険",
  warn: "注意",
  info: "参考",
};

export default async function AlertsPage() {
  await requireAdmin();

  const settings = await getSettings();
  const windowDays = settingNumber(settings, "alert_window_days");
  const warn = settingNumber(settings, "alert_reply_rate_warn");
  const danger = settingNumber(settings, "alert_reply_rate_danger");

  const alerts = await computeAlerts();
  const end = today();
  const start = addDays(end, -(windowDays - 1));
  const operators = (await listUsers()).filter((u) => u.role === "operator");
  const byUser = await totalsByUser(start, end);

  const grouped = new Map<number, typeof alerts>();
  for (const a of alerts) {
    const list = grouped.get(a.userId) ?? [];
    list.push(a);
    grouped.set(a.userId, list);
  }

  const counts = {
    danger: alerts.filter((a) => a.level === "danger").length,
    warn: alerts.filter((a) => a.level === "warn").length,
    info: alerts.filter((a) => a.level === "info").length,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>アラート</h1>
          <p>
            直近{windowDays}日（{start} 〜 {end}）の実績から自動判定しています。
            {" "}
            閾値は<Link href="/settings">アラート設定</Link>で変更できます。
          </p>
        </div>
      </div>

      <div className="grid cols-3">
        <Stat label="危険" value={counts.danger} unit="件" sub="すぐに対応が必要" />
        <Stat label="注意" value={counts.warn} unit="件" sub="悪化傾向あり" />
        <Stat label="参考" value={counts.info} unit="件" sub="把握しておく情報" />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>運用者別の状況</h2>
            <p>直近{windowDays}日の返信率</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>運用者</th>
                <th className="num">送付</th>
                <th className="num">返信</th>
                <th className="num">返信率</th>
                <th className="num">危険</th>
                <th className="num">注意</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((u) => {
                const t = byUser.get(u.id) ?? { sent: 0, reply: 0 };
                const list = grouped.get(u.id) ?? [];
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="num">{t.sent.toLocaleString("ja-JP")}</td>
                    <td className="num">{t.reply.toLocaleString("ja-JP")}</td>
                    <td className="num">
                      {t.sent > 0 ? (
                        <RateBadge rate={replyRate(t)} warn={warn} danger={danger} />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td className="num">
                      {list.filter((a) => a.level === "danger").length || "-"}
                    </td>
                    <td className="num">
                      {list.filter((a) => a.level === "warn").length || "-"}
                    </td>
                  </tr>
                );
              })}
              {operators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    運用者が登録されていません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>アラート一覧</h2>
            <p>危険度の高い順に表示しています。</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <div className="empty">
            現在アラートはありません。良好な状態です。
          </div>
        ) : (
          alerts.map((a, i) => (
            <div className={`alert-row ${a.level}`} key={i}>
              <span className="alert-mark" title={LEVEL_LABEL[a.level]}>
                {MARK[a.level]}
              </span>
              <div className="alert-body">
                <span className="alert-who">{a.userName}</span>
                <strong>{a.title}</strong>
                <span>{a.detail}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
