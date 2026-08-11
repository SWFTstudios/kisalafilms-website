/**
 * POST /api/quote — record a quote request from /quote.
 *
 * This endpoint does not deliver the lead. Delivery is the browser's own
 * multipart POST to FormSubmit, which is the only path the photo attachments
 * survive: formsubmit.co answers every non-browser client with a Cloudflare
 * managed challenge (`cf-mitigated: challenge`), so a Worker fetch cannot
 * forward to it however the request is dressed up.
 *
 * What this does instead is give the garage its own copy of the lead, so the
 * inbox is not the only record of who asked for what. The browser calls it
 * fire-and-forget with keepalive as the native post navigates away, which has
 * two consequences worth stating plainly:
 *
 *   1. Nothing here can block a submission, so a failure costs a row and never
 *      a customer. That is why every failure below returns rather than throws.
 *   2. Nothing here can be trusted. The payload is whatever was posted, by
 *      anyone. Every field is length-capped and type-checked before it reaches
 *      the database, and the caps are the real ones — the matching limits in
 *      quote.js are a courtesy to the rider, not a control.
 */

import type { D1Database } from "./films";

export type QuoteEnv = {
  DB?: D1Database;
};

/** Field caps. Generous enough for a real answer, small enough to bound a row. */
const CAP = {
  short: 120,
  medium: 400,
  long: 4000,
};

const ITEM_TYPES = new Set(["Bike", "Helmet", "Both"]);
const CONTACT_METHODS = new Set(["Text", "Call", "Email"]);

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Control characters would only ever be noise in a lead, and stripping them
  // keeps anything downstream that renders this from having to care.
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function list(value: unknown, max: number): string {
  if (!Array.isArray(value)) return text(value, max);
  return value
    .map((entry) => text(entry, CAP.short))
    .filter(Boolean)
    .join(", ")
    .slice(0, max);
}

/**
 * A newline-joined list, capped on both axes.
 *
 * `list()` would flatten these onto one line, and a shortlist of six films each
 * carrying a URL is only readable one per line. Capping the number of lines as
 * well as the total length is what stops a posted array of ten thousand entries
 * from becoming a row.
 */
function lines(value: unknown, maxLines: number, max: number): string {
  const source = Array.isArray(value) ? value : String(value ?? "").split("\n");
  return source
    .slice(0, maxLines)
    .map((entry) => text(entry, CAP.medium))
    .filter(Boolean)
    .join("\n")
    .slice(0, max);
}

function count(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 999);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function requestId(): string {
  return `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type QuoteRecord = ReturnType<typeof normalise>;

function normalise(body: Record<string, unknown>) {
  const itemType = text(body.item_type, CAP.short);
  const contact = text(body.preferred_contact, CAP.short);

  return {
    id: requestId(),
    createdAt: new Date().toISOString(),
    itemType: ITEM_TYPES.has(itemType) ? itemType : "",
    services: list(body.services, CAP.medium),
    serviceOther: text(body.service_other, CAP.short),
    bikeMake: text(body.bike_make, CAP.short),
    bikeModel: text(body.bike_model, CAP.short),
    bikeYear: text(body.bike_year, 4),
    bikeStyle: text(body.bike_style, CAP.short),
    helmetBrand: text(body.helmet_brand, CAP.short),
    helmetModel: text(body.helmet_model, CAP.short),
    helmetSize: text(body.helmet_size, CAP.short),
    helmetStyle: text(body.helmet_style, CAP.short),
    description: text(body.description, CAP.long),
    finish: text(body.finish, CAP.short),
    desiredColour: text(body.desired_colour, CAP.short),
    filmTypes: list(body.film_types, CAP.medium),
    /* One picked film per line. Each carries a name, a SKU, a vendor and a
       supplier URL, so the cap is per-line generous rather than per-field
       tight — six of them is a long string and still a legitimate answer. */
    filmChoices: lines(body.film_choices, 6, CAP.long),
    handoff: text(body.handoff, CAP.short),
    pickupZip: text(body.pickup_zip, 10),
    name: text(body.name, CAP.short),
    email: text(body.email, CAP.short),
    phone: text(body.phone, CAP.short),
    instagram: text(body.instagram, CAP.short),
    preferredContact: CONTACT_METHODS.has(contact) ? contact : "",
    photoCount: count(body.photo_count),
    summary: text(body.summary, CAP.long),
    page: text(body.page, CAP.medium),
  };
}

/**
 * The one rule worth enforcing: a row nobody can be contacted from is not a
 * lead. Everything else is recorded as sent, because a half-filled record of a
 * real rider beats no record at all.
 */
function usable(record: QuoteRecord): boolean {
  if (!record.email && !record.phone) return false;
  if (record.email && !EMAIL.test(record.email)) return false;
  return Boolean(record.name || record.description);
}

export async function recordQuoteRequest(
  request: Request,
  env: QuoteEnv
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Expected a JSON body." }, 400);
  }

  const record = normalise(body);
  if (!usable(record)) {
    return json({ error: "A contactable name and email or phone are required." }, 400);
  }

  if (!env.DB) {
    // Not an error the rider should ever see or feel: their request is already
    // on its way to the inbox by another route.
    console.warn("quote request not stored — D1 is not bound", record.id);
    return json({ ok: true, id: record.id, stored: false });
  }

  try {
    await env.DB.prepare(
      `INSERT INTO quote_requests (
         id, created_at, item_type, services, service_other,
         bike_make, bike_model, bike_year, bike_style,
         helmet_brand, helmet_model, helmet_size, helmet_style,
         description, finish, desired_colour, film_types, film_choices,
         handoff, pickup_zip,
         customer_name, customer_email, customer_phone, instagram,
         preferred_contact, photo_count, summary, page,
         referer, user_agent, country
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        record.id,
        record.createdAt,
        record.itemType,
        record.services,
        record.serviceOther,
        record.bikeMake,
        record.bikeModel,
        record.bikeYear,
        record.bikeStyle,
        record.helmetBrand,
        record.helmetModel,
        record.helmetSize,
        record.helmetStyle,
        record.description,
        record.finish,
        record.desiredColour,
        record.filmTypes,
        record.filmChoices,
        record.handoff,
        record.pickupZip,
        record.name,
        record.email,
        record.phone,
        record.instagram,
        record.preferredContact,
        record.photoCount,
        record.summary,
        record.page,
        text(request.headers.get("Referer"), CAP.medium),
        text(request.headers.get("User-Agent"), CAP.medium),
        text(request.headers.get("CF-IPCountry"), 8)
      )
      .run();
  } catch (err) {
    console.error("quote request insert failed", record.id, String(err));
    return json({ ok: true, id: record.id, stored: false });
  }

  return json({ ok: true, id: record.id, stored: true });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
