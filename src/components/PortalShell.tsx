"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui";
import { signOut } from "@/app/login/actions";

export type NavItem = { href: string; label: string; badge?: number };

const ROLE_ACCENT = {
  teacher: "text-sage-600",
  student: "text-mustard-600",
  admin: "text-clay-500",
} as const;

export function PortalShell({
  role,
  userName,
  subtitle,
  nav,
  children,
}: {
  role: "teacher" | "student" | "admin";
  userName: string;
  subtitle?: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== `/${role}` && pathname.startsWith(`${href}/`));

  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const links = (
    <ul className="space-y-1">
      {nav.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-ring",
              isActive(item.href)
                ? "bg-ink-800 text-paper-50"
                : "text-ink-600 hover:bg-paper-200 hover:text-ink-900",
            )}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold",
                  isActive(item.href)
                    ? "bg-paper-50 text-ink-900"
                    : "bg-mustard-500 text-ink-900",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------------------------------------------------- mobile bar */}
      <header className="sticky top-0 z-30 border-b border-paper-300 bg-paper-50/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href={`/${role}`} className="focus-ring rounded">
            <span className="font-serif text-lg text-ink-900">The Binder</span>
            <span className={cn("ml-2 text-xs uppercase tracking-[0.16em]", ROLE_ACCENT[role])}>
              {role}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="portal-nav"
            className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm font-semibold text-ink-700 focus-ring"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open ? (
          <nav id="portal-nav" className="border-t border-paper-200 px-4 py-3">
            {links}
            <form action={signOut} className="mt-3 border-t border-paper-200 pt-3">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-500 hover:bg-paper-200 hover:text-ink-900 focus-ring"
              >
                Sign out
              </button>
            </form>
          </nav>
        ) : null}
      </header>

      {/* --------------------------------------------------- desktop rail */}
      <aside className="hidden w-64 shrink-0 border-r border-paper-300 bg-paper-50 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-paper-200 px-5 py-5">
          <Link href={`/${role}`} className="focus-ring block rounded">
            <span className="font-serif text-xl text-ink-900">The Binder</span>
            <span className={cn("mt-0.5 block text-xs uppercase tracking-[0.18em]", ROLE_ACCENT[role])}>
              {role} portal
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">{links}</nav>

        <div className="border-t border-paper-200 px-3 py-4">
          <div className="flex items-center gap-3 px-2 pb-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-xs font-bold text-sage-700">
              {initials || "?"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-800">{userName}</span>
              {subtitle ? (
                <span className="block truncate text-xs text-ink-400">{subtitle}</span>
              ) : null}
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-500 hover:bg-paper-200 hover:text-ink-900 focus-ring"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
