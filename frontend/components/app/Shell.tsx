"use client";

import {
  BarChart3, BookOpen, CreditCard, GitBranch, HelpCircle, Home, Languages, LogOut, Moon, Phone, PhoneCall, Search, Settings, Sun, Users, Wand2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/primitives";
import { api, getToken, setToken } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Me } from "@/lib/types";

const NAV = [
  { href: "/app", label: "Dashboard", icon: Home },
  { href: "/app/calls", label: "Activity", icon: PhoneCall },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/flow", label: "Call flow", icon: GitBranch },
  { href: "/app/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/app/test", label: "Test call", icon: Wand2 },
  { href: "/app/numbers", label: "Numbers", icon: Phone },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

/**
 * App frame from the template: a full-width top bar (logo, global search, actions), then a
 * ~12% sidebar beside the page. The frame and sidebar are glass panes over the aurora.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/auth/me").then(setMe).catch(() => router.replace("/login"));
    try {
      setDark(localStorage.getItem("receptra.theme") === "dark");
    } catch {
      /* ignore */
    }
  }, [router]);

  useEffect(() => setOpen(false), [path]);

  const toggleTheme = () => {
    setDark((d) => {
      try {
        localStorage.setItem("receptra.theme", d ? "light" : "dark");
      } catch {
        /* ignore */
      }
      return !d;
    });
  };

  const isActive = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const rowCls = "flex h-11 items-center gap-3.5 rounded-xl px-3 text-[15px] font-medium transition-colors hover:bg-surface";

  return (
    <MeCtx.Provider value={me}>
      <div data-theme={dark ? "dark" : "light"} className="relative isolate min-h-dvh p-0 text-ink md:p-4 lg:p-6">
        <Aurora />
        <div className="glass glass-frame mx-auto flex min-h-dvh max-w-[1680px] flex-col overflow-hidden text-ink md:min-h-[calc(100dvh-2rem)] md:rounded-[var(--radius-frame)] lg:min-h-[calc(100dvh-3rem)]">
          {/* Top bar */}
          <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line px-4 md:gap-6 md:px-6">
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="glass grid size-10 shrink-0 place-items-center rounded-xl bg-surface md:hidden">
              <span className="block h-0.5 w-4 bg-ink shadow-[0_5px_0_var(--color-ink),0_-5px_0_var(--color-ink)]" />
            </button>
            <Link href="/app" className="shrink-0 md:w-[196px]">
              <Logo />
            </Link>
            <form
              role="search"
              className="hidden min-w-0 flex-1 md:block"
              onSubmit={(e) => {
                e.preventDefault();
                const term = q.trim();
                router.push(term ? `/app/calls?q=${encodeURIComponent(term)}` : "/app/calls");
              }}
            >
              <label className="glass flex h-11 w-full max-w-[420px] items-center gap-2.5 rounded-full bg-surface px-4 text-[14px]">
                <Search className="size-4 shrink-0 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search calls, names or numbers"
                  aria-label="Search calls, names or numbers"
                  className="w-full bg-transparent outline-none placeholder:text-muted/80"
                />
              </label>
            </form>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link href="/app/test" className="btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white">
                <Wand2 className="size-4" /> <span className="hidden sm:inline">Test call</span>
              </Link>
              <Avatar text={initials(me?.user.name || me?.user.email || "?")} size={40} />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* Sidebar */}
            <aside
              className={`glass glass-frame fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line px-3 pb-5 pt-5 transition-transform md:static md:w-[220px] md:translate-x-0 md:bg-transparent md:shadow-none md:backdrop-blur-none ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
              <div className="mb-6 flex items-center justify-between px-2 md:hidden">
                <Logo />
                <button aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-surface">
                  ×
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
                {NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`${rowCls} ${isActive(href) ? "bg-ground text-ink" : "text-ink/80 hover:text-ink"}`}
                  >
                    <Icon className="size-[19px]" strokeWidth={1.7} />
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4">
                <Link href="/app/settings#assistant" className={rowCls} title="Receptionist languages">
                  <Languages className="size-[19px]" strokeWidth={1.7} />
                  <span>En</span>
                  <span className="ml-auto text-[12px] text-muted">English</span>
                </Link>
                <a href="mailto:support@receptra.ai" className={rowCls}>
                  <HelpCircle className="size-[19px]" strokeWidth={1.7} /> Help & Support
                </a>
                <button onClick={toggleTheme} className={`${rowCls} w-full text-left`}>
                  {dark ? <Sun className="size-[19px]" strokeWidth={1.7} /> : <Moon className="size-[19px]" strokeWidth={1.7} />} Mode
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-line px-2 pt-4">
                <Avatar text={initials(me?.user.name || me?.user.email || "?")} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{me?.user.name || "—"}</p>
                  <p className="truncate text-[12px] text-muted">{me ? `${me.tenant.name} | ${me.user.role}` : ""}</p>
                </div>
                <button
                  aria-label="Sign out"
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
                  onClick={() => {
                    setToken(null);
                    router.replace("/login");
                  }}
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </aside>
            {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

            <main className="min-w-0 flex-1">
              <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </MeCtx.Provider>
  );
}
