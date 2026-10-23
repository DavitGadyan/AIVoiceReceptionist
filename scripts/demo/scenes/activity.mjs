// ~25 s: triage queue → emergency transcript → resolve → text a booked caller back.
import { cap, glide, go, mark, scrollBy, type, wait } from "../helpers.mjs";

export const needsLogin = true;

export default async function activity(scene) {
  const { page } = scene;
  await go(scene, "/app/calls", { settle: 1600 });
  await cap(scene, "Every call in one place: outcome, transcript, recording, next step.");
  await glide(scene, '[role="tab"]:has-text("Attention")');
  await wait(1300);
  await cap(scene, "Emergencies and callbacks rise to the top.");
  const first = page.locator("main button:has(span.truncate)").first(); // CallRow
  await glide(scene, first, { ms: 900 });
  await wait(1500);
  mark(scene, "cover");
  await glide(scene, 'button:has-text("Transcript")');
  await wait(1200);
  await scrollBy(scene, 360, 1100);
  const resolve = page.locator('button:has-text("Mark resolved")');
  if (await resolve.isVisible().catch(() => false)) {
    await cap(scene, "Resolve it when the on-call engineer has taken it.");
    await glide(scene, resolve);
    await wait(1500);
  }
  await cap(scene, "");

  await glide(scene, '[role="tab"]:has-text("All calls")'); // leave the attention filter
  await wait(900);
  await glide(scene, '[placeholder="Search name, number, summary"]');
  await type(scene, "James", 60);
  await wait(1200);
  const james = page.locator("main button:has-text('James')").first();
  await glide(scene, james, { ms: 800 });
  await wait(1400);
  await cap(scene, "Text the caller back from the thread. Simulated here, Twilio in production.");
  const composer = page.locator('[placeholder^="Text "]').first();
  await composer.scrollIntoViewIfNeeded();
  await glide(scene, composer);
  await type(scene, "Thanks James, you're booked for tomorrow at 9. Reply here if anything changes.", 38);
  await glide(scene, 'button[aria-label="Send text"]');
  await page.locator("text=Simulated").first().waitFor({ timeout: 15000 });
  await wait(2200);
  await cap(scene, "");
  await wait(600);
}
