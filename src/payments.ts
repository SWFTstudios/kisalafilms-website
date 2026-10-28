/**
 * Paying for a build online, through Stripe Checkout.
 *
 *   POST /api/jobs/:id/checkout                  { kind }       the rider pays
 *   POST /api/jobs/:id/checkout/confirm          { sessionId }  back from Stripe
 *   POST /api/admin/jobs/:id/payment-link        { kind }       studio emails a link
 *
 * The amount is never taken from the browser. It comes from the job's approved
 * quote: the deposit until one is paid, then whatever is left of the total.
 * Each checkout gets a pending `payments` row whose id travels in the session
 * metadata; whichever arrives first, the rider returning from Stripe (confirm)
 * or the webhook, marks that row paid, and the other finds nothing to do.
 *
 * STRIPE_API_BASE exists for the test suite, which points it at a local mock;
 * it is never set in production.
 */
import { currentViewer } from "./auth";
import { recordPayment } from "./admin";
import { sendEmail } from "./email";
import { id, json, now, readJson, siteUrl, text, type PortalEnv } from "./http";

export type PaymentKind = "deposit" | "balance";

type Job = { id: string; ref: string; customer_id: string; stage: string; bike_id: string | null };

const money = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 });

/** What the rider owes right now, from the approved quote. */
export async function amountDue(
  env: PortalEnv,
  jobId: string,
  kind: PaymentKind
): Promise<{ amountCents: number; quoteId: string } | { error: string }> {
  const quote = await env.DB.prepare(
    "SELECT id, total_cents, deposit_cents FROM quotes WHERE job_id = ? AND status = 'approved' ORDER BY approved_at DESC LIMIT 1"
  ).bind(jobId).first<{ id: string; total_cents: number; deposit_cents: number }>();
  if (!quote) return { error: "Approve your quote first." };

  const paid = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total, COALESCE(SUM(kind = 'deposit'), 0) AS deposits FROM payments WHERE job_id = ? AND status = 'paid'"
  ).bind(jobId).first<{ total: number; deposits: number }>();
  const paidTotal = paid?.total ?? 0;
  const remaining = Math.max(quote.total_cents - paidTotal, 0);

  if (kind === "deposit") {
    if (paid?.deposits) return { error: "The deposit is already paid." };
    if (!quote.deposit_cents) return { error: "This quote has no deposit." };
    return { amountCents: Math.min(quote.deposit_cents, remaining), quoteId: quote.id };
  }
  if (!remaining) return { error: "Nothing is left to pay." };
  return { amountCents: remaining, quoteId: quote.id };
}

async function stripe(env: PortalEnv, method: string, path: string, form?: URLSearchParams, idempotencyKey?: string) {
  const base = (env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: form ? form.toString() : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message || `Stripe answered ${res.status}`);
  return body;
}

/** A Checkout session for what is due, with a pending payment row behind it. */
export async function createCheckout(
  request: Request,
  env: PortalEnv,
  job: Job,
  kind: PaymentKind
): Promise<{ url: string; amountCents: number } | { error: string; status: number }> {
  if (!env.STRIPE_SECRET_KEY) return { error: "Online payment isn't set up yet.", status: 503 };
  const due = await amountDue(env, job.id, kind);
  if ("error" in due) return { error: due.error, status: 409 };

  const customer = await env.DB.prepare("SELECT email FROM customers WHERE id = ?").bind(job.customer_id).first<{ email: string }>();
  const bike = job.bike_id
    ? await env.DB.prepare("SELECT year, make, model FROM bikes WHERE id = ?").bind(job.bike_id).first<Record<string, string | null>>()
    : null;
  const bikeName = bike ? [bike.year, bike.make, bike.model].filter(Boolean).join(" ") : "";

  const paymentId = id("pay");
  const at = now();
  // An older checkout for the same thing that was never finished stops counting.
  await env.DB.batch([
    env.DB.prepare("UPDATE payments SET status = 'expired' WHERE job_id = ? AND kind = ? AND status = 'pending'").bind(job.id, kind),
    env.DB.prepare(
      "INSERT INTO payments (id, job_id, quote_id, kind, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
    ).bind(paymentId, job.id, due.quoteId, kind, due.amountCents, at),
  ]);

  const base = siteUrl(request, env);
  const label = kind === "deposit" ? "Deposit" : "Balance";
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(due.amountCents),
    "line_items[0][price_data][product_data][name]": `${label}: ${job.ref}${bikeName ? `, ${bikeName}` : ""}`,
    "line_items[0][price_data][product_data][description]": "K Films, 95 Christopher Columbus Dr, Jersey City",
    client_reference_id: paymentId,
    "metadata[payment_id]": paymentId,
    "metadata[job_id]": job.id,
    "metadata[kind]": kind,
    "payment_intent_data[metadata][payment_id]": paymentId,
    "payment_intent_data[metadata][job_id]": job.id,
    "payment_intent_data[description]": `K Films ${job.ref} ${kind}`,
    success_url: `${base}/portal?job=${job.id}&paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/portal?job=${job.id}&cancelled=1`,
  });
  if (customer?.email) form.set("customer_email", customer.email);

  try {
    const session = await stripe(env, "POST", "checkout/sessions", form, paymentId);
    await env.DB.prepare("UPDATE payments SET stripe_session_id = ? WHERE id = ?").bind(String(session.id), paymentId).run();
    return { url: String(session.url), amountCents: due.amountCents };
  } catch (err) {
    await env.DB.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").bind(paymentId).run();
    console.error("stripe checkout failed", String(err));
    return { error: "Couldn't start the payment. Please try again.", status: 502 };
  }
}

