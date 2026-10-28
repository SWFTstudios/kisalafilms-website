/**
 * End-to-end check of portal payments against a mock Stripe.
 *
 * Starts a fake Stripe API on :12111 and drives a Worker that points at it.
 * Run that Worker as its own instance with throwaway state, so nothing here
 * touches the dev database or a real Stripe account:
 *
 *   npx wrangler d1 migrations apply kisalafilms --local --persist-to .wrangler/pay-test
 *   npx wrangler dev --port 8790 --persist-to .wrangler/pay-test \
 *     --var STRIPE_SECRET_KEY:sk_test_mock --var STRIPE_API_BASE:http://127.0.0.1:12111 \
 *     --var STRIPE_WEBHOOK_SECRET:whsec_test_local
 *   node scripts/test-payments.mjs http://localhost:8790
 */
import http from "node:http";
import crypto from "node:crypto";

const BASE = (process.argv[2] || "http://localhost:8790").replace(/\/$/, "");
const WEBHOOK_SECRET = "whsec_test_local";
const ADMIN = process.env.ADMIN_EMAIL || "elombe@swftstudios.com";
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("Refusing to run against a non-local server.");
  process.exit(2);
}

/* ---- Mock Stripe --------------------------------------------------------- */
const sessions = new Map();
const byIdempotency = new Map();
const MOCK = "http://127.0.0.1:12111";
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, MOCK);
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      if (req.headers.authorization !== "Bearer sk_test_mock") return send(401, { error: { message: "bad key" } });
      const key = req.headers["idempotency-key"];
      if (key && byIdempotency.has(key)) return send(200, byIdempotency.get(key));
      const form = new URLSearchParams(raw);
      const metadata = {};
      for (const [k, v] of form) { const m = k.match(/^metadata\[(.+)\]$/); if (m) metadata[m[1]] = v; }
      const id = `cs_test_${crypto.randomBytes(8).toString("hex")}`;
      const session = {
        id, object: "checkout.session", url: `${MOCK}/pay/${id}`, payment_status: "unpaid", payment_intent: null, metadata,
        amount_total: Number(form.get("line_items[0][price_data][unit_amount]")),
        name: form.get("line_items[0][price_data][product_data][name]"),
        customer_email: form.get("customer_email"),
        success_url: form.get("success_url"), cancel_url: form.get("cancel_url"),
      };
      sessions.set(id, session);
      if (key) byIdempotency.set(key, session);
      return send(200, session);
    }
    const get = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
    if (req.method === "GET" && get) {
      const s = sessions.get(get[1]);
      return s ? send(200, s) : send(404, { error: { message: "No such session" } });
    }
    const pay = url.pathname.match(/^\/pay\/(.+)$/);
    if (pay) {
      // The hosted checkout page: pay (or cancel) and send the browser back.
      const s = sessions.get(pay[1]);
      if (!s) return send(404, {});
      if (url.searchParams.has("cancel")) { res.writeHead(303, { Location: s.cancel_url }); return res.end(); }
      s.payment_status = "paid";
      s.payment_intent = `pi_test_${crypto.randomBytes(6).toString("hex")}`;
      res.writeHead(303, { Location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) });
      return res.end();
    }
    send(404, {});
  });
});
await new Promise((r) => server.listen(12111, "127.0.0.1", r));

/* ---- Helpers ------------------------------------------------------------ */
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};
const call = async (method, path, { body, cookie, headers = {}, raw } = {}) => {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
};
const cookieOf = (h) => (h.get("set-cookie") || "").match(/kf_session=[^;]+/)?.[0];
const signIn = async (address) => {
  const r = await call("POST", "/api/auth/request", { body: { email: address } });
  const c = await call("POST", "/api/auth/code", { body: { email: address, code: r.data.devCode } });
  return cookieOf(c.headers);
};
const webhook = (session, secret = WEBHOOK_SECRET) => {
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, type: "checkout.session.completed", data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return call("POST", "/api/webhooks/stripe", { raw: payload, headers: { "Stripe-Signature": `t=${t},v1=${sig}`, "Content-Type": "application/json" } });
};
const visit = async (url) => (await fetch(url, { redirect: "manual" })).headers.get("location");

/* ---- Set up: a job with an approved quote ------------------------------- */
const stamp = Date.now();
const riderA = `pay.a.${stamp}@example.com`;
const riderB = `pay.b.${stamp}@example.com`;
const job = async (address) => (await call("POST", "/api/jobs", { body: {
  name: "Pay Rider", email: address, bike: { year: "2019", make: "Ducati", model: "Panigale V4" }, service: "fullWrap", handoff: "drop-off" } })).data;
const created = await job(riderA);
await job(riderB);
const jobId = created.jobId;
const cookieA = await signIn(riderA);
const cookieB = await signIn(riderB);
const cookieAdmin = await signIn(ADMIN);

let r = await call("GET", `/api/jobs/${jobId}`, { cookie: cookieA });
check("pay button is offered when Stripe is set up", r.data?.canPay === true);
r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "deposit" } });
check("no checkout before a quote is approved", r.status === 409, JSON.stringify(r.data));

r = await call("POST", `/api/admin/jobs/${jobId}/quotes`, { cookie: cookieAdmin, body: {
  items: [{ label: "Colour change", quantity: 1, unitCents: 200000 }, { label: "Film", quantity: 1, unitCents: 17000 }], depositCents: 50000, send: true } });
