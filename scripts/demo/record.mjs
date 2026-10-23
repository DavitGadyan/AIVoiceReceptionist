// Records the demo videos: `node record.mjs all` or `node record.mjs showreel voice-demo`.
// Needs the production frontend on :3100 and the recording backend on :8000 (see README).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { login } from "./api.mjs";
import { API, FRONT, OUT, RAW, ROOT, createScene, log, prepare, setToken, wait, withTimeout } from "./helpers.mjs";

const SCENE_BUDGET_MS = 6 * 60 * 1000; // a scene that runs longer than this is hung

const ORDER = ["showreel", "activity", "voice-demo", "pdf-config"];
const want = process.argv.slice(2);
const names = want.length === 0 || want.includes("all") ? ORDER : ORDER.filter((n) => want.includes(n));

async function assertUp(url, label) {
  try {
    const r = await fetch(url);
    if (!r.ok && r.status !== 404) throw new Error(String(r.status));
  } catch (e) {
    console.error(`${label} is not reachable at ${url} (${e.message}). Start it first — see README "Demo videos".`);
    process.exit(1);
  }
}

await assertUp(`${FRONT}/login`, "frontend");
await assertUp(`${API}/health`, "backend");
if (!existsSync(join(ROOT, "assets", "brightline-prices.pdf"))) {
  console.error("Missing assets/brightline-prices.pdf — run: backend/.venv/bin/python scripts/demo/make_pdf.py");
  process.exit(1);
}

const token = await login();
const marksFile = join(OUT, "marks.json");
const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, "utf8")) : {};

const browser = await chromium.launch({ headless: false, args: ["--window-position=0,0", "--hide-scrollbars"] });

for (const name of names) {
  const mod = await import(`./scenes/${name}.mjs`);
  console.log(`● recording ${name}`);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
  });
  await prepare(context);
  if (mod.needsLogin) await setToken(context, token);
  const page = await context.newPage();
  const scene = createScene(page, name);
  let ok = true;
  try {
    await withTimeout(mod.default(scene, { token }), SCENE_BUDGET_MS, `scene ${name}`);
    await wait(400);
  } catch (e) {
    ok = false;
    log(`[${name}] FAILED ${e.stack || e.message}`);
    console.error(`✗ ${name} failed: ${e.message}`);
  }
  const video = page.video();
  await withTimeout(context.close(), 30000, "context.close").catch((e) => console.error(`  context.close: ${e.message}`));
  const src = await video.path();
  console.log(`  ${ok ? "✓" : "✗"} ${name} (${((Date.now() - scene.t0) / 1000).toFixed(0)}s)`);
  const dst = join(RAW, `${name}.webm`);
  renameSync(src, dst);
  marks[name] = scene.marks;
  writeFileSync(marksFile, JSON.stringify(marks, null, 2));
  console.log(`  -> ${dst}  marks=${JSON.stringify(scene.marks)}`);
}

await browser.close();
console.log(`done. run log: ${join(OUT, "run.log")}`);
