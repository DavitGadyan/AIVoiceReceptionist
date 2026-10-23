"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DUR, EASE_OUT, popIn } from "@/lib/motion";

type Tone = "success" | "warn" | "danger" | "neutral";
type ToastInput = { title: string; description?: string; tone?: Tone; duration?: number };
type ToastItem = ToastInput & { id: number };

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});

/** `const toast = useToast(); toast({ title: "Saved", tone: "success" })` */
export const useToast = () => useContext(ToastCtx);

const ICONS: Record<Tone, typeof Info> = { success: CheckCircle2, warn: AlertTriangle, danger: AlertTriangle, neutral: Info };
const TONE_CLS: Record<Tone, string> = { success: "text-success", warn: "text-warn", danger: "text-danger", neutral: "text-accent" };

const MAX = 3;
const DEFAULT_MS = 3500;

/**
 * Bottom-right on desktop, top on mobile (so it never collides with the Settings
 * "Unsaved changes" bar at bottom-4). Enter: pop from scale(0.96)+8px; exit mirrors, faster.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs, { ...t, id }].slice(-MAX));
      window.setTimeout(() => dismiss(id), t.duration ?? DEFAULT_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-4 md:right-4 md:top-auto md:w-[360px]"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const tone = t.tone ?? "neutral";
            const Icon = ICONS[tone];
            return (
              <m.div
                key={t.id}
                role="status"
                variants={popIn}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: DUR.base, ease: EASE_OUT }}
                className="glass pointer-events-auto flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-[14px] text-ink shadow-[var(--glass-shadow)]"
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_CLS[tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
                </div>
                <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
