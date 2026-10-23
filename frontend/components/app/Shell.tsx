"use client";

import {
  BarChart3, BookOpen, CreditCard, GitBranch, HelpCircle, Home, Languages, LogOut, Moon, Phone, PhoneCall, Search, Settings, Sun, Users, Wand2,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/primitives";
import { api, getToken, setToken } from "@/lib/api";
import { initials } from "@/lib/format";
import { DUR, EASE_OUT, SPRING } from "@/lib/motion";
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

const rowCls = "relative flex h-11 items-center gap-3.5 rounded-xl px-3 text-[15px] font-medium transition-colors duration-[var(--dur-fast)] hover:bg-surface";

/**
 * Nav + footer rows shared by the desktop column and the mobile drawer. `idPrefix`
 * keeps the two active-pill layoutIds apart so they never animate into each other.
 */
function SidebarContent({
  idPrefix, path, me, dark, onToggleTheme, onSignOut,
}: {
  idPrefix: string;
  path: string;
  me: Me | null;
  dark: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const isActive = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`${rowCls} ${active ? "text-ink" : "text-ink/80 hover:text-ink"}`}>
              {active && (
                <m.span layoutId={`${idPrefix}nav-active`} transition={SPRING} className="absolute inset-0 bg-ground" style={{ borderRadius: 12 }} aria-hidden />
              )}
              <span className="relative flex items-center gap-3.5">
                <Icon className="size-[19px]" strokeWidth={1.7} />
                {label}
              </span>
            </Link>
          );
        })}
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
        <button onClick={onToggleTheme} className={`${rowCls} w-full text-left`}>
          {dark ? <Sun className="size-[19px]" strokeWidth={1.7} /> : <Moon className="size-[19px]" strokeWidth={1.7} />} Mode
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-line px-2 pt-4">
        <Avatar text={initials(me?.user.name || me?.user.email || "?")} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{me?.user.name || "—"}</p>
          <p className="truncate text-[12px] text-muted">{me ? `${me.tenant.name} | ${me.user.role}` : ""}</p>
        </div>
        <button aria-label="Sign out" className="press grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={onSignOut}>
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  );
}

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

  const signOut = () => {
    setToken(null);
    router.replace("/login");
  };

  const sidebarProps = { path, me, dark, onToggleTheme: toggleTheme, onSignOut: signOut };

  return (
    <MeCtx.Provider value={me}>
      <div data-theme={dark ? "dark" : "light"} className="relative isolate min-h-dvh p-0 text-ink md:p-4 lg:p-6">
        <Aurora />
        <div className="glass glass-frame mx-auto flex min-h-dvh max-w-[1680px] flex-col overflow-hidden text-ink md:min-h-[calc(100dvh-2rem)] md:rounded-[var(--radius-frame)] lg:min-h-[calc(100dvh-3rem)]">
          {/* Top bar */}
          <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line px-4 md:gap-6 md:px-6">
            <button aria-label="Open menu" onClick={() => setOpen(true)} className="glass press grid size-10 shrink-0 place-items-center rounded-xl bg-surface md:hidden">
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
              <label className="glass group flex h-11 w-full max-w-[420px] items-center gap-2.5 rounded-full bg-surface px-4 text-[14px] transition-[box-shadow,background-color] duration-[var(--dur-fast)] focus-within:bg-ground focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]">
                <Search className="size-4 shrink-0 text-muted transition-colors duration-[var(--dur-fast)] group-focus-within:text-accent" />
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
              <Link href="/app/test" className="btn-primary press inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white">
                <Wand2 className="size-4" /> <span className="hidden sm:inline">Test call</span>
              </Link>
              <Avatar text={initials(me?.user.name || me?.user.email || "?")} size={40} />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* Desktop sidebar */}
            <aside className="hidden w-[220px] shrink-0 flex-col border-r border-line px-3 pb-5 pt-5 md:flex">
              <SidebarContent idPrefix="d-" {...sidebarProps} />
            </aside>

            {/* Mobile drawer: springs in from the left over a fading backdrop. Opaque ground, no blur, so the slide stays cheap. */}
            <AnimatePresence>
              {open && (
                <>
                  <m.button
                    key="backdrop"
                    aria-label="Close menu"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: DUR.base, ease: EASE_OUT } }}
                    exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE_OUT } }}
                    className="fixed inset-0 z-30 bg-black/40 md:hidden"
                    onClick={() => setOpen(false)}
                  />
                  <m.aside
                    key="drawer"
                    initial={{ transform: "translateX(-100%)" }}
                    animate={{ transform: "translateX(0%)" }}
                    exit={{ transform: "translateX(-100%)" }}
                    transition={SPRING}
                    className="fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-[var(--aurora-base)] px-3 pb-5 pt-5 shadow-[0_40px_120px_-40px_rgba(20,10,80,0.45)] md:hidden"
                  >
                    <div className="mb-6 flex items-center justify-between px-2">
                      <Logo />
                      <button aria-label="Close menu" onClick={() => setOpen(false)} className="press grid size-9 place-items-center rounded-lg hover:bg-surface">
                        ×
                      </button>
                    </div>
                    <SidebarContent idPrefix="m-" {...sidebarProps} />
                  </m.aside>
                </>
              )}
            </AnimatePresence>

            <main className="min-w-0 flex-1">
              <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </MeCtx.Provider>
  );
}
