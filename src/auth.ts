/**
 * Passwordless sign-in for the client portal and the studio admin.
 *
 *   POST /api/auth/request   { email, next? }   emails a link and a 6-digit code
 *   GET  /api/auth/verify?token=…              the link: sets the session, redirects
 *   POST /api/auth/code      { email, code }    the code, for a phone that opened
 *                                               the email somewhere else
 *   POST /api/auth/logout
 *   GET  /api/me
 *
 * Accounts are not signed up for. A customer row is created when someone
 * submits a build (src/portal.ts), and the studio's own addresses (ADMIN_EMAILS)
 * get one on first sign-in. /api/auth/request answers the same way whether or
 * not the address has an account, so it cannot be used to find out who is a
 * customer.
 *
 * Only hashes are stored: the link token, the code (salted with its row id) and
 * the session cookie value. A link or code is good once, for 20 minutes, and a
 * code locks after five wrong guesses.
 */
import {
  cookie,
  email as cleanEmail,
  getCookie,
  id,
  isLocal,
  json,
  now,
  readJson,
  safeNext,
  secret,
  sha256,
  siteUrl,
  text,
  type PortalEnv,
} from "./http";
import { sendEmail } from "./email";

const SESSION_COOKIE = "kf_session";
const SESSION_DAYS = 30;
const LOGIN_MINUTES = 20;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGINS_PER_HOUR = 5;

export type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
};

export type Viewer = { customer: Customer; isAdmin: boolean };

function adminEmails(env: PortalEnv): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(env: PortalEnv, address: string): boolean {
  return adminEmails(env).has(address.toLowerCase());
}

export async function customerByEmail(env: PortalEnv, address: string): Promise<Customer | null> {
  return env.DB.prepare("SELECT id, email, name, phone FROM customers WHERE email = ?")
    .bind(address)
    .first<Customer>();
}

/**
 * The customer for this address, created if new. Name and phone only fill
 * blanks: a form submission must not be able to overwrite an existing
 * customer's details just by knowing their email.
 */
