import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { alertsSnapshot } from "@/lib/alerts";
import Nav from "@/components/Nav";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * サイドバーのアラート件数。集計に数本のクエリが要るため、これを待って
 * 画面全体が遅くなることのないよう Suspense の外に出して後から差し込む。
 */
async function AlertBadge() {
  const urgent = (await alertsSnapshot()).filter((a) => a.level !== "info").length;
  if (!urgent) return null;
  return <span className="nav-badge">{urgent}</span>;
}

/**
 * 管理者向けのレイアウト。運用者は requireAdmin により /my へ送られるため、
 * この配下の画面は管理者だけが見る前提で書いてよい。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  const main = [
    { href: "/", label: "ダッシュボード", icon: "◫" },
    {
      href: "/alerts",
      label: "アラート",
      icon: "⚠",
      badge: (
        <Suspense fallback={null}>
          <AlertBadge />
        </Suspense>
      ),
    },
    { href: "/leads", label: "リード管理", icon: "☎" },
    { href: "/templates", label: "送付文章", icon: "✉" },
    { href: "/accounts", label: "アカウント", icon: "◎" },
    { href: "/daily", label: "日報の代理入力", icon: "✎" },
  ];

  const sections = [
    {
      label: "報酬・メンバー",
      items: [
        { href: "/rewards", label: "報酬管理", icon: "¥" },
        { href: "/members", label: "メンバー・単価", icon: "☰" },
        { href: "/settings", label: "アラート設定", icon: "⚙" },
        { href: "/backups", label: "バックアップ", icon: "⛃" },
      ],
    },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          creator.dm
        </div>
        <Nav items={main} sections={sections} />
        <div className="sidebar-foot">
          <strong>{user.name}</strong>
          <span>管理者</span>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn small" type="submit">
              ログアウト
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
