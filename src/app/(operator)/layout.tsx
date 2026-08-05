import { requireOperator } from "@/lib/auth";
import OpTabs from "@/components/OpTabs";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * DM送付者（運用者）向けのレイアウト。
 * 管理画面のサイドバーは出さず、毎日の入力に必要な4つのタブだけを見せる。
 */
export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireOperator();

  return (
    <div className="op-shell">
      <header className="op-bar">
        <div className="op-bar-inner">
          <div className="brand">
            <span className="brand-dot" />
            creator.dm
          </div>
          <div className="op-who">
            {user.name}
            <form action={logout}>
              <button className="btn small" type="submit">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        <OpTabs />
      </header>
      <main className="op-main">{children}</main>
    </div>
  );
}
