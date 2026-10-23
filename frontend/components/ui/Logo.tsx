/** Receptra wave mark — the template's signal-wave logo, redrawn as an open voice waveform. */
export function LogoMark({ className = "h-6 w-9", stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 48 32" className={className} fill="none" aria-hidden>
      <path
        d="M2 18h6c2 0 3 4 5 4s3-10 5-10 3 14 5 14 3-20 5-20 3 24 5 24 3-26 5-26"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-[20px] font-semibold tracking-tight ${dark ? "text-white" : "text-ink"}`}>
      <LogoMark className="h-6 w-9 text-accent" />
      Receptra
    </span>
  );
}
