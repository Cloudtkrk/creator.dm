import { formatShortDate, isWeekend } from "@/lib/date";

export function Flash({ msg, t }: { msg?: string; t?: string }) {
  if (!msg) return null;
  return <div className={`form-msg ${t === "err" ? "error" : "ok"}`}>{msg}</div>;
}

export function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function RateBadge({
  rate,
  warn,
  danger,
}: {
  rate: number;
  warn: number;
  danger: number;
}) {
  const level = rate < danger ? "danger" : rate < warn ? "warn" : "ok";
  return <span className={`badge ${level}`}>{rate.toFixed(1)}%</span>;
}

export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/**
 * 送付数を棒、返信率を折れ線で重ねた日次トレンド。
 * 依存パッケージを増やさないよう素のSVGで描画する。
 */
export function TrendChart({
  data,
}: {
  data: { date: string; sent: number; reply: number }[];
}) {
  if (data.length === 0) {
    return <div className="empty">表示できるデータがありません。</div>;
  }

  const W = 900;
  const H = 190;
  const padL = 38;
  const padR = 38;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxSent = Math.max(10, ...data.map((d) => d.sent));
  const maxRate = Math.max(
    10,
    ...data.map((d) => (d.sent ? (d.reply / d.sent) * 100 : 0)),
  );

  const step = innerW / data.length;
  const barW = Math.max(2, Math.min(26, step * 0.6));

  const x = (i: number) => padL + step * i + step / 2;
  const yBar = (v: number) => padT + innerH - (v / maxSent) * innerH;
  const yRate = (v: number) => padT + innerH - (v / maxRate) * innerH;

  const linePoints = data
    .map((d, i) => `${x(i)},${yRate(d.sent ? (d.reply / d.sent) * 100 : 0)}`)
    .join(" ");

  const labelEvery = Math.ceil(data.length / 12);

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="日次の送付数と返信率"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padL}
          x2={W - padR}
          y1={padT + innerH * f}
          y2={padT + innerH * f}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {[0, 0.5, 1].map((f) => (
        <text
          key={f}
          x={padL - 6}
          y={padT + innerH * (1 - f) + 4}
          textAnchor="end"
          fontSize={10}
          fill="var(--text-muted)"
        >
          {Math.round(maxSent * f)}
        </text>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text
          key={`r${f}`}
          x={W - padR + 6}
          y={padT + innerH * (1 - f) + 4}
          fontSize={10}
          fill="var(--accent)"
        >
          {(maxRate * f).toFixed(0)}%
        </text>
      ))}

      {data.map((d, i) => (
        <rect
          key={d.date}
          x={x(i) - barW / 2}
          y={yBar(d.sent)}
          width={barW}
          height={Math.max(0, padT + innerH - yBar(d.sent))}
          rx={2}
          fill={isWeekend(d.date) ? "var(--border-strong)" : "var(--text-muted)"}
          opacity={0.55}
        >
          <title>{`${d.date} 送付${d.sent} / 返信${d.reply}`}</title>
        </rect>
      ))}

      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle
          key={`c${d.date}`}
          cx={x(i)}
          cy={yRate(d.sent ? (d.reply / d.sent) * 100 : 0)}
          r={2.5}
          fill="var(--accent)"
        />
      ))}

      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={`t${d.date}`}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-muted)"
          >
            {formatShortDate(d.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function Funnel({
  steps,
}: {
  steps: { label: string; n: number; sub?: string }[];
}) {
  return (
    <div className="funnel">
      {steps.map((s) => (
        <div className="funnel-step" key={s.label}>
          <div className="l">{s.label}</div>
          <div className="n">{s.n.toLocaleString("ja-JP")}</div>
          {s.sub ? <div className="l">{s.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
