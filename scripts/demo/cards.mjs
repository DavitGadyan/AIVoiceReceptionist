// Title and end cards, rendered in the real app (dark aurora + the site's fonts)
// and screenshotted at 1920x1080. ffmpeg here has no drawtext, so text is drawn
// by the browser.
import { chromium } from "playwright";
import { join } from "node:path";
import { FRONT, OUT, wait } from "./helpers.mjs";

const MARK =
  '<svg viewBox="0 0 48 32" width="72" height="48" fill="none"><path d="M2 18h6c2 0 3 4 5 4s3-10 5-10 3 14 5 14 3-20 5-20 3 24 5 24 3-26 5-26" stroke="#8f93d6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const CARDS = {
  "title-showreel": { kicker: "Receptra", title: "The AI receptionist that never misses a call", sub: "Answers · books · triages · texts you the summary" },
  "title-voice-demo": { kicker: "Receptra · Live call", title: "Same brain as the phone line", sub: "Book a job in three turns — no human on the line" },
  "title-pdf-config": { kicker: "Receptra · Onboarding", title: "A price list PDF becomes the receptionist's config", sub: "Proposed changes, approved field by field" },
  "title-activity": { kicker: "Receptra · Activity", title: "Every call, transcript and text-back in one view", sub: "Triage, resolve, follow up" },
  end: { kicker: "Receptra", title: "Multi-tenant AI voice receptionist", sub: "FastAPI · Next.js · Vapi · Twilio · OpenAI — built by David Gadyan" },
};

function html({ kicker, title, sub }) {
  return `
  <div id="__card" style="position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;
       background:radial-gradient(80% 60% at 50% 40%, rgba(91,91,240,.28), transparent 70%), rgba(6,6,9,.78);
       -webkit-backdrop-filter:blur(30px);backdrop-filter:blur(30px);color:#fff;text-align:center;
       font-family:var(--font-display,'Sora',system-ui,sans-serif);">
    <div style="max-width:1280px;padding:0 80px;display:flex;flex-direction:column;align-items:center;gap:28px">
      <div style="display:flex;align-items:center;gap:16px;font-size:30px;font-weight:600;letter-spacing:-.01em;color:rgba(255,255,255,.85)">${MARK}<span>${kicker}</span></div>
      <h1 style="margin:0;font-size:84px;line-height:1.04;font-weight:500;letter-spacing:-.04em;text-wrap:balance">${title}</h1>
      <p style="margin:0;font-family:var(--font-body,'Manrope',system-ui,sans-serif);font-size:30px;color:rgba(255,255,255,.62);letter-spacing:-.01em">${sub}</p>
    </div>
  </div>`;
}

export async function renderCards(names = Object.keys(CARDS)) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${FRONT}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await wait(1500);
  for (const name of names) {
    await page.evaluate((h) => {
      document.getElementById("__card")?.remove();
      document.body.insertAdjacentHTML("beforeend", h);
    }, html(CARDS[name]));
    await wait(350);
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`-> ${file}`);
  }
  await browser.close();
}

if (process.argv[1] && process.argv[1].endsWith("cards.mjs")) {
  await renderCards();
}
