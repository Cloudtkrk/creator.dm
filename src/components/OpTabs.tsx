"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/my", label: "今日の入力" },
  { href: "/my/history", label: "自分の実績" },
  { href: "/my/leads", label: "LINE・面談" },
  { href: "/my/template", label: "送付文章" },
];

export default function OpTabs() {
  const pathname = usePathname();
  return (
    <nav className="op-tabs">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            (t.href === "/my" ? pathname === "/my" : pathname.startsWith(t.href))
              ? "active"
              : undefined
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
