"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * Counts up to `value` on first load (slow) and tweens between later values (base).
 * Writes the DOM directly on each frame so nothing re-renders. Renders "—" while
 * the value is unknown, and the final text instantly under reduced motion.
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  className = "",
}: {
  value?: number | null;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === undefined || value === null) {
      el.textContent = "—";
      prev.current = null;
      return;
    }
    const from = prev.current;
    prev.current = value;
    if (reduced || from === value) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(from ?? 0, value, {
      duration: from === null ? DUR.slow : DUR.base,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, format, reduced]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value === undefined || value === null ? "—" : format(value)}
    </span>
  );
}
