/** Same tokens as globals.css, for WebGL materials and charts. Keep in sync. */
export const tokens = {
  color: {
    ground: "#FFFFFF",
    surface: "#F6F6F8",
    line: "#EEEEF2",
    ink: "#111113",
    muted: "#6B7280",
    accent: "#5B5BF0",
    accent2: "#C08BF5",
    peri: "#8F93D6",
    night: "#060606",
    success: "#16A34A",
  },
  chrome: { base: "#D9D4FF", magenta: "#E14BD8", cyan: "#47D7F0", violet: "#5B5BF0" },
  /** Same values as the CSS motion tokens and lib/motion.ts. */
  motion: { ease: [0.23, 1, 0.32, 1] as const, press: 160, fast: 180, base: 240, slow: 600 },
} as const;

export type Tokens = typeof tokens;
