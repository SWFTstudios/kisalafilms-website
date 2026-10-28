/**
 * Jobs: a build from the intake form through to collection.
 *
 *   POST  /api/jobs                  create from the intake wizard (no sign-in)
 *   GET   /api/jobs                  the signed-in customer's jobs
 *   GET   /api/jobs/:id              one job with its timeline, photos,
 *                                    messages, quotes and payments
 *   PATCH /api/jobs/:id              notes, dates and links, until check-in
 *   POST  /api/jobs/:id/messages     a message to or from the studio
 *
 * Creating a job never signs the browser in. Anyone can type any email into a
 * form, so the only way into a job is the sign-in link emailed to the address
 * on it; the submit reply says to check the inbox.
 */
import { currentViewer, issueLogin, upsertCustomer, type Viewer } from "./auth";
import { sendEmail, studioInbox } from "./email";
import { email as cleanEmail, id, json, now, readJson, siteUrl, text, type PortalEnv } from "./http";
import { EDITABLE_STAGES, STAGES, stageLabel } from "./stages";
import { validDraft } from "./uploads";

/** The service keys of kisala-config.js, plus "unsure". */
const SERVICES: Record<string, string> = {
  fullWrap: "Colour change",
  ppf: "Paint protection",
  partialWrap: "Accents & partials",
  customPrint: "Custom livery",
  chromeDelete: "Chrome delete & trim",
  unsure: "Not sure yet",
};
const HANDOFFS = new Set(["drop-off", "pickup", "round-trip", "undecided"]);
const COVERAGE = new Set(["full", "partial", "panels", "unsure"]);

const CAP = { short: 120, medium: 400, long: 4000 };

type JobRow = {
  id: string;
  ref: string;
  customer_id: string;
  bike_id: string | null;
  stage: string;
  service: string | null;
  coverage: string | null;
  panels: string | null;
  finish: string | null;
  colour: string | null;
  film_handle: string | null;
  notes: string | null;
  inspiration: string | null;
  preferred_dates: string | null;
  handoff: string | null;
  pickup_zip: string | null;
  estimate_low: number | null;
  estimate_high: number | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

function bikeLabel(b: { year?: string | null; make?: string | null; model?: string | null }): string {
  return [b.year, b.make, b.model].filter(Boolean).join(" ") || "Your bike";
}

function panelsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => text(v, 40)).filter(Boolean).slice(0, 30);
}

function whole(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : null;
}

async function nextRef(env: PortalEnv): Promise<string> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs").first<{ n: number }>();
  return `KF-${1001 + (row?.n ?? 0)}`;
}

/* ---- Create ------------------------------------------------------------ */