export async function upsertCustomer(
  env: PortalEnv,
  details: { email: string; name?: string; phone?: string }
): Promise<Customer> {
  const existing = await customerByEmail(env, details.email);
  const at = now();
  if (existing) {
    if ((!existing.name && details.name) || (!existing.phone && details.phone)) {
      await env.DB.prepare(
        "UPDATE customers SET name = COALESCE(name, ?), phone = COALESCE(phone, ?), updated_at = ? WHERE id = ?"
      )
        .bind(details.name || null, details.phone || null, at, existing.id)
        .run();
    }
    return {
      ...existing,
      name: existing.name || details.name || null,
      phone: existing.phone || details.phone || null,
    };
  }
  const customer: Customer = {
    id: id("cus"),
    email: details.email,
    name: details.name || null,
    phone: details.phone || null,
  };
  await env.DB.prepare(
    "INSERT INTO customers (id, email, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(customer.id, customer.email, customer.name, customer.phone, at, at)
    .run();
  return customer;
}

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Create a one-time link and code for this customer and email them.
 * Returns the raw link and code only when running locally, so the flow can be
 * exercised without a mail provider; production never sees them again.
 */
export async function issueLogin(
  request: Request,
  env: PortalEnv,
  customer: Customer,
  next: string,
  intro?: { subject: string; heading: string; paragraphs: string[] }
): Promise<{ devLink?: string; devCode?: string; limited?: boolean }> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_tokens WHERE customer_id = ? AND created_at > ?"
  )
    .bind(customer.id, hourAgo)
    .first<{ n: number }>();
  // Local runs sign the same test addresses in over and over.
  const limit = isLocal(request) ? 100 : MAX_LOGINS_PER_HOUR;
  if ((recent?.n ?? 0) >= limit) return { limited: true };

  const rowId = id("lt");
  const token = secret();
  const code = sixDigits();
  const at = now();
  const expires = new Date(Date.now() + LOGIN_MINUTES * 60_000).toISOString();

  await env.DB.prepare(
    `INSERT INTO login_tokens (id, customer_id, token_hash, code_hash, next_path, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(rowId, customer.id, await sha256(token), await sha256(rowId + code), next, at, expires)
    .run();

  const link = `${siteUrl(request, env)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendEmail(env, {
    to: customer.email,
    subject: intro?.subject ?? `Your K Films sign-in code: ${code}`,
    heading: intro?.heading ?? "Sign in to your portal",
    paragraphs: [
      ...(intro?.paragraphs ?? []),
      `Use the button below, or enter this code: ${code}`,
    ],
    button: { label: "Open my portal", href: link },
    footnote: `The link and code work once, for ${LOGIN_MINUTES} minutes. If you didn't ask for this, you can ignore it.`,
  });

  return isLocal(request) ? { devLink: link, devCode: code } : {};
}

async function startSession(request: Request, env: PortalEnv, customerId: string): Promise<string> {
  const value = secret();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, customer_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(await sha256(value), customerId, now(), expires, text(request.headers.get("User-Agent"), 300))
    .run();
  return cookie(request, SESSION_COOKIE, value, SESSION_DAYS * 86400);
}

export async function currentViewer(request: Request, env: PortalEnv): Promise<Viewer | null> {
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return null;
  const row = await env.DB.prepare(
    `SELECT c.id, c.email, c.name, c.phone FROM sessions s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ? AND s.expires_at > ?`
  )
    .bind(await sha256(value), now())
    .first<Customer>();
  if (!row) return null;
  return { customer: row, isAdmin: isAdminEmail(env, row.email) };
}

/* ---- Handlers ---------------------------------------------------------- */

export async function handleAuthRequest(request: Request, env: PortalEnv): Promise<Response> {
  const body = await readJson(request);
  const address = cleanEmail(body?.email);
  if (!address) return json({ error: "Enter a valid email address." }, 400);
  const next = safeNext(body?.next);

  let customer = await customerByEmail(env, address);
  if (!customer && isAdminEmail(env, address)) {
    customer = await upsertCustomer(env, { email: address });
  }

  // Same answer either way: no account enumeration.
  const reply = { ok: true, message: "If that address has a K Films account, a sign-in link is on its way." };
  if (!customer) return json(reply);

  const issued = await issueLogin(request, env, customer, next);
  return json({ ...reply, ...(issued.devLink ? { devLink: issued.devLink, devCode: issued.devCode } : {}) });
}

export async function handleAuthVerify(request: Request, env: PortalEnv): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") || "";
  const row = token
    ? await env.DB.prepare(
        "SELECT id, customer_id, next_path FROM login_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?"
      )
        .bind(await sha256(token), now())
        .first<{ id: string; customer_id: string; next_path: string | null }>()
    : null;

  if (!row) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?expired=1", "Cache-Control": "no-store" },
    });
  }

  await env.DB.prepare("UPDATE login_tokens SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  const setCookie = await startSession(request, env, row.customer_id);
  return new Response(null, {
    status: 302,
    headers: { Location: safeNext(row.next_path), "Set-Cookie": setCookie, "Cache-Control": "no-store" },
  });
}

export async function handleAuthCode(request: Request, env: PortalEnv): Promise<Response> {
  const body = await readJson(request);
  const address = cleanEmail(body?.email);
  const code = text(body?.code, 12).replace(/\D/g, "");
  const fail = () => json({ error: "That code didn't work. Check it, or request a new one." }, 400);
  if (!address || code.length !== 6) return fail();

  const customer = await customerByEmail(env, address);
  if (!customer) return fail();

  const row = await env.DB.prepare(
    `SELECT id, code_hash, next_path, attempts FROM login_tokens
     WHERE customer_id = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(customer.id, now())
    .first<{ id: string; code_hash: string; next_path: string | null; attempts: number }>();
  if (!row) return fail();

  if ((await sha256(row.id + code)) !== row.code_hash) {
    const attempts = row.attempts + 1;
    // Burn the row after too many guesses rather than leave it open to more.
    await env.DB.prepare("UPDATE login_tokens SET attempts = ?, used_at = ? WHERE id = ?")
      .bind(attempts, attempts >= MAX_CODE_ATTEMPTS ? now() : null, row.id)
      .run();
    return fail();
  }

  await env.DB.prepare("UPDATE login_tokens SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  const setCookie = await startSession(request, env, customer.id);
  return json({ ok: true, next: safeNext(row.next_path) }, 200, { "Set-Cookie": setCookie });
}

export async function handleLogout(request: Request, env: PortalEnv): Promise<Response> {
  const value = getCookie(request, SESSION_COOKIE);
  if (value) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(value)).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": cookie(request, SESSION_COOKIE, "", 0) });
}

export async function handleMe(request: Request, env: PortalEnv): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ signedIn: false });
  return json({ signedIn: true, isAdmin: viewer.isAdmin, customer: viewer.customer });
}
