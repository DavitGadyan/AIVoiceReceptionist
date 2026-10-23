import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const FRONT = process.env.DEMO_FRONTEND ?? "http://localhost:3100";
export const API = process.env.DEMO_API ?? "http://localhost:8000";
export const OUT = join(ROOT, "out");
export const RAW = join(ROOT, "raw");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const OVERLAY = readFileSync(join(ROOT, "overlay.js"), "utf8");

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (ms, pct = 0.25) => Math.round(ms * (1 + (Math.random() * 2 - 1) * pct));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Per-scene state: cursor position, start time, marks for post-production. */
export function createScene(page, name) {
  const t0 = Date.now();
  const scene = { page, name, cur: { x: 960, y: 540 }, marks: {}, t0 };

  page.on("console", (msg) => {
    if (msg.type() === "error") log(`[${name}] console.error ${msg.text()}`);
  });
  page.on("pageerror", (err) => log(`[${name}] pageerror ${err.message}`));

  return scene;
}

export function log(line) {
  appendFileSync(join(OUT, "run.log"), `${new Date().toISOString()} ${line}\n`);
}

/** Record a named time (seconds since the recording started) for post.mjs. */
export function mark(scene, key) {
  scene.marks[key] = (Date.now() - scene.t0) / 1000;
}

/** Progress line in run.log so a hang shows its last step. */
export function step(scene, label) {
  log(`[${scene.name}] ${((Date.now() - scene.t0) / 1000).toFixed(1)}s ${label}`);
}

/** Reject if `promise` takes longer than `ms`. */
export function withTimeout(promise, ms, label) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

export async function prepare(context) {
  await context.addInitScript(OVERLAY);
}

/** Navigate, wait for fonts and the first paint, re-sync the cursor overlay. */
export async function go(scene, path, { settle = 900 } = {}) {
  const { page } = scene;
  step(scene, `go ${path}`);
  await page.goto(`${FRONT}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await withTimeout(page.evaluate(() => document.fonts.ready.then(() => true)), 5000, "fonts").catch(() => {});
  await withTimeout(page.mouse.move(scene.cur.x, scene.cur.y), 5000, "cursor sync").catch(() => {});
  await wait(settle);
  const devBadge = await page.locator("nextjs-portal").count();
  if (devBadge) log(`[${scene.name}] WARNING: nextjs dev indicator present on ${path}`);
}

/** Show a caption (fades in); cap(scene, "") hides it. */
export async function cap(scene, text, holdMs = 0) {
  if (text) step(scene, `cap "${text}"`);
  await withTimeout(scene.page.evaluate((t) => window.__cap?.(t), text), 5000, "caption").catch(() => {});
  if (holdMs) await wait(holdMs);
}

/** Move the cursor along a soft curve to a point. */
export async function moveTo(scene, to, ms = 700) {
  const { page } = scene;
  const from = { ...scene.cur };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ctrl = { x: (from.x + to.x) / 2 + dy * 0.12, y: (from.y + to.y) / 2 - dx * 0.12 };
  // Time-based: each mouse.move is a round trip to a busy page (3D hero, blur), so a
  // fixed step count would stretch the glide. Sample the curve by wall clock instead.
  const start = Date.now();
  for (;;) {
    const u = Math.min(1, (Date.now() - start) / ms);
    const t = easeInOut(u);
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * ctrl.x + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * ctrl.y + t * t * to.y;
    await withTimeout(page.mouse.move(x, y), 5000, "mouse.move");
    if (u >= 1) break;
    await wait(16);
  }
  scene.cur = { ...to };
}

/** Glide to an element and (by default) click it. `target` is a selector or a Locator. */
export async function glide(scene, target, { ms = 700, click = true, dx = 0, dy = 0, settle = 140 } = {}) {
  const { page } = scene;
  const loc = typeof target === "string" ? page.locator(target).first() : target.first();
  step(scene, `glide ${typeof target === "string" ? target : "locator"}${click ? " + click" : ""}`);
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
  const box = await withTimeout(loc.boundingBox(), 10000, "boundingBox");
  if (!box) throw new Error(`no bounding box for ${typeof target === "string" ? target : "locator"}`);
  await moveTo(scene, { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy }, ms);
  await wait(settle);
  if (click) {
    await withTimeout(page.mouse.down(), 10000, "mouse.down");
    await wait(70);
    await withTimeout(page.mouse.up(), 10000, "mouse.up");
  }
}

/** Human-ish typing into the focused element (click it first with glide). */
export async function type(scene, text, perChar = 45) {
  for (const ch of text) {
    await scene.page.keyboard.type(ch);
    await wait(jitter(perChar, 0.5));
  }
}

export async function smoothScroll(scene, selector, { block = "start", settle = 1400 } = {}) {
  await scene.page.evaluate(
    ({ selector, block }) => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block }),
    { selector, block },
  );
  await wait(settle);
}

export async function scrollBy(scene, y, settle = 900) {
  await scene.page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), y);
  await wait(settle);
}

export async function setToken(context, token) {
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("receptra.token", t);
      localStorage.setItem("receptra.theme", "light");
    } catch {}
  }, token);
}
