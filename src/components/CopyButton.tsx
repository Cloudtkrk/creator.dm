"use client";

import { useState } from "react";

/** 送付文章をそのままTikTokに貼り付けられるようにするためのコピーボタン。 */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return; // クリップボードが使えない環境では何もしない（手動選択で対応）
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "コピーしました" : "本文をコピー"}
    </button>
  );
}
