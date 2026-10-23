import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "dark" | "soft" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary text-white active:translate-y-px",
  dark: "bg-ink text-on-ink hover:opacity-90 active:translate-y-px",
  soft: "glass text-ink hover:bg-surface active:translate-y-px",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
};

export function Button({
  variant = "soft",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-9 px-4 text-[13px]" : size === "lg" ? "h-13 px-7 text-[15px]" : "h-11 px-5 text-[14px]";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background,transform,opacity] duration-[var(--dur-fast)] disabled:pointer-events-none disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({ className = "", label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`glass grid size-11 place-items-center rounded-2xl bg-surface text-ink transition-colors hover:bg-line active:translate-y-px ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass rounded-[var(--radius-card)] border border-line ${className}`} {...rest} />;
}

export function Pill({ children, active, onClick, className = "" }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-full border px-4 text-[13px] font-semibold transition-colors ${active ? "border-ink bg-ink text-on-ink" : "glass border-line text-ink hover:bg-surface"} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className = "" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`glass inline-flex max-w-full overflow-x-auto rounded-full p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] font-medium transition-colors ${value === o.value ? "bg-ground text-ink" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  success: "bg-success/10 text-success",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  accent: "bg-accent/10 text-accent",
  neutral: "bg-surface text-muted",
};

export function Badge({ tone = "neutral", children, dot = false, className = "" }: { tone?: keyof typeof TONES; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONES[tone]} ${className}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Outline tag pill, as in the template's contact rows ("Customer", "Urgent"). */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="glass inline-flex h-9 items-center rounded-full border border-line px-4 text-[13px] font-medium">{children}</span>;
}

export function Avatar({ text, size = 44, tone = "peri" }: { text: string; size?: number; tone?: "peri" | "accent" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${tone === "peri" ? "bg-peri-soft text-peri" : "bg-accent text-white"}`}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {text}
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-[var(--dur-fast)] ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        {sub && <span className="text-[14px] text-muted">{sub}</span>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Square-ish icon tile with the template's soft lilac glow behind the glyph. */
export function IconTile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`grid size-14 place-items-center rounded-2xl bg-peri-soft text-accent shadow-[inset_0_1px_0_rgba(255,255,255,.6),inset_0_0_0_1px_rgba(91,91,240,.1)] ${className}`}>
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[14px] text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:bg-ground";

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Loading" />;
}
