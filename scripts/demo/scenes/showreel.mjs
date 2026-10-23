// ~80 s product showreel: landing → login → dashboard with a live simulated call →
// call detail + transcript → text-back → PDF-to-config.
import { join } from "node:path";
import { simulateBookingCall } from "../api.mjs";
import { ROOT, cap, glide, go, mark, moveTo, scrollBy, smoothScroll, type, wait } from "../helpers.mjs";

export const needsLogin = false; // logs in through the UI

export default async function showreel(scene, { token }) {
  const { page } = scene;

  // 1. Landing — wait for the 3D portrait to fade in before the first shot
  await go(scene, "/", { settle: 1200 });
  // The wrapper gets an inline opacity only after hydration; wait for hydration, then for the fade.
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[class*="mask-image"]');
        return !!el && el.style.opacity !== "" && parseFloat(getComputedStyle(el).opacity) > 0.95;
      },
      { timeout: 40000 },
    )
    .catch(() => {});
  await wait(1200);
  await cap(scene, "Answers every call. Books the job. Texts you the summary.");
  await moveTo(scene, { x: 1180, y: 520 }, 1600);
  await moveTo(scene, { x: 780, y: 560 }, 1800);
  await wait(600);
  await cap(scene, "");
  await smoothScroll(scene, "#how", { settle: 1500 });
  await glide(scene, "#how button >> nth=1", { click: false, ms: 900 });
  await glide(scene, "#how button >> nth=4", { click: false, ms: 1100 });
  await smoothScroll(scene, "#industries", { settle: 1700 });
  await cap(scene, "One receptionist, pre-configured for your trade.", 1800);
  await cap(scene, "");

  // 2. Login
  await go(scene, "/login", { settle: 1100 });
  await cap(scene, "One login per business. Seven demo tenants included.");
  const pw = page.locator('input[type="password"]');
  await pw.fill(""); // the demo form prefills the password; retype it on camera
  await glide(scene, pw);
  await type(scene, "demo1234", 70);
  await wait(400);
  await glide(scene, 'button:has-text("Sign in")');
  await page.waitForURL(/\/app(\?|$)/, { timeout: 20000 });
  await cap(scene, "");
  await wait(1600);

  // 3. Dashboard with a live call driven through the simulator API
  await cap(scene, "A caller rings in… the receptionist answers on its own.");
  await moveTo(scene, { x: 1500, y: 160 }, 900);
  const sim = simulateBookingCall(token, { cadenceMs: 2600 });
  await page.locator("text=/live call/").first().waitFor({ timeout: 20000 });
  mark(scene, "cover");
  await wait(1200);
  await cap(scene, "Checks availability, offers three slots, takes the name…");
  const callId = await sim;
  await cap(scene, "Booked, summarised, KPIs updated. No human involved.");
  const row = page.locator(`a[href="/app/calls?id=${callId}"]`).first();
  await row.waitFor({ timeout: 20000 });
  await wait(1400);
  await glide(scene, row, { ms: 1100 });
  await page.waitForURL(/\/app\/calls\?id=/, { timeout: 20000 });
  await cap(scene, "");
  await wait(1400);

  // 4. Call detail
  await cap(scene, "Every tool call is logged. Full transcript, extracted fields.");
  await glide(scene, 'text="Actions taken"', { click: false, ms: 900 });
  await wait(1200);
  await glide(scene, 'button:has-text("Transcript")');
  await wait(1500);
  await scrollBy(scene, 420, 1100);
  await cap(scene, "");

  // 5. Text the caller back
  await cap(scene, "Text the caller back. SMS is simulated here — no Twilio keys in the demo.");
  const composer = page.locator('[placeholder^="Text "]').first();
  await composer.scrollIntoViewIfNeeded();
  await glide(scene, composer);
  await type(scene, "Hi James, Ava here from Brightline. The engineer will text when he's 20 minutes away.", 38);
  await wait(300);
  await glide(scene, 'button[aria-label="Send text"]');
  await page.locator("text=Simulated").first().waitFor({ timeout: 15000 });
  await wait(1800);
  await cap(scene, "");

  // 6. PDF → configuration
  await go(scene, "/app/knowledge", { settle: 1300 });
  await cap(scene, "Drop a price list PDF. It proposes services, FAQs and policies.");
  await moveTo(scene, { x: 640, y: 420 }, 900);
  await page.setInputFiles('input[type="file"]', join(ROOT, "assets", "brightline-prices.pdf"));
  await page.locator('input[type="checkbox"]').first().waitFor({ timeout: 30000 });
  await wait(900);
  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(n, 3); i++) await glide(scene, boxes.nth(i), { click: false, ms: 600, dx: 220 });
  await cap(scene, "You approve each change. Nothing is overwritten silently.");
  await glide(scene, 'button:has-text("Apply")');
  await page.locator("text=/Applied/").first().waitFor({ timeout: 20000 });
  await wait(1200);
  await glide(scene, 'a:has-text("Review in Settings")');
  await page.waitForURL(/\/app\/settings/, { timeout: 20000 });
  await wait(1000);
  await glide(scene, 'button:has-text("Services & prices")');
  await cap(scene, "The next call already quotes the new prices.");
  await wait(2600);
  await cap(scene, "");
  await wait(700);
}
