"use client";

import { Plus, Trash2, X } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Card, inputCls } from "@/components/ui/primitives";
import { DUR, EASE_OUT, popIn } from "@/lib/motion";

/** Free-text chips: Enter or comma adds, Backspace on empty removes the last one. */
export function ChipsInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !value.includes(s));
    if (items.length) onChange([...value, ...items]);
    setDraft("");
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-ground px-2 py-1.5 focus-within:border-accent">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-peri-soft px-2.5 py-1 text-[13px] font-medium text-accent">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full hover:text-ink">
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        className="min-w-[120px] flex-1 bg-transparent px-1.5 py-1 text-[14px] outline-none placeholder:text-muted/70"
        value={draft}
        placeholder={placeholder ?? "Type and press Enter"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
    </div>
  );
}

/** Repeatable list of small forms with add/remove. */
export function RepeatList<T>({
  items, onChange, make, render, addLabel, empty,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  make: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, index: number) => ReactNode;
  addLabel: string;
  empty?: string;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 && empty && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted">{empty}</p>}
      {items.map((item, i) => (
        <Card key={i} className="relative p-4 pr-14">
          {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
          <button
            type="button"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-xl text-muted hover:bg-surface hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </Card>
      ))}
      <Button type="button" size="sm" onClick={() => onChange([...items, make()])}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}

export function Section({ title, desc, children, aside }: { title: string; desc?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line pb-8 pt-2 last:border-0">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold">{title}</h2>
          {desc && <p className="mt-1 max-w-xl text-[14px] text-muted">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Text({ value, onChange, label, ...rest }: { value: string | number | null | undefined; onChange: (v: string) => void; label: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input aria-label={label} className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Area({ value, onChange, label, rows = 3 }: { value: string; onChange: (v: string) => void; label: string; rows?: number }) {
  return <textarea aria-label={label} rows={rows} className={`${inputCls} resize-y`} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Centred dialog in a portal. Backdrop fades; the panel pops in from scale(0.96)
 * and leaves at scale(0.98), faster. Wrap the caller's `{open && <Modal/>}` in
 * `<AnimatePresence>` so the exit plays. Escape closes.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center p-4">
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DUR.base, ease: EASE_OUT } }}
        exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE_OUT } }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <m.div
        variants={popIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: DUR.base, ease: EASE_OUT }}
        style={{ transformOrigin: "center" }}
        className="relative max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-[var(--radius-card)] bg-ground text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button aria-label="Close" onClick={onClose} className="press grid size-9 place-items-center rounded-xl hover:bg-surface"><X className="size-4" /></button>
        </div>
        <div className="max-h-[70dvh] overflow-auto p-5">{children}</div>
      </m.div>
    </div>,
    document.body,
  );
}