/**
 * Mark a completed Checkout session's payment paid, once. Used by the return
 * from Stripe and by the webhook; returns whether this call did the recording.
 */
export async function settleSession(
  request: Request,
  env: PortalEnv,
  session: { id?: unknown; payment_status?: unknown; payment_intent?: unknown; metadata?: unknown }
): Promise<boolean> {
  const meta = (session.metadata || {}) as Record<string, string>;
  if (!meta.payment_id || session.payment_status !== "paid") return false;
  const payment = await env.DB.prepare(
    "SELECT id, job_id, quote_id, kind, amount_cents, status, stripe_session_id FROM payments WHERE id = ?"
  ).bind(meta.payment_id).first<{ id: string; job_id: string; quote_id: string | null; kind: string; amount_cents: number; status: string; stripe_session_id: string | null }>();
  if (!payment || payment.status === "paid") return false;
  if (payment.stripe_session_id && payment.stripe_session_id !== session.id) return false;

  const job = await env.DB.prepare("SELECT id, ref, customer_id, stage, bike_id FROM jobs WHERE id = ?").bind(payment.job_id).first<Job>();
  if (!job) return false;
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : null;
  return recordPayment(request, env, job, {
    kind: payment.kind,
    amountCents: payment.amount_cents,
    quoteId: payment.quote_id,
    method: "card",
    paymentId: payment.id,
    paymentIntent: intent,
  });
}

/* ---- Handlers ---------------------------------------------------------- */

async function ownedJob(request: Request, env: PortalEnv, jobId: string, allowAdmin: boolean) {
  const viewer = await currentViewer(request, env);
  if (!viewer) return { error: json({ error: "Sign in first." }, 401) };
  const job = await env.DB.prepare("SELECT id, ref, customer_id, stage, bike_id FROM jobs WHERE id = ?").bind(jobId).first<Job>();
  const mine = job && job.customer_id === viewer.customer.id;
  if (!job || (!mine && !(allowAdmin && viewer.isAdmin))) return { error: json({ error: "Not found." }, 404) };
  return { job, viewer };
}

function kindFrom(value: unknown): PaymentKind | null {
  return value === "deposit" || value === "balance" ? value : null;
}

export async function handleCheckout(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const found = await ownedJob(request, env, jobId, false);
  if ("error" in found) return found.error!;
  const kind = kindFrom((await readJson(request))?.kind);
  if (!kind) return json({ error: "Choose deposit or balance." }, 400);
  const result = await createCheckout(request, env, found.job, kind);
  if ("error" in result) return json({ error: result.error }, result.status);
  return json({ ok: true, url: result.url, amountCents: result.amountCents });
}

export async function handleCheckoutConfirm(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const found = await ownedJob(request, env, jobId, true);
  if ("error" in found) return found.error!;
  if (!env.STRIPE_SECRET_KEY) return json({ error: "Online payment isn't set up." }, 503);
  const sessionId = text((await readJson(request))?.sessionId, 200);
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: "Unknown payment." }, 400);

  // Only sessions this job created can be confirmed against it.
  const row = await env.DB.prepare("SELECT status FROM payments WHERE job_id = ? AND stripe_session_id = ?")
    .bind(jobId, sessionId)
    .first<{ status: string }>();
  if (!row) return json({ error: "Unknown payment." }, 404);
  if (row.status === "paid") return json({ ok: true, status: "paid" });

  try {
    const session = await stripe(env, "GET", `checkout/sessions/${encodeURIComponent(sessionId)}`);
    await settleSession(request, env, session);
    return json({ ok: true, status: session.payment_status === "paid" ? "paid" : "pending" });
  } catch (err) {
    console.error("stripe session lookup failed", String(err));
    return json({ ok: true, status: "pending" });
  }
}

export async function handlePaymentLink(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  if (!viewer.isAdmin) return json({ error: "Studio only." }, 403);
  const job = await env.DB.prepare("SELECT id, ref, customer_id, stage, bike_id FROM jobs WHERE id = ?").bind(jobId).first<Job>();
  if (!job) return json({ error: "Not found." }, 404);
  const kind = kindFrom((await readJson(request))?.kind);
  if (!kind) return json({ error: "Choose deposit or balance." }, 400);

  const result = await createCheckout(request, env, job, kind);
  if ("error" in result) return json({ error: result.error }, result.status);

  const customer = await env.DB.prepare("SELECT email FROM customers WHERE id = ?").bind(job.customer_id).first<{ email: string }>();
  if (customer) {
    await sendEmail(env, {
      to: customer.email,
      subject: `${job.ref}: ${kind === "deposit" ? "deposit" : "payment"} of ${money(result.amountCents)}`,
      heading: kind === "deposit" ? "Hold your studio date." : "Your bike is ready.",
      paragraphs: [
        kind === "deposit"
          ? `Your deposit is ${money(result.amountCents)}. Paying it books your studio date.`
          : `The balance on your build is ${money(result.amountCents)}.`,
        "Pay securely by card, Apple Pay or Google Pay. The link works for 24 hours; you can also pay any time from your portal.",
      ],
      button: { label: `Pay ${money(result.amountCents)}`, href: result.url },
    });
  }
  return json({ ok: true, url: result.url, amountCents: result.amountCents });
}
