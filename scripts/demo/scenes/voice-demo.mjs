// ~28 s: the text simulator runs the same brain, prompt and tools as the phone line.
import { BOOKING_TURNS } from "../api.mjs";
import { cap, glide, go, mark, type, wait } from "../helpers.mjs";

export const needsLogin = true;

export default async function voiceDemo(scene) {
  const { page } = scene;
  await go(scene, "/app/test", { settle: 1400 });
  await cap(scene, "Same brain, prompt and tools as the phone line. Vapi + Twilio in production.");
  await glide(scene, 'button:has-text("Start call")');
  await page.locator('[placeholder="Type what the caller says…"]').waitFor({ timeout: 15000 });
  await wait(1800);
  await cap(scene, "");

  const input = page.locator('[placeholder="Type what the caller says…"]');
  for (const [i, turn] of BOOKING_TURNS.entries()) {
    await glide(scene, input, { ms: 500 });
    await type(scene, turn, 42);
    await wait(250);
    await page.keyboard.press("Enter");
    if (i === 0) await cap(scene, "It checks the live calendar and offers three slots.");
    if (i === 1) await cap(scene, "Only confirms once the booking tool succeeds.");
    if (i === 2) mark(scene, "cover");
    await wait(2600);
  }
  await cap(scene, "");
  await wait(600);

  const endBtn = page.locator('button:has-text("End call")');
  if (await endBtn.isVisible().catch(() => false)) {
    await glide(scene, endBtn);
  }
  await page.locator("text=Call summary").first().waitFor({ timeout: 20000 });
  await cap(scene, "Outcome, summary and extracted fields, ready for the dashboard and your CRM.");
  await wait(1600);
  await glide(scene, 'a:has-text("Open in Activity")', { click: false, ms: 900 });
  await wait(2200);
  await cap(scene, "");
  await wait(600);
}
