"use client";

import { useEffect, useRef } from "react";

/**
 * Dotted, wobbling concentric rings behind the head (template screen 1).
 * Canvas 2D: ~3k dots, cheap enough to run every frame; frozen under reduced motion.
 */
export function WaveRings({ level = 0 }: { level?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let amp = 0;
    const draw = (t: number) => {
      amp += (levelRef.current - amp) * 0.08;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.55;
      const maxR = Math.min(w, h * 1.4) * 0.48;
      const rings = 16;
      for (let k = 0; k < rings; k++) {
        const base = maxR * (0.32 + (k / rings) * 0.68);
        const dots = Math.floor(base / 1.7);
        const alpha = 0.22 + 0.4 * (1 - Math.abs(k / rings - 0.45) * 1.6);
        ctx.fillStyle = `rgba(165, 172, 240, ${Math.max(0.1, alpha)})`;
        for (let i = 0; i < dots; i++) {
          const a = (i / dots) * Math.PI * 2;
          const wob =
            Math.sin(a * 7 + t * 0.0006 + k * 0.5) * (6 + k * 0.6) +
            Math.sin(a * 3 - t * 0.0004 + k) * (4 + amp * 30) +
            Math.sin(a * 13 + t * 0.001) * amp * 10;
          const r = base + wob;
          ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, 2, 2);
        }
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
