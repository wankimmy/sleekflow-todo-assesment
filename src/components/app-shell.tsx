"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthControls } from "@/features/auth/auth-controls";
import { RealtimeInvalidator } from "@/features/todos/components/realtime-invalidator";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/graph", label: "Graph" },
  { href: "/calendar", label: "Calendar" },
  { href: "/trash", label: "Trash" },
  { href: "/docs", label: "API Docs" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <RealtimeInvalidator />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              SleekFlow Assessment
            </p>
            <h1 className="text-lg font-semibold sm:text-xl">TODO Workspace</h1>
          </div>

          <AuthControls />

          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium md:hidden"
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>

          <nav
            id="primary-navigation"
            className={`${open ? "flex" : "hidden"} absolute left-0 right-0 top-[72px] z-40 flex-col gap-1 border-b border-slate-200 bg-white p-4 shadow md:static md:flex md:flex-row md:border-0 md:p-0 md:shadow-none`}
            aria-label="Primary"
          >
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"
      >
        {children}
      </main>
    </div>
  );
}
