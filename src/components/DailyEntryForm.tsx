"use client";

import { useState } from "react";

export type EntryRow = {
  id: number;
  handle: string;
  nickname: string;
  dailyGoal: number;
  sent: number;
  reply: number;
  memo: string;
};

/**
 * 入力中に合計と返信率がその場で見えるようにしたい（入力ミスに自分で気づける）ため、
 * ここだけクライアント側で状態を持つ。送信自体は通常のフォームPOST。
 */
export default function DailyEntryForm({
  action,
  date,
  targetUserId,
  backTo,
  rows,
}: {
  action: (fd: FormData) => void | Promise<void>;
  date: string;
  targetUserId: number;
  backTo: string;
  rows: EntryRow[];
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.id, { sent: r.sent, reply: r.reply }])),
  );

  const set = (id: number, key: "sent" | "reply", raw: string) => {
    const n = Math.max(0, Math.trunc(Number(raw)));
    setValues((v) => ({
      ...v,
      [id]: { ...v[id], [key]: Number.isFinite(n) ? n : 0 },
    }));
  };

  const totalSent = rows.reduce((s, r) => s + (values[r.id]?.sent ?? 0), 0);
  const totalReply = rows.reduce((s, r) => s + (values[r.id]?.reply ?? 0), 0);
  const goal = rows.reduce((s, r) => s + r.dailyGoal, 0);
  const rate = totalSent > 0 ? (totalReply / totalSent) * 100 : 0;
  const overfilled = rows.some(
    (r) => (values[r.id]?.reply ?? 0) > (values[r.id]?.sent ?? 0),
  );

  return (
    <form action={action}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="target_user" value={targetUserId} />
      <input type="hidden" name="back_to" value={backTo} />

      <p className="entry-guide">
        <b>返信数は「有効な返信」だけを数えてください。</b>
        お断りやスタンプのみなど、コミュニケーションに繋がらなかったものは含めません。
      </p>

      {rows.map((r) => {
        const v = values[r.id] ?? { sent: 0, reply: 0 };
        const bad = v.reply > v.sent;
        return (
          <div className="entry" key={r.id}>
            <input type="hidden" name="account_id" value={r.id} />
            <div className="entry-head">
              <span className="entry-handle">@{r.handle}</span>
              {r.nickname ? (
                <span className="entry-nick">{r.nickname}</span>
              ) : null}
              {r.dailyGoal > 0 ? (
                <span className="entry-nick">目標 {r.dailyGoal}件</span>
              ) : null}
              <span className="entry-rate">
                {bad ? (
                  <span style={{ color: "var(--danger)" }}>
                    返信数が送付数を超えています
                  </span>
                ) : v.sent > 0 ? (
                  `返信率 ${((v.reply / v.sent) * 100).toFixed(1)}%`
                ) : (
                  ""
                )}
              </span>
            </div>
            <div className="entry-fields">
              <label>
                送付数
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name={`sent_${r.id}`}
                  value={v.sent}
                  onChange={(e) => set(r.id, "sent", e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <label>
                返信数<span className="fine">有効な返信のみ</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name={`reply_${r.id}`}
                  value={v.reply}
                  onChange={(e) => set(r.id, "reply", e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  style={bad ? { borderColor: "var(--danger)" } : undefined}
                />
              </label>
            </div>
            <div className="entry-memo">
              <input
                type="text"
                name={`memo_${r.id}`}
                defaultValue={r.memo}
                placeholder="メモ（制限がかかった / 別ジャンルを試した など）"
              />
            </div>
          </div>
        );
      })}

      <div className="op-savebar">
        <div className="running">
          送付 {totalSent.toLocaleString("ja-JP")}
          {goal > 0 ? <span> / 目標 {goal.toLocaleString("ja-JP")}</span> : null}
          <br />
          <span>
            返信 {totalReply.toLocaleString("ja-JP")}・返信率 {rate.toFixed(1)}%
          </span>
        </div>
        <button className="btn primary" type="submit" disabled={overfilled}>
          この日の実績を保存
        </button>
      </div>
    </form>
  );
}