export async function handleCreateJob(request: Request, env: PortalEnv): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Expected a JSON body." }, 400);

  const address = cleanEmail(body.email);
  const name = text(body.name, CAP.short);
  const phone = text(body.phone, 40);
  const bikeIn = (body.bike && typeof body.bike === "object" ? body.bike : {}) as Record<string, unknown>;
  const bike = {
    year: text(bikeIn.year, 8),
    make: text(bikeIn.make, CAP.short),
    model: text(bikeIn.model, CAP.short),
    colour: text(bikeIn.colour, CAP.short),
    mileage: text(bikeIn.mileage, 20),
    vin: text(bikeIn.vin, 20).toUpperCase(),
  };
  const service = text(body.service, 40);
  const draft = text(body.draft, 80);

  const problems: string[] = [];
  if (!address) problems.push("a valid email");
  if (!name) problems.push("your name");
  if (!bike.make || !bike.model) problems.push("your bike's make and model");
  if (!SERVICES[service]) problems.push("a service");
  if (problems.length) return json({ error: `Please add ${problems.join(", ")}.`, fields: problems }, 400);

  const coverage = text(body.coverage, 20);
  const handoff = text(body.handoff, 20);
  const estimate = (body.estimate && typeof body.estimate === "object" ? body.estimate : {}) as Record<string, unknown>;

  const customer = await upsertCustomer(env, { email: address, name, phone });
  const at = now();
  const bikeId = id("bk");
  const jobId = id("job");

  await env.DB.prepare(
    "INSERT INTO bikes (id, customer_id, year, make, model, colour, mileage, vin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(bikeId, customer.id, bike.year, bike.make, bike.model, bike.colour || null, bike.mileage || null, bike.vin || null, at)
    .run();

  // The ref is a count, so two submits in the same instant can collide on the
  // UNIQUE constraint; the second one simply takes the next number.
  let ref = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    ref = await nextRef(env);
    if (attempt) ref = `KF-${Number(ref.slice(3)) + attempt}`;
    try {
      await env.DB.prepare(
        `INSERT INTO jobs (id, ref, customer_id, bike_id, stage, service, coverage, panels, finish, colour, film_handle,
           notes, inspiration, preferred_dates, handoff, pickup_zip, estimate_low, estimate_high, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'inquiry', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          jobId, ref, customer.id, bikeId, service,
          COVERAGE.has(coverage) ? coverage : null,
          JSON.stringify(panelsFrom(body.panels)),
          text(body.finish, 40) || null,
          text(body.colour, CAP.short) || null,
          text(body.filmHandle, CAP.short) || null,
          text(body.notes, CAP.long) || null,
          text(body.inspiration, CAP.long) || null,
          text(body.preferredDates, CAP.medium) || null,
          HANDOFFS.has(handoff) ? handoff : null,
          text(body.pickupZip, 10) || null,
          whole(estimate.low),
          whole(estimate.high),
          text(body.source, 60) || "intake",
          at, at
        )
        .run();
      break;
    } catch (err) {
      if (attempt === 3 || !String(err).includes("UNIQUE")) throw err;
    }
  }

  await env.DB.prepare(
    "INSERT INTO job_events (id, job_id, stage, note, author, visible, created_at) VALUES (?, ?, 'inquiry', ?, 'system', 1, ?)"
  )
    .bind(id("ev"), jobId, "Build received.", at)
    .run();

  let photoCount = 0;
  if (validDraft(draft)) {
    await env.DB.prepare("UPDATE photos SET job_id = ?, draft_id = NULL WHERE draft_id = ? AND job_id IS NULL")
      .bind(jobId, draft)
      .run();
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE job_id = ?").bind(jobId).first<{ n: number }>();
    photoCount = n?.n ?? 0;
  }

  const label = bikeLabel(bike);
  const issued = await issueLogin(request, env, customer, `/portal?job=${jobId}`, {
    subject: `Your build is in: ${label} (${ref})`,
    heading: "Your build is in.",
    paragraphs: [
      `Thanks${name ? `, ${name.split(" ")[0]}` : ""}. ${SERVICES[service]} for your ${label} is with the studio as ${ref}, with ${photoCount} photo${photoCount === 1 ? "" : "s"}.`,
      "Your written quote will appear in your client portal, along with every update, photo and payment from here to collection.",
    ],
  });

  const inbox = studioInbox(env);
  if (inbox) {
    await sendEmail(env, {
      to: inbox,
      replyTo: address,
      subject: `New build ${ref}: ${label}, ${SERVICES[service]}`,
      heading: `New build: ${ref}`,
      paragraphs: [
        `${name} <${address}>${phone ? `, ${phone}` : ""}`,
        `${label}${bike.colour ? `, ${bike.colour}` : ""}. ${SERVICES[service]}${coverage ? ` (${coverage})` : ""}.`,
        `Finish: ${text(body.finish, 40) || "not set"}. Colour: ${text(body.colour, CAP.short) || "not set"}.`,
        `Handoff: ${handoff || "not set"}${text(body.pickupZip, 10) ? `, ZIP ${text(body.pickupZip, 10)}` : ""}. Dates: ${text(body.preferredDates, CAP.medium) || "flexible"}.`,
        `Photos: ${photoCount}.`,
        `Notes: ${text(body.notes, CAP.long) || "none"}`,
      ],
      button: { label: "Open in admin", href: `${siteUrl(request, env)}/admin?job=${jobId}` },
    });
  }

  return json(
    { ok: true, jobId, ref, photoCount, ...(issued.devLink ? { devLink: issued.devLink, devCode: issued.devCode } : {}) },
    201
  );
}

/* ---- Read -------------------------------------------------------------- */

async function loadJob(env: PortalEnv, viewer: Viewer, jobId: string): Promise<JobRow | null> {
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<JobRow>();
  if (!job) return null;
  return viewer.isAdmin || job.customer_id === viewer.customer.id ? job : null;
}

export async function handleListJobs(request: Request, env: PortalEnv): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const { results } = await env.DB.prepare(
    `SELECT j.id, j.ref, j.stage, j.service, j.updated_at, j.created_at, b.year, b.make, b.model,
       (SELECT p.id FROM photos p WHERE p.job_id = j.id ORDER BY (p.kind = 'progress') DESC, p.created_at DESC LIMIT 1) AS cover_photo
     FROM jobs j LEFT JOIN bikes b ON b.id = j.bike_id
     WHERE j.customer_id = ? ORDER BY j.created_at DESC`
  )
    .bind(viewer.customer.id)
    .all<Record<string, string | null>>();
  return json({
    jobs: results.map((r) => ({
      id: r.id,
      ref: r.ref,
      stage: r.stage,
      stageLabel: stageLabel(r.stage || ""),
      service: SERVICES[r.service || ""] || r.service,
      bike: bikeLabel(r),
      coverPhoto: r.cover_photo ? `/api/photos/${r.cover_photo}` : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

export async function handleGetJob(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const job = await loadJob(env, viewer, jobId);
  if (!job) return json({ error: "Not found." }, 404);

  const admin = viewer.isAdmin;
  const [bike, events, photos, messages, quotes, payments] = await Promise.all([
    job.bike_id ? env.DB.prepare("SELECT year, make, model, colour, mileage, vin FROM bikes WHERE id = ?").bind(job.bike_id).first<Record<string, string | null>>() : null,
    env.DB.prepare(`SELECT id, stage, note, author, visible, created_at FROM job_events WHERE job_id = ? ${admin ? "" : "AND visible = 1"} ORDER BY created_at`).bind(jobId).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT id, event_id, kind, caption, created_at FROM photos WHERE job_id = ? ORDER BY created_at").bind(jobId).all<Record<string, string | null>>(),
    env.DB.prepare("SELECT id, author, body, created_at, read_at FROM messages WHERE job_id = ? ORDER BY created_at").bind(jobId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, status, total_cents, deposit_cents, notes, created_at, sent_at, approved_at FROM quotes WHERE job_id = ? ${admin ? "" : "AND status IN ('sent', 'approved')"} ORDER BY created_at DESC`).bind(jobId).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT id, quote_id, kind, amount_cents, status, created_at, paid_at FROM payments WHERE job_id = ? ORDER BY created_at").bind(jobId).all<Record<string, unknown>>(),
  ]);

  const quoteIds = quotes.results.map((q) => q.id as string);
  const items = quoteIds.length
    ? await env.DB.prepare(
        `SELECT quote_id, label, quantity, unit_cents FROM quote_items WHERE quote_id IN (${quoteIds.map(() => "?").join(",")}) ORDER BY position`
      )
        .bind(...quoteIds)
        .all<Record<string, unknown>>()
    : { results: [] };

  // Opening the job marks the other side's messages read.
  await env.DB.prepare("UPDATE messages SET read_at = ? WHERE job_id = ? AND author = ? AND read_at IS NULL")
    .bind(now(), jobId, admin ? "customer" : "studio")
    .run();

  return json({
    job: {
      id: job.id,
      ref: job.ref,
      stage: job.stage,
      stageLabel: stageLabel(job.stage),
      editable: EDITABLE_STAGES.has(job.stage),
      service: job.service,
      serviceLabel: SERVICES[job.service || ""] || job.service,
      coverage: job.coverage,
      panels: JSON.parse(job.panels || "[]"),
      finish: job.finish,
      colour: job.colour,
      filmHandle: job.film_handle,
      notes: job.notes,
      inspiration: job.inspiration,
      preferredDates: job.preferred_dates,
      handoff: job.handoff,
      pickupZip: job.pickup_zip,
      estimate: job.estimate_low != null ? { low: job.estimate_low, high: job.estimate_high } : null,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      ...(admin ? { internalNotes: job.internal_notes, customerId: job.customer_id } : {}),
    },
    bike: bike ? { ...bike, label: bikeLabel(bike) } : null,
    stages: STAGES.map((s) => ({ id: s.id, label: s.label })),
    events: events.results.map((e) => ({ ...e, stageLabel: stageLabel(String(e.stage)) })),
    photos: photos.results.map((p) => ({ ...p, url: `/api/photos/${p.id}` })),
    messages: messages.results,
    quotes: quotes.results.map((q) => ({ ...q, items: items.results.filter((i) => i.quote_id === q.id) })),
    payments: payments.results,
    viewer: { isAdmin: admin },
  });
}

