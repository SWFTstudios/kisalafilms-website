# Go-live checklist

The redesign lives on the `redesign` branch. `main` auto-deploys to https://kisalafilms-website.elombe.workers.dev, so **merging is going live**. Do steps 1–5 first, preview with step 6, then merge.

## 1. Cloudflare resources

```bash
npx wrangler r2 bucket create kisalafilms-photos
npx wrangler d1 migrations apply kisalafilms --remote
```

The deploy fails without the bucket, because `wrangler.jsonc` binds it. The migrations add the portal tables (0006) and publishing (0007); they don't touch existing tables.

## 2. Email

Customers can't sign in until mail sends: the link and code only go by email. Pick one:

- **Cloudflare Email Service:** the sending domain must be on Cloudflare.
  ```bash
  npx wrangler email sending enable <yourdomain.com>
  ```
  Then set `EMAIL_FROM` in `wrangler.jsonc`, e.g. `"K Films <studio@yourdomain.com>"`.
- **Resend:** for a domain hosted elsewhere. Verify the domain in Resend, set `EMAIL_FROM` to an address on it, then:
  ```bash
  npx wrangler secret put RESEND_API_KEY
  ```

Check `ADMIN_EMAILS` in `wrangler.jsonc`. It decides who can open `/admin`, and the first address gets every "new build" and "new message" alert.

## 3. Payments (Stripe)

1. Start in **test mode**:
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   ```
   Use the `sk_test_…` key here.
2. In Stripe → Developers → Webhooks, add `https://<site>/api/webhooks/stripe` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Then:
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
   Use the endpoint's `whsec_…` signing secret here.
3. Run one build through with Stripe's test card, `4242 4242 4242 4242`: quote it, approve it, pay the deposit and the balance. Check the portal, the admin and the Stripe dashboard all agree.
4. Swap in the live key and the live webhook secret.

## 4. Decide and fill in

- [ ] **Deposit rule.** The quote builder defaults to 25%, editable per quote (`deposit.percent` in `kisala-config.js`). Decide whether deposits are refundable, and say so in the FAQ.
- [ ] **Studio times** on the service pages: colour change 2–3 days, accents 1–2 days, chrome delete "usually 1 day". Confirm or correct them in `scripts/build-v4-pages.py`, then `npm run build`.
- [ ] **Build 001 wording.** The F4i is described as "the first bike through the studio".
- [ ] **Photos.** Every image is the same F4i shoot. More finished bikes make the biggest difference to the look. Publish real jobs from the admin as they finish.
- [ ] **Favicons** are still the earlier mark.
- [ ] **`REVIEW:` values** in `kisala-config.js`: founding slots remaining, standard prices, transport fees.

## 5. Things the redesign changed that touch other systems

- **Meta ads:** `/wrap-quote/` is untouched and still posts to FormSubmit. Point the ads at `/book` when ready; the old page can then be retired.
- **Old links:** retired pages 301 to their new homes (`RETIRED` in `src/index.ts`), so bookmarks and search results keep working.
- **Firebase:** login moved off Firebase. `firebase.json` and `firestore.rules` are no longer used by the site. Existing Firestore data is not migrated.
- **GA4:** conversions moved. Count `book_submit`, or page views of `/book-thanks`, instead of the old `wrap_studio_lead`.

## 6. Preview before merging

```bash
npm run build && npm test
npx wrangler versions upload
```

`versions upload` gives a preview URL on the live resources without sending traffic to it. On that URL:

- [ ] Submit a build from your phone with real photos.
- [ ] Open the emailed link. Sign in with the code on another device.
- [ ] In `/admin`: send a quote, post an update with a photo, move the stage.
- [ ] Approve the quote and pay the test deposit in `/portal`.
- [ ] Publish the job and check `/builds`.

Then merge `redesign` into `main`.

## 7. After launch

- Run `npm run audit` and `npm run verify:links` against the live URL (`BASE_URL=https://…`).
- When the site moves to its own domain, update `SITE` in `scripts/build-seo.py`, `siteUrl` in `kisala-config.js` and `SITE_URL` in `wrangler.jsonc`, then rebuild.
