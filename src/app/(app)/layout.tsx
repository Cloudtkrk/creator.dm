import { requireUser } from "@/lib/auth";
import { computeAlerts } from "@/lib/alerts";
import Nav from "@/components/Nav";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const alerts = computeAlerts(isAdmin ? undefined : user.id);
  const urgent = alerts.filter((a) => a.level !== "info").length;

  const main = [
    { href: "/", label: "ダッシュボード", icon: "◫" },
    { href: "/daily", label: "日報入力", icon: "✎" },
    { href: "/leads", label: "リード管理", icon: "☎" },
    { href: "/templates", label: "送付文章", icon: "✉" },
    { href: "/accounts", label: "アカウント", icon: "◎" },
    { href: "/alerts", label: "アラート", icon: "⚠", badge: urgent },
  ];

  const sections = isAdmin
    ? [
        {
          label: "管理者メニュー",
          items: [
            { href: "/rewards", label: "報酬管理", icon: "¥" },
            { href: "/members", label: "メンバー・単価", icon: "☰" },
            { href: "/settings", label: "アラート設定", icon: "⚙" },
          ],
        },
      ]
    : [];

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
          <span>{isAdmin ? "管理者" : "運用者"}</span>
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