await call("POST", `/api/jobs/${jobId}/quotes/${r.data.quoteId}/approve`, { cookie: cookieA });

/* ---- Deposit, paid and confirmed on return ------------------------------ */
r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "nonsense" } });
check("unknown payment kind refused", r.status === 400);
r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieB, body: { kind: "deposit" } });
check("another customer can't pay this job", r.status === 404);
r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "deposit", amountCents: 1 } });
const first = r.data;
const firstSession = sessions.get(first.url.split("/pay/")[1]);
check("deposit checkout created", r.status === 200 && first.amountCents === 50000 && firstSession?.amount_total === 50000);
check("amount comes from the quote, not the browser", firstSession?.amount_total === 50000);
check("checkout names the build and the rider", /KF-\d+, 2019 Ducati Panigale V4/.test(firstSession?.name || "") && firstSession?.customer_email === riderA);

r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "deposit" } });
const second = r.data;
const location = await visit(second.url);
const sessionId = new URL(location, BASE).searchParams.get("paid");
check("Stripe sends the rider back to their job", location.startsWith(`${BASE}/portal?job=${jobId}&paid=cs_test_`), location);
r = await call("POST", `/api/jobs/${jobId}/checkout/confirm`, { cookie: cookieA, body: { sessionId } });
check("return confirms the payment", r.data?.status === "paid", JSON.stringify(r.data));
r = await call("GET", `/api/jobs/${jobId}`, { cookie: cookieA });
const paidDeposits = r.data.payments.filter((p) => p.kind === "deposit" && p.status === "paid");
check("deposit recorded once and the job is booked", paidDeposits.length === 1 && r.data.job.stage === "booked");
check("the abandoned first checkout no longer counts", r.data.payments.some((p) => p.status === "expired"));

r = await call("POST", `/api/jobs/${jobId}/checkout/confirm`, { cookie: cookieA, body: { sessionId } });
r = await webhook(sessions.get(sessionId));
check("webhook for an already-confirmed session is accepted", r.status === 200);
r = await call("GET", `/api/jobs/${jobId}`, { cookie: cookieA });
check("confirm + webhook still record it once", r.data.payments.filter((p) => p.kind === "deposit" && p.status === "paid").length === 1);
check("one 'deposit received' entry on the timeline", r.data.events.filter((e) => /Deposit received/.test(e.note || "")).length === 1);

r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "deposit" } });
check("a second deposit is refused", r.status === 409);
r = await call("POST", `/api/jobs/${jobId}/checkout/confirm`, { cookie: cookieA, body: { sessionId: firstSession.id } });
check("an unpaid session confirms as pending", r.data?.status === "pending");
r = await call("POST", `/api/jobs/${jobId}/checkout/confirm`, { cookie: cookieA, body: { sessionId: "cs_test_notours" } });
check("a session from elsewhere is refused", r.status === 404);

/* ---- Balance, by emailed link, settled by the webhook alone ------------- */
r = await call("POST", `/api/admin/jobs/${jobId}/payment-link`, { cookie: cookieA, body: { kind: "balance" } });
check("customers can't send payment links", r.status === 403);
r = await call("POST", `/api/admin/jobs/${jobId}/payment-link`, { cookie: cookieAdmin, body: { kind: "balance" } });
check("studio emails a balance link for what's left", r.status === 200 && r.data.amountCents === 167000, JSON.stringify(r.data));
const balanceSession = sessions.get(r.data.url.split("/pay/")[1]);
await visit(r.data.url);
r = await webhook(sessions.get(balanceSession.id), "whsec_wrong");
check("webhook with a bad signature is rejected", r.status === 400);
r = await webhook(sessions.get(balanceSession.id));
check("signed webhook settles the balance", r.status === 200);
r = await call("GET", `/api/jobs/${jobId}`, { cookie: cookieA });
const total = r.data.payments.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_cents, 0);
check("paid in full", total === 217000, `paid ${total}`);
check("card payment keeps its Stripe reference", r.data.payments.some((p) => p.kind === "balance" && p.status === "paid"));
r = await call("POST", `/api/jobs/${jobId}/checkout`, { cookie: cookieA, body: { kind: "balance" } });
check("nothing left to pay", r.status === 409);

/* ---- Cancelled checkout ------------------------------------------------- */
const other = await job(riderA);
r = await call("POST", `/api/admin/jobs/${other.jobId}/quotes`, { cookie: cookieAdmin, body: { items: [{ label: "Tank", quantity: 1, unitCents: 60000 }], depositCents: 20000, send: true } });
await call("POST", `/api/jobs/${other.jobId}/quotes/${r.data.quoteId}/approve`, { cookie: cookieA });
r = await call("POST", `/api/jobs/${other.jobId}/checkout`, { cookie: cookieA, body: { kind: "deposit" } });
const back = await visit(`${r.data.url}?cancel=1`);
check("cancelling returns to the job", back === `${BASE}/portal?job=${other.jobId}&cancelled=1`, back);
r = await call("GET", `/api/jobs/${other.jobId}`, { cookie: cookieA });
check("nothing is recorded for a cancelled checkout", !r.data.payments.some((p) => p.status === "paid") && r.data.job.stage === "quoted");

server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll payment checks passed");
process.exit(failures ? 1 : 0);
