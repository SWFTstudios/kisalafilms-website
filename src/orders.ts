import type { D1Database } from "./films";
import type { ProjectQuote, ProjectCoverage, ProjectSurface } from "./project-quote";

export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

export type ProjectOrderInput = {
  id: string;
  surface: ProjectSurface;
  coverage: ProjectCoverage;
  filmHandle: string;
  filmName?: string;
  filmFinish?: string;
  difficulty: number;
  bodyClass?: string;
  bikeYear?: string;
  bikeMake?: string;
  bikeModel?: string;
  bikeLabel?: string;
  helmetNotes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  firebaseUid?: string;
  projectId?: string;
  quote: ProjectQuote;
};

export type ProjectOrderRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  surface: string;
  coverage: string;
  film_handle: string;
  film_name: string | null;
  film_finish: string | null;
  difficulty: number;
  body_class: string | null;
  bike_year: string | null;
  bike_make: string | null;
  bike_model: string | null;
  bike_label: string | null;
  helmet_notes: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  firebase_uid: string | null;
  project_id: string | null;
  roll_cost_usd: number | null;
  vinyl_markup: number | null;
  vinyl_sell_usd: number | null;
  rolls: number | null;
  linear_feet: number | null;
  labour_usd: number | null;
  total_usd: number | null;
  amount_cents: number | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  currency: string;
  quote_json: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function insertPendingOrder(
  db: D1Database,
  input: ProjectOrderInput
): Promise<void> {
  const ts = nowIso();
  const q = input.quote;
  await db
    .prepare(
      `INSERT INTO project_orders (
        id, created_at, updated_at, status, surface, coverage,
        film_handle, film_name, film_finish, difficulty, body_class,
        bike_year, bike_make, bike_model, bike_label, helmet_notes,
        customer_name, customer_email, customer_phone, firebase_uid, project_id,
        roll_cost_usd, vinyl_markup, vinyl_sell_usd, rolls, linear_feet,
        labour_usd, total_usd, amount_cents, currency, quote_json
      ) VALUES (
        ?, ?, ?, 'pending', ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'usd', ?
      )`
    )
    .bind(
      input.id,
      ts,
      ts,
      input.surface,
      input.coverage,
      input.filmHandle,
      input.filmName || null,
      input.filmFinish || null,
      input.difficulty,
      input.bodyClass || null,
      input.bikeYear || null,
      input.bikeMake || null,
      input.bikeModel || null,
      input.bikeLabel || null,
      input.helmetNotes || null,
      input.customerName || null,
      input.customerEmail || null,
      input.customerPhone || null,
      input.firebaseUid || null,
      input.projectId || null,
      q.rollCostUsd,
      q.vinylMarkup,
      q.vinylSellUsd,
      q.rolls,
      q.linearFeet,
      q.labourUsd,
      q.totalUsd,
      q.amountCents,
      JSON.stringify(q)
    )
    .run();
}

export async function attachStripeSession(
  db: D1Database,
  orderId: string,
  sessionId: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE project_orders SET stripe_session_id = ?, updated_at = ? WHERE id = ?`
    )
    .bind(sessionId, nowIso(), orderId)
    .run();
}

export async function markOrderPaid(
  db: D1Database,
  opts: {
    orderId?: string;
    sessionId?: string;
    paymentIntent?: string;
  }
): Promise<ProjectOrderRow | null> {
  let row: ProjectOrderRow | null = null;
  if (opts.orderId) {
    row = await db
      .prepare(`SELECT * FROM project_orders WHERE id = ?`)
      .bind(opts.orderId)
      .first<ProjectOrderRow>();
  } else if (opts.sessionId) {
    row = await db
      .prepare(`SELECT * FROM project_orders WHERE stripe_session_id = ?`)
      .bind(opts.sessionId)
      .first<ProjectOrderRow>();
  }
  if (!row) return null;
  if (row.status === "paid") return row;

  await db
    .prepare(
      `UPDATE project_orders
       SET status = 'paid',
           stripe_payment_intent = COALESCE(?, stripe_payment_intent),
           stripe_session_id = COALESCE(?, stripe_session_id),
           updated_at = ?
       WHERE id = ?`
    )
    .bind(
      opts.paymentIntent || null,
      opts.sessionId || row.stripe_session_id,
      nowIso(),
      row.id
    )
    .run();

  return {
    ...row,
    status: "paid",
    stripe_payment_intent: opts.paymentIntent || row.stripe_payment_intent,
  };
}

export async function getOrderById(
  db: D1Database,
  id: string
): Promise<ProjectOrderRow | null> {
  return db
    .prepare(`SELECT * FROM project_orders WHERE id = ?`)
    .bind(id)
    .first<ProjectOrderRow>();
}

export async function getOrderBySession(
  db: D1Database,
  sessionId: string
): Promise<ProjectOrderRow | null> {
  return db
    .prepare(`SELECT * FROM project_orders WHERE stripe_session_id = ?`)
    .bind(sessionId)
    .first<ProjectOrderRow>();
}

export function publicOrder(row: ProjectOrderRow) {
  return {
    id: row.id,
    status: row.status,
    surface: row.surface,
    coverage: row.coverage,
    filmHandle: row.film_handle,
    filmName: row.film_name,
    difficulty: row.difficulty,
    bikeLabel: row.bike_label,
    helmetNotes: row.helmet_notes,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    labourUsd: row.labour_usd,
    vinylSellUsd: row.vinyl_sell_usd,
    rolls: row.rolls,
    totalUsd: row.total_usd,
    amountCents: row.amount_cents,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
