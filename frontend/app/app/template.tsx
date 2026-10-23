"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * Page enter for every app route: fade + 8px rise, once per navigation (templates
 * remount per route, the Shell in layout.tsx does not). This is the one deliberate
 * use of the `y` shorthand: motion writes `transform: none` at rest, so `position:
 * fixed` descendants (the Settings "Unsaved" bar, the Modal) stay viewport-anchored.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE_OUT }}>
      {children}
    </m.div>
  );
}
