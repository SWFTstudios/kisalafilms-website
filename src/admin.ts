/**
 * The studio admin API. Every route here is for ADMIN_EMAILS only.
 *
 *   GET   /api/admin/jobs                         the board: every job, newest activity first
 *   PATCH /api/admin/jobs/:id                     internal notes
 *   POST  /api/admin/jobs/:id/stage               move along the timeline, with a note
 *   POST  /api/admin/jobs/:id/photos?event=…      a progress photo, filed against an update
 *   POST  /api/admin/jobs/:id/quotes              write a quote, as a draft or sent
 *   POST  /api/admin/jobs/:id/payments            record a payment taken off-site
 *   POST  /api/admin/jobs/:id/publish             show (or hide) the job on /builds
 *
 * Reading one job is the shared GET /api/jobs/:id, which already returns the
 * studio-only fields to an admin, and messages are the shared endpoint too.
 *
 * Anything the customer should hear about (a stage change, a sent quote, a
 * payment) is logged as a visible job event and emailed to them; studio-only
 * history is logged with visible = 0.
 */
import { currentViewer, type Viewer } from "./auth";
import { sendEmail } from "./email";
import { id, json, now, readJson, siteUrl, text, type PortalEnv } from "./http";
import { SERVICES, bikeLabel } from "./portal";
import { STAGES, STAGE_IDS, stageLabel } from "./stages";
import { handleJobUpload } from "./uploads";

type Job = { id: string; ref: string; customer_id: string; stage: string; bike_id: string | null };

async function requireAdmin(request: Request, env: PortalEnv): Promise<Viewer | Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  if (!viewer.isAdmin) return json({ error: "Studio only." }, 403);
  return viewer;
}

async function loadJob(env: PortalEnv, jobId: string): Promise<Job | null> {
  return env.DB.prepare("SELECT id, ref, customer_id, stage, bike_id FROM jobs WHERE id = ?").bind(jobId).first<Job>();
}

const money = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 });

async function emailCustomer(
  request: Request,
  env: PortalEnv,
  job: Job,
  subject: string,
  heading: string,
  paragraphs: string[]
): Promise<void> {
  const customer = await env.DB.prepare("SELECT email, name FROM customers WHERE id = ?")
    .bind(job.customer_id)
    .first<{ email: string; name: string | null }>();
  if (!customer) return;
  await sendEmail(env, {
    to: customer.email,
    subject,
    heading,
    paragraphs: paragraphs.filter(Boolean),
    button: { label: "Open your portal", href: `${siteUrl(request, env)}/portal?job=${job.id}` },
  });
}

async function logEvent(env: PortalEnv, jobId: string, stage: string, note: string | null, author: string, visible: boolean): Promise<string> {
  const eventId = id("ev");
  const at = now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO job_events (id, job_id, stage, note, author, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(eventId, jobId, stage, note, author, visible ? 1 : 0, at),
    env.DB.prepare("UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ?").bind(stage, at, jobId),
  ]);
  return eventId;
}

/* ---- Board ------------------------------------------------------------- */

