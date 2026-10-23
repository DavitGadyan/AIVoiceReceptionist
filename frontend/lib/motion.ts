import type { Transition, Variants } from "motion/react";

/**
 * Motion constants for motion/react, mirroring the CSS tokens in globals.css.
 *
 * Rules of the house:
 * - entrances/exits ease out; on-screen movement eases in-out; hover colour uses `ease`
 * - UI motion stays under 300ms; `slow` is for marketing reveals only
 * - animate `transform`/`opacity` only; variants use full transform strings so they run
 *   off the main thread. Elements that carry `layout`/`layoutId` never get an explicit
 *   transform animation (they conflict).
 */
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
export const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const DUR = { press: 0.16, fast: 0.18, base: 0.24, slow: 0.6 } as const;

/** Drawer and every layoutId indicator (segmented, sidebar, tabs, process circle). */
export const SPRING: Transition = { type: "spring", duration: 0.5, bounce: 0.2 };
/** Toggle knob: settles under 300ms without visible wobble. */
export const SPRING_SNAPPY: Transition = { type: "spring", duration: 0.3, bounce: 0.1 };

export const tween = (duration: number = DUR.base, delay = 0): Transition => ({ duration, delay, ease: EASE_OUT });

/** Fade + 8px rise. Default enter for content, rows, cards, toasts' siblings. */
export const fadeRise: Variants = {
  initial: { opacity: 0, transform: "translateY(8px)" },
  animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transform: "translateY(4px)" },
};

/** Scale from 0.96 + fade. Popovers, modals, badges, toasts. Never from scale(0). */
export const popIn: Variants = {
  initial: { opacity: 0, transform: "scale(0.96)" },
  animate: { opacity: 1, transform: "scale(1)" },
  exit: { opacity: 0, transform: "scale(0.98)" },
};

export const slideFromLeft: Variants = {
  initial: { opacity: 0, transform: "translateX(-8px)" },
  animate: { opacity: 1, transform: "translateX(0px)" },
  exit: { opacity: 0, transform: "translateX(-4px)" },
};

export const slideFromRight: Variants = {
  initial: { opacity: 0, transform: "translateX(8px)" },
  animate: { opacity: 1, transform: "translateX(0px)" },
  exit: { opacity: 0, transform: "translateX(4px)" },
};

/** Group entrance. Keep between 30 and 80ms; stagger is decorative and must never block interaction. */
export const stagger = (ms = 40, delayMs = 0): Transition => ({
  staggerChildren: Math.min(80, Math.max(30, ms)) / 1000,
  delayChildren: delayMs / 1000,
});

/** Variants for a container whose children use `fadeRise`/`popIn` etc. */
export const group: Variants = { initial: {}, animate: {}, exit: {} };