/* ---- Update ------------------------------------------------------------ */

export async function handleUpdateJob(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const job = await loadJob(env, viewer, jobId);
  if (!job) return json({ error: "Not found." }, 404);
  if (!viewer.isAdmin && !EDITABLE_STAGES.has(job.stage)) {
    return json({ error: "Your bike is already in the studio. Send a message with any changes." }, 409);
  }
  const body = await readJson(request);
  if (!body) return json({ error: "Expected a JSON body." }, 400);

  const fields: [string, string | null][] = [];
  if ("notes" in body) fields.push(["notes", text(body.notes, CAP.long) || null]);
  if ("inspiration" in body) fields.push(["inspiration", text(body.inspiration, CAP.long) || null]);
  if ("preferredDates" in body) fields.push(["preferred_dates", text(body.preferredDates, CAP.medium) || null]);
  if (!fields.length) return json({ error: "Nothing to update." }, 400);

  await env.DB.prepare(`UPDATE jobs SET ${fields.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...fields.map(([, v]) => v), now(), jobId)
    .run();
  return json({ ok: true });
}

/* ---- Messages ---------------------------------------------------------- */

export async function handlePostMessage(request: Request, env: PortalEnv, jobId: string): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const job = await loadJob(env, viewer, jobId);
  if (!job) return json({ error: "Not found." }, 404);

  const body = await readJson(request);
  const message = text(body?.body, CAP.long);
  if (!message) return json({ error: "Write a message first." }, 400);

  const author = viewer.isAdmin && job.customer_id !== viewer.customer.id ? "studio" : "customer";
  const row = { id: id("msg"), author, body: message, created_at: now(), read_at: null };
  await env.DB.prepare("INSERT INTO messages (id, job_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(row.id, jobId, author, message, row.created_at)
    .run();
  await env.DB.prepare("UPDATE jobs SET updated_at = ? WHERE id = ?").bind(row.created_at, jobId).run();

  const base = siteUrl(request, env);
  if (author === "customer") {
    const inbox = studioInbox(env);
    if (inbox) {
      await sendEmail(env, {
        to: inbox,
        replyTo: viewer.customer.email,
        subject: `Message on ${job.ref}`,
        heading: `New message on ${job.ref}`,
        paragraphs: [`From ${viewer.customer.name || viewer.customer.email}:`, message],
        button: { label: "Reply in admin", href: `${base}/admin?job=${jobId}` },
      });
    }
  } else {
    const owner = await env.DB.prepare("SELECT email FROM customers WHERE id = ?").bind(job.customer_id).first<{ email: string }>();
    if (owner) {
      await sendEmail(env, {
        to: owner.email,
        subject: `A message from the studio about ${job.ref}`,
        heading: "A message from the studio",
        paragraphs: [message],
        button: { label: "Reply in your portal", href: `${base}/portal?job=${jobId}` },
      });
    }
  }

  return json({ ok: true, message: row }, 201);
}
