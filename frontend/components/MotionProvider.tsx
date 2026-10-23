"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * One motion runtime for the whole app. `domMax` is needed for layoutId indicators;
 * `strict` throws if anyone imports `motion.*` instead of `m.*` (which would pull the
 * full bundle). `reducedMotion="user"` drops transform/layout animation for people who
 * asked for it while keeping opacity fades.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DUR.base, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