export async function handleAdminJobs(request: Request, env: PortalEnv): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { results } = await env.DB.prepare(
    `SELECT j.id, j.ref, j.stage, j.service, j.finish, j.colour, j.handoff, j.created_at, j.updated_at, j.published_at,
       j.estimate_low, j.estimate_high,
       c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
       b.year, b.make, b.model,
       (SELECT COUNT(*) FROM messages m WHERE m.job_id = j.id AND m.author = 'customer' AND m.read_at IS NULL) AS unread,
       (SELECT COUNT(*) FROM photos p WHERE p.job_id = j.id) AS photos,
       (SELECT p.id FROM photos p WHERE p.job_id = j.id ORDER BY (p.kind = 'progress') DESC, p.created_at DESC LIMIT 1) AS cover_photo,
       (SELECT q.status FROM quotes q WHERE q.job_id = j.id AND q.status != 'superseded' ORDER BY q.created_at DESC LIMIT 1) AS quote_status,
       (SELECT q.total_cents FROM quotes q WHERE q.job_id = j.id AND q.status != 'superseded' ORDER BY q.created_at DESC LIMIT 1) AS quote_total,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM payments pa WHERE pa.job_id = j.id AND pa.status = 'paid') AS paid_cents
     FROM jobs j
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN bikes b ON b.id = j.bike_id
     ORDER BY j.updated_at DESC
     LIMIT 500`
  ).all<Record<string, string | number | null>>();

  return json({
    stages: [...STAGES.map((s) => ({ id: s.id, label: s.label })), { id: "cancelled", label: "Cancelled" }],
    jobs: results.map((r) => ({
      id: r.id,
      ref: r.ref,
      stage: r.stage,
      stageLabel: stageLabel(String(r.stage)),
      service: SERVICES[String(r.service)] || r.service,
      finish: r.finish,
      colour: r.colour,
      handoff: r.handoff,
      bike: bikeLabel(r as { year?: string; make?: string; model?: string }),
      customer: { name: r.customer_name, email: r.customer_email, phone: r.customer_phone },
      unread: Number(r.unread),
      photos: Number(r.photos),
      coverPhoto: r.cover_photo ? `/api/photos/${r.cover_photo}` : null,
      quote: r.quote_status ? { status: r.quote_status, totalCents: Number(r.quote_total) } : null,
      paidCents: Number(r.paid_cents),
      estimate: r.estimate_low != null ? { low: r.estimate_low, high: r.estimate_high } : null,
      published: !!r.published_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

/* ---- Notes ------------------------------------------------------------- */

export async function handleAdminUpdate(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const job = await loadJob(env, jobId);
  if (!job) return json({ error: "Not found." }, 404);
  const body = await readJson(request);
  if (!body || !("internalNotes" in body)) return json({ error: "Nothing to update." }, 400);
  await env.DB.prepare("UPDATE jobs SET internal_notes = ? WHERE id = ?")
    .bind(text(body.internalNotes, 8000) || null, jobId)
    .run();
  return json({ ok: true });
}

/* ---- Stage ------------------------------------------------------------- */

export async function handleAdminStage(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const job = await loadJob(env, jobId);
  if (!job) return json({ error: "Not found." }, 404);

  const body = await readJson(request);
  const stage = text(body?.stage, 20) || job.stage;
  if (!STAGE_IDS.has(stage)) return json({ error: "Unknown stage." }, 400);
  const note = text(body?.note, 4000) || null;
  const visible = body?.visible !== false;
  const notify = visible && body?.notify !== false;
  if (stage === job.stage && !note) return json({ error: "Add a note, or choose a different stage." }, 400);

  const eventId = await logEvent(env, job.id, stage, note, "studio", visible);

  if (notify) {
    const info = STAGES.find((s) => s.id === stage);
    const changed = stage !== job.stage;
    await emailCustomer(
      request,
      env,
      job,
      changed ? `${job.ref}: ${stageLabel(stage)}` : `${job.ref}: an update from the studio`,
      changed ? stageLabel(stage) : "An update on your build",
      [changed && info ? info.customer : "", note || "", "Photos and the full timeline are in your portal."]
    );
  }
  return json({ ok: true, eventId }, 201);
}

/** A progress photo, filed against an update so it shows with that note. */
export async function handleAdminPhoto(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event") || undefined;
  if (eventId) {
    const ev = await env.DB.prepare("SELECT id FROM job_events WHERE id = ? AND job_id = ?").bind(eventId, jobId).first();
    if (!ev) return json({ error: "Unknown update." }, 400);
  }
  return handleJobUpload(request, env, jobId, {
    kind: "progress",
    eventId,
    caption: text(url.searchParams.get("caption"), 200) || undefined,
  });
}

/* ---- Quotes ------------------------------------------------------------ */

type Item = { label: string; quantity: number; unitCents: number };

function readItems(value: unknown): Item[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 40) return null;
  const items: Item[] = [];
  for (const raw of value) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const label = text(r.label, 200);
    const quantity = Math.round(Number(r.quantity ?? 1));
    const unitCents = Math.round(Number(r.unitCents));
    if (!label || !Number.isFinite(unitCents) || Math.abs(unitCents) > 10_000_000) return null;
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) return null;
    items.push({ label, quantity, unitCents });
  }
  return items;
}

export async function handleAdminQuote(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const job = await loadJob(env, jobId);
  if (!job) return json({ error: "Not found." }, 404);

  const body = await readJson(request);
  const items = readItems(body?.items);
  if (!items) return json({ error: "Add at least one line with a description and a price." }, 400);
  const total = items.reduce((n, i) => n + i.quantity * i.unitCents, 0);
  if (total <= 0) return json({ error: "The total has to be more than zero." }, 400);
  const deposit = Math.round(Number(body?.depositCents ?? 0));
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > total) {
    return json({ error: "The deposit has to be between zero and the total." }, 400);
  }
  const send = body?.send === true;
  const notes = text(body?.notes, 4000) || null;
  const at = now();
  const quoteId = id("q");

  const statements = [
    // One live quote at a time: a new one replaces any draft or earlier one.
    env.DB.prepare("UPDATE quotes SET status = 'superseded' WHERE job_id = ? AND status != 'superseded'").bind(jobId),
    env.DB.prepare(
      "INSERT INTO quotes (id, job_id, status, total_cents, deposit_cents, notes, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(quoteId, jobId, send ? "sent" : "draft", total, deposit, notes, at, send ? at : null),
    ...items.map((item, position) =>
      env.DB.prepare("INSERT INTO quote_items (id, quote_id, position, label, quantity, unit_cents) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id("qi"), quoteId, position, item.label, item.quantity, item.unitCents)
    ),
  ];
  await env.DB.batch(statements);

  if (send) {
    const stage = job.stage === "inquiry" ? "quoted" : job.stage;
    await logEvent(env, jobId, stage, `Quote sent: ${money(total)}${deposit ? `, ${money(deposit)} deposit to book` : ""}.`, "studio", true);
    await emailCustomer(request, env, job, `${job.ref}: your quote is ready`, "Your quote is ready.", [
      `Your written quote comes to ${money(total)}${deposit ? `, with a ${money(deposit)} deposit to hold your studio date` : ""}.`,
      "Review it line by line and approve it in your portal.",
    ]);
  }
  return json({ ok: true, quoteId, status: send ? "sent" : "draft", totalCents: total }, 201);
}

/* ---- Payments ---------------------------------------------------------- */

/**
 * Record a paid payment and move the job on: a deposit books it. Shared with
 * the Stripe webhook, which calls it with the checkout's own payment row.
 */
export async function recordPayment(
  request: Request,
  env: PortalEnv,
  job: Job,
  payment: { kind: string; amountCents: number; quoteId?: string | null; method?: string; paymentId?: string }
): Promise<void> {
  const at = now();
  if (payment.paymentId) {
    await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?").bind(at, payment.paymentId).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO payments (id, job_id, quote_id, kind, amount_cents, status, created_at, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)"
    )
      .bind(id("pay"), job.id, payment.quoteId || null, payment.kind, payment.amountCents, at, at)
      .run();
  }

  const books = payment.kind === "deposit" && (job.stage === "inquiry" || job.stage === "quoted");
  const stage = books ? "booked" : job.stage;
  const label = payment.kind === "deposit" ? "Deposit" : payment.kind === "balance" ? "Balance" : "Payment";
  await logEvent(env, job.id, stage, `${label} received: ${money(payment.amountCents)}${payment.method ? ` (${payment.method})` : ""}.`, "system", true);
  await emailCustomer(request, env, job, `${job.ref}: ${label.toLowerCase()} received`, `${label} received. Thank you.`, [
    `We've received ${money(payment.amountCents)}.`,
    books ? "Your studio date is held. You'll get an update when your bike is checked in." : "",
    "Your receipt is in your portal.",
  ]);
}

export async function handleAdminPayment(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const job = await loadJob(env, jobId);
  if (!job) return json({ error: "Not found." }, 404);
  const body = await readJson(request);
  const kind = text(body?.kind, 20);
  const amount = Math.round(Number(body?.amountCents));
  if (!["deposit", "balance", "other"].includes(kind)) return json({ error: "Choose deposit, balance or other." }, 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return json({ error: "Enter the amount received." }, 400);
  const quote = await env.DB.prepare(
    "SELECT id FROM quotes WHERE job_id = ? AND status IN ('sent', 'approved') ORDER BY created_at DESC LIMIT 1"
  ).bind(jobId).first<{ id: string }>();
  await recordPayment(request, env, job, {
    kind,
    amountCents: amount,
    quoteId: quote?.id ?? null,
    method: text(body?.method, 60) || "recorded by the studio",
  });
  return json({ ok: true }, 201);
}

/* ---- Publish to /builds ------------------------------------------------ */

export async function handleAdminPublish(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const job = await loadJob(env, jobId);
  if (!job) return json({ error: "Not found." }, 404);
  const body = await readJson(request);

  if (body?.publish === false) {
    await env.DB.prepare("UPDATE jobs SET published_at = NULL WHERE id = ?").bind(jobId).run();
    return json({ ok: true, published: false });
  }

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE job_id = ? AND kind = 'progress'")
    .bind(jobId)
    .first<{ n: number }>();
  if (!count?.n) return json({ error: "Add at least one studio photo before publishing." }, 400);

  const cover = text(body?.coverPhotoId, 80);
  const statements = [
    env.DB.prepare("UPDATE jobs SET published_at = COALESCE(published_at, ?), public_title = ?, public_summary = ? WHERE id = ?")
      .bind(now(), text(body?.title, 120) || null, text(body?.summary, 2000) || null, jobId),
  ];
  if (cover) {
    statements.push(env.DB.prepare("UPDATE photos SET is_cover = (id = ?) WHERE job_id = ?").bind(cover, jobId));
  }
  await env.DB.batch(statements);
  return json({ ok: true, published: true });
}

/* ---- Public: published builds ------------------------------------------ */

export async function handlePublicBuilds(_request: Request, env: PortalEnv): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT j.id, j.public_title, j.public_summary, j.service, j.finish, j.colour, j.published_at, b.year, b.make, b.model
     FROM jobs j LEFT JOIN bikes b ON b.id = j.bike_id
     WHERE j.published_at IS NOT NULL ORDER BY j.published_at DESC LIMIT 60`
  ).all<Record<string, string | null>>();
  const ids = results.map((r) => r.id as string);
  const photos = ids.length
    ? (await env.DB.prepare(
        `SELECT id, job_id, caption, is_cover FROM photos WHERE kind = 'progress' AND job_id IN (${ids.map(() => "?").join(",")})
         ORDER BY is_cover DESC, created_at`
      ).bind(...ids).all<Record<string, string | number | null>>()).results
    : [];
  return new Response(
    JSON.stringify({
      builds: results.map((r) => {
        const own = photos.filter((p) => p.job_id === r.id);
        return {
          id: r.id,
          title: r.public_title || bikeLabel(r),
          bike: bikeLabel(r),
          summary: r.public_summary,
          service: SERVICES[String(r.service)] || r.service,
          finish: r.finish,
          colour: r.colour,
          publishedAt: r.published_at,
          cover: own[0] ? `/api/photos/${own[0].id}` : null,
          photos: own.map((p) => ({ url: `/api/photos/${p.id}`, caption: p.caption })),
        };
      }),
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } }
  );
}
