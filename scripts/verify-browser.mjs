/**
 * The intake wizard at /book, end to end in a real browser.
 *
 * Fills every step the way a rider would: searches for a bike, picks the
 * work, uploads real photos (resized on the device and sent to R2 as they are
 * added), reloads half way to prove the draft survives, then submits and reads
 * the job back through the API. Runs at phone and desktop widths.
 *
 * Needs `npm run dev` in another terminal and a Chrome on the box:
 *
 *   npm run verify:browser
 *   CHROME_PATH=/path/to/chrome npm run verify:browser
 */
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/local/bin/google-chrome");
const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

for (const [width, height, label] of [[390, 844, "phone"], [1440, 900, "desktop"]]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: width < 700, hasTouch: width < 700 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("kf-intro-seen", "1"); } catch (e) {} });
  await page.goto(`${BASE}/book`, { waitUntil: "networkidle0" });
  const step = () => page.$eval(".book-step.is-current", (s) => s.dataset.step);
  const click = (sel) => page.$eval(sel, (el) => el.click());

  await click("[data-next]");
  check(`${label}: step 1 needs the bike`, (await step()) === "1");
  await page.type("#bike-search", "cbr600 f4i");
  await page.waitForSelector("#bike-results li[role=option]", { visible: true });
  await page.keyboard.press("Enter");
  await page.select("#bike-year", "2005");
  check(`${label}: search fills make and model`, (await page.$eval("#bike-model", (e) => e.value)) === "CBR600F4i");
  await click("[data-next]");

  await click('input[name=service][value=fullWrap]');
  await click('input[name=finish][value=satin]');
  check(`${label}: ballpark shown`, /^\$[\d,]+–\$[\d,]+$/.test(await page.$eval("[data-estimate-figure]", (e) => e.textContent)));
  await click("[data-next]");

  const input = await page.$('input[type=file][name=photos]');
  await input.uploadFile(`${PUBLIC}/images/refs/ref-01-front-3q.jpg`, `${PUBLIC}/images/refs/ref-02-left-profile.jpg`);
  await page.waitForFunction(() => document.querySelectorAll(".thumb").length === 2 && !document.querySelector(".thumb.is-uploading"), { timeout: 30000 });
  check(`${label}: photos uploaded`, (await page.$$(".thumb.is-failed")).length === 0);

  await page.reload({ waitUntil: "networkidle0" });
  check(`${label}: draft and photos survive a reload`, (await step()) === "3" && (await page.$$(".thumb")).length === 2);
  await click("[data-next]");

  await click('input[name=handoff][value=pickup]');
  await click("[data-next]");
  check(`${label}: pickup asks for a ZIP`, (await step()) === "4");
  await page.type("#pickup-zip", "11211");
  await click("[data-next]");

  const email = `verify.${label}.${Date.now()}@example.com`;
  await page.type("#name", "Verify Rider");
  await page.type("#email", email);
  await click("[data-submit]");
  await page.waitForSelector("[data-done]:not([hidden])", { timeout: 20000 });
  check(`${label}: confirmation shows a build number`, /^KF-\d+$/.test(await page.$eval("[data-done-ref]", (e) => e.textContent)));
  check(`${label}: draft cleared after sending`, (await page.evaluate(() => localStorage.getItem("kf-build-draft"))) === null);
  check(`${label}: nothing spills sideways`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);

  const link = await page.$eval("[data-done-dev-link]", (a) => a.href).catch(() => null);
  if (link) {
    await page.goto(link, { waitUntil: "networkidle0" });
    const job = await page.evaluate(async () => {
      const { jobs } = await (await fetch("/api/jobs")).json();
      return (await (await fetch(`/api/jobs/${jobs[0].id}`)).json());
    });
    check(`${label}: job stored with bike, photos and pickup`,
      job.bike.label === "2005 Honda CBR600F4i" && job.photos.length === 2 && job.job.pickupZip === "11211" && job.job.finish === "satin");
  } else {
    check(`${label}: sign-in link returned (local only)`, false, "no dev link; is this localhost?");
  }
  check(`${label}: no script errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nThe booking flow works end to end");
process.exit(failures ? 1 : 0);
