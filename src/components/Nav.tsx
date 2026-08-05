"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; badge?: number };

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
      {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
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
