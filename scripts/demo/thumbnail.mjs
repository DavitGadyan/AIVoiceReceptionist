// Upwork portfolio thumbnail: the 3D receptionist from the live landing page, recomposed
// 4:3 (Upwork's portfolio card ratio) with every element inside the inner 80% — a 10%
// safe margin on all sides — so the card crop and rounded corners never clip anything.
//
//   DEMO_FRONTEND=http://localhost:3000 node thumbnail.mjs            → out/thumbnail-4x3.png (+ .jpg, + 16x9)
//   DEMO_FRONTEND=http://localhost:3000 node thumbnail.mjs --guides   → also writes *-guides.png with the safe box drawn
import { join } from "node:path";
import { chromium } from "playwright";
import { FRONT, OUT, wait } from "./helpers.mjs";

const GUIDES = process.argv.includes("--guides");
// CSS px viewports at DPR 2 → 2000×1500 and 1920×1080 output
const SIZES = {
  "4x3": { width: 1000, height: 750 },
  "16x9": { width: 960, height: 540 },
};
const MARGIN = 0.1;

const MARK =
  '<svg viewBox="0 0 48 32" style="height:1em;width:1.5em" fill="none"><path d="M2 18h6c2 0 3 4 5 4s3-10 5-10 3 14 5 14 3-20 5-20 3 24 5 24 3-26 5-26" stroke="#8f93d6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHIPS = ["Answers every call", "Books the job", "Texts you the summary"];

/** Hide the hero chrome, pin the head into the safe area, add logo / headline / chips. */
function css(ratio) {
  const wide = ratio === "16x9";
  return `
    nextjs-portal { display: none !important; }
    html, body { overflow: hidden !important; }
    main > section:first-of-type { height: 100vh !important; min-height: 0 !important; }
    main > section:first-of-type > header,
    main > section:first-of-type > h1,
    main > section:first-of-type > p,
    main > section:first-of-type > div.z-10 { display: none !important; }
    main > section:first-of-type > div[class*="mask-image"] {
      position: absolute !important; left: 50% !important;
      top: ${wide ? "27%" : "28%"} !important;
      width: ${wide ? "52%" : "72%"} !important;
      height: ${wide ? "60%" : "62%"} !important;
      max-width: none !important; margin: 0 !important; flex: none !important;
      transform: translateX(-50%) !important; opacity: 1 !important;
    }
    #__thumb { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; color: #fff; }
    #__thumb .safe {
      position: absolute; left: ${MARGIN * 100}%; top: ${MARGIN * 100}%; width: ${(1 - 2 * MARGIN) * 100}%; height: ${(1 - 2 * MARGIN) * 100}%;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center;
      ${GUIDES ? "outline: 2px dashed rgba(255,80,80,.9); outline-offset: -1px;" : ""}
    }
    #__thumb .logo {
      display: inline-flex; align-items: center; gap: .45em; font-family: var(--font-display); font-weight: 600;
      letter-spacing: -.02em; font-size: ${wide ? "4.6vh" : "3.9vh"}; color: rgba(255,255,255,.92);
    }
    #__thumb h1 {
      margin: ${wide ? ".3em" : ".45em"} 0 0; font-family: var(--font-display); font-weight: 500; letter-spacing: -.045em;
      font-size: ${wide ? "12.2vh" : "10.4vh"}; line-height: 1.02; max-width: 12ch; text-wrap: balance;
    }
    #__thumb h1 em { font-style: normal; background: var(--grad-chrome); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
    #__thumb .chips { display: flex; gap: ${wide ? "1.6vh" : "1.4vh"}; margin-top: auto; }
    #__thumb .chip {
      font-family: var(--font-body); font-weight: 600; letter-spacing: -.01em; font-size: ${wide ? "3vh" : "2.55vh"};
      color: rgba(255,255,255,.9); padding: .62em 1.15em; border-radius: 999px;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16);
      -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 10px 30px rgba(0,0,0,.35);
    }
    #__thumb .chip b { color: #c9ccff; font-weight: 700; margin-right: .35em; }
  `;
}

const HTML = `
  <div id="__thumb">
    <div class="safe">
      <div class="logo">${MARK}<span>Receptra</span></div>
      <h1>AI Receptionist that <em>never</em> misses</h1>
      <div class="chips">${CHIPS.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    </div>
  </div>`;

async function waitForHead(page) {
  // The wrapper gets an inline opacity only after hydration; wait for hydration, then the fade.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[class*="mask-image"]');
      return !!el && el.style.opacity !== "" && parseFloat(getComputedStyle(el).opacity) > 0.95;
    },
    { timeout: 45000 },
  );
}

/** Every composed element must sit inside the safe box; the head box too (its bottom is masked out anyway). */
async function checkSafe(page, { width, height }) {
  const rects = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { sel, x: r.x, y: r.y, r: r.right, b: r.bottom };
    });
    return [...pick("#__thumb .logo"), ...pick("#__thumb h1"), ...pick("#__thumb .chip"), ...pick('main > section:first-of-type > div[class*="mask-image"]')];
  });
  const box = { x: width * MARGIN, y: height * MARGIN, r: width * (1 - MARGIN), b: height * (1 - MARGIN) };
  const out = rects.filter((e) => e.x < box.x - 0.5 || e.y < box.y - 0.5 || e.r > box.r + 0.5 || e.b > box.b + 0.5);
  return { rects, out };
}

const browser = await chromium.launch({ headless: false, args: ["--window-position=0,0", "--hide-scrollbars"] });
let failed = false;
for (const [ratio, viewport] of Object.entries(SIZES)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await context.newPage();
  try {
    await page.goto(`${FRONT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await waitForHead(page);
    await page.addStyleTag({ content: css(ratio) });
    await page.evaluate((h) => document.body.insertAdjacentHTML("beforeend", h), HTML);
    await page.mouse.move(viewport.width / 2, viewport.height / 2); // head looks straight at the camera
    await wait(1800); // let the canvas resize + the head settle
    const { out, rects } = await checkSafe(page, viewport);
    if (out.length) {
      failed = true;
      console.error(`✗ ${ratio}: outside the 10% safe area:`, out);
    } else {
      console.log(`✓ ${ratio}: ${rects.length} elements inside the safe area (${viewport.width}×${viewport.height} css px)`);
    }
    const base = join(OUT, `thumbnail-${ratio}${GUIDES ? "-guides" : ""}`);
    await page.screenshot({ path: `${base}.png`, type: "png" });
    if (!GUIDES) await page.screenshot({ path: `${base}.jpg`, type: "jpeg", quality: 92 });
    console.log(`-> ${base}.png${GUIDES ? "" : " / .jpg"}`);
  } finally {
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
