import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "creator.dm | TikTok Shop クリエイターDM運用管理",
  description:
    "TikTok Shop クリエイターへのDM運用（送付数・返信数・報酬・文章・LINE登録）を一元管理するツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
