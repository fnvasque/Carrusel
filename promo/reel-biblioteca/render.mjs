import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const dir = process.argv[2]; const times = process.argv.slice(3).map(Number);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(new URL("./reel.html", import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);
const list = times.length ? times : Array.from({ length: Math.round(duration * 30) }, (_, i) => i / 30);
let i = 0;
for (const t of list) {
  await page.evaluate((x) => window.render(x), t);
  await page.screenshot({ path: `${dir}/f${String(times.length ? Math.round(t * 100) : i).padStart(4, "0")}.png` });
  i++;
}
await browser.close();
