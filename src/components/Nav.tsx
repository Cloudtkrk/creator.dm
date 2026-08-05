"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
  /** 後から差し込まれる要素（アラート件数など）を受け取る */
  badge?: React.ReactNode;
};

export default function Nav({
  items,
  sections,
}: {
  items: Item[];
  sections: { label: string; items: Item[] }[];
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const render = (item: Item) => (
    <Link
      key={item.href}
      href={item.href}
      className={isActive(item.href) ? "active" : undefined}
    >
      <span className="nav-icon" aria-hidden>
        {item.icon}
      </span>
      {item.label}
      {item.badge}
    </Link>
  );

  return (
    <>
      <nav className="nav">{items.map(render)}</nav>
      {sections.map((s) => (
        <nav className="nav" key={s.label}>
          <div className="nav-label">{s.label}</div>
          {s.items.map(render)}
        </nav>
      ))}
    </>
  );
}
