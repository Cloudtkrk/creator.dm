/**
 * 画面の読み込み中に出す骨組み。ボタンを押した瞬間にこれへ切り替わるので、
 * サーバーの応答を待っている間も「押せていない」ように見えない。
 */
export default function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="読み込み中">
      <div className="sk-line sk-title" />
      <div className="sk-line sk-sub" />
      <div className="sk-card">
        {Array.from({ length: rows }, (_, i) => (
          <div className="sk-line" key={i} style={{ width: `${92 - i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}
