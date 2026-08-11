/**
 * Throwaway screenshot helper. Not part of the build or the test suite —
 * it exists so a person can look at a page instead of guessing from CSS.
 *
 *   node scripts/shots.mjs /project /vinyl-catalog
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const routes = process.argv.slice(2);
const width = Number(process.env.W || 1280);
const out = "/tmp/shots";
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

for (const route of routes) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:8787${route}`, { waitUntil: "networkidle0" });

  // A full-page capture does not scroll, so every .reveal below the fold is
  // still waiting on its observer and photographs as a blank band. Walk the
  // page down and back to let them fire.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 700));
  const name = (route === "/" ? "home" : route.replace(/\W+/g, "-").replace(/^-|-$/g, "")) + `-${width}`;
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL !== "0" });
  console.log(`${out}/${name}.png`, errors.length ? `— errors: ${errors.join(" | ")}` : "");
  await page.close();
}

await browser.close();
