// ~25 s: upload a price list, review the proposals, apply, then search the knowledge.
import { join } from "node:path";
import { clearKnowledge } from "../api.mjs";
import { ROOT, cap, glide, go, mark, moveTo, type, wait } from "../helpers.mjs";

export const needsLogin = true;

export default async function pdfConfig(scene, { token }) {
  const { page } = scene;
  await clearKnowledge(token); // start from an empty library so the upload is the first card
  await go(scene, "/app/knowledge", { settle: 1400 });
  await cap(scene, "Onboarding a new business: upload the documents you already have.");
  await moveTo(scene, { x: 640, y: 420 }, 900);
  await page.setInputFiles('input[type="file"]', join(ROOT, "assets", "brightline-prices.pdf"));
  await page.locator('input[type="checkbox"]').first().waitFor({ timeout: 30000 });
  await wait(1000);
  mark(scene, "cover");
  await cap(scene, "Services with prices, FAQs and policies, proposed field by field.");
  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(n, 3); i++) await glide(scene, boxes.nth(i), { click: false, ms: 650, dx: 220 });
  if (n > 2) {
    await cap(scene, "Don't want one? Untick it.");
    await glide(scene, boxes.nth(n - 1));
    await wait(900);
  }
  await glide(scene, 'button:has-text("Apply")');
  await page.locator("text=/Applied/").first().waitFor({ timeout: 20000 });
  await cap(scene, "Saved as a new settings version. The next call uses it.");
  await wait(2000);

  await cap(scene, "The document is searchable on calls, too.");
  const q = page.locator('[aria-label="Search question"]');
  await q.scrollIntoViewIfNeeded();
  await glide(scene, q);
  await type(scene, "Do you work weekends?", 45);
  await glide(scene, 'button[aria-label="Search"]');
  await page.locator("text=/Saturday/").first().waitFor({ timeout: 15000 });
  await wait(2400);
  await cap(scene, "");
  await wait(600);
}
