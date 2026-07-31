import { depositQuote, type PackageKey } from "./deposit";
import {
  getFilm,
  getFilmCostRow,
  importFilms,
  incrementCompletedOrders,
  listFilms,
  pricingCsv,
  setCompletedOrders,
  type D1Database,
} from "./films";
import { syncMetroPrices } from "./metro-prices";
import {
  attachStripeSession,
  getOrderById,
  getOrderBySession,
  insertPendingOrder,
  markOrderPaid,
  publicOrder,
} from "./orders";
import {
  quoteProject,
  type ProjectCoverage,
  type ProjectSurface,
} from "./project-quote";

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  FILMS_IMPORT_TOKEN?: string;
  FOUNDER_ADMIN_TOKEN?: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function siteUrl(request: Request, env: Env): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function corsApi(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
  };
}

function withCors(res: Response, request: Request): Response {
  const headers = new Headers(res.headers);
  Object.entries(corsApi(request)).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

function redirect(to: string, status = 301): Response {
  return new Response(null, {
    status,
    headers: { Location: to, "Cache-Control": "public, max-age=3600" },
  });
}

function adminAuthed(request: Request, env: Env): boolean {
  const token = env.FOUNDER_ADMIN_TOKEN || env.FILMS_IMPORT_TOKEN;
  if (!token) return false;
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${token}`;
}

function orderId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type ProjectBody = {
  surface?: string;
  coverage?: string;
  filmHandle?: string;
  bikeDifficulty?: number;
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
};

async function buildProjectQuote(env: Env, body: ProjectBody) {
  const surface = body.surface as ProjectSurface;
  if (surface !== "motorcycle" && surface !== "helmet") {
    return { error: "surface must be motorcycle or helmet.", status: 400 as const };
  }
  const filmHandle = String(body.filmHandle || "").trim();
  if (!filmHandle) {
    return { error: "filmHandle is required.", status: 400 as const };
  }
  if (!env.DB) {
    return { error: "D1 database is not bound.", status: 503 as const };
  }

  const film = await getFilmCostRow(env.DB, filmHandle);
  if (!film) {
    return { error: "Film not found in catalog.", status: 404 as const };
  }
  const rollCost = Number(film.roll_price_usd ?? film.price_usd);
  if (!Number.isFinite(rollCost) || rollCost <= 0) {
    return {
      error:
        "This film does not have a synced Metro roll price yet. Try another colour or wait for the hourly price sync.",
      status: 409 as const,
    };
  }

  const coverage: ProjectCoverage =
    surface === "helmet"
      ? "full"
      : body.coverage === "accent"
        ? "accent"
        : "full";

  const quote = quoteProject({
    surface,
    coverage,
    bikeDifficulty: body.bikeDifficulty,
    bodyClass: body.bodyClass,
    filmFinish: film.finish || undefined,
    rollCostUsd: rollCost,
  });
  if (!quote || quote.amountCents < 50) {
    return { error: "Could not price that project.", status: 400 as const };
  }

  return {
    film: {
      handle: film.handle,
      name: film.name,
      brand: film.brand,
      finish: film.finish,
      sku: film.sku,
      image_url: film.image_url,
      in_stock: !!film.in_stock,
    },
    quote,
    status: 200 as const,
  };
}

async function createDepositCheckout(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json(
      {
        error:
          "Stripe is not configured yet. Set the STRIPE_SECRET_KEY Worker secret, then redeploy.",
      },
      503
    );
  }

  let body: { package?: string };
  try {
    body = (await request.json()) as { package?: string };
  } catch {
    return json({ error: "Expected JSON body with a package key." }, 400);
  }

  const packageKey = body.package;
  if (!packageKey || !["fullWrap", "partialWrap"].includes(packageKey)) {
    return json(
      { error: "package must be fullWrap or partialWrap." },
      400
    );
  }

  const quote = depositQuote(packageKey);
  if (!quote || quote.amountCents < 50) {
    return json({ error: "Could not price that deposit." }, 400);
  }

  const base = siteUrl(request, env);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${base}/deposit-thanks?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${base}/pricing#deposit`);
  params.set("customer_creation", "always");
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "true");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set(
    "line_items[0][price_data][unit_amount]",
    String(quote.amountCents)
  );
  params.set("line_items[0][price_data][product_data][name]", quote.label);
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${Math.round(quote.percent * 100)}% of labour (${formatUsd(quote.labour)}) + ${quote.rolls}× ${quote.rollWidthFt}×${quote.rollLengthFt}ft vinyl roll (${formatUsd(quote.material)}). Applied to your build.`
  );
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[package]", quote.packageKey);
  params.set("metadata[rolls]", String(quote.rolls));
  params.set("metadata[labour]", String(quote.labour));
  params.set("metadata[material]", String(quote.material));
  params.set("metadata[deposit_amount]", String(quote.amount));
  params.set(
    "payment_intent_data[description]",
    `Kisala Films — ${quote.label}`
  );
  params.set(
    "payment_intent_data[metadata][package]",
    quote.packageKey as PackageKey
  );

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const stripeBody = (await stripeRes.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok || !stripeBody.url) {
    return json(
      {
        error:
          stripeBody.error?.message ||
          "Stripe rejected the checkout session.",
      },
      502
    );
  }

  return json({
    url: stripeBody.url,
    sessionId: stripeBody.id,
    amount: quote.amount,
    package: quote.packageKey,
  });
}

async function createProjectCheckout(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json(
      {
        error:
          "Stripe is not configured yet. Set the STRIPE_SECRET_KEY Worker secret, then redeploy.",
      },
      503
    );
  }
  if (!env.DB) return json({ error: "D1 database is not bound." }, 503);

  let body: ProjectBody;
  try {
    body = (await request.json()) as ProjectBody;
  } catch {
    return json({ error: "Expected JSON project body." }, 400);
  }

  const email = String(body.customerEmail || "").trim();
  const name = String(body.customerName || "").trim();
  if (!email || !email.includes("@")) {
    return json({ error: "A valid customerEmail is required." }, 400);
  }
  if (!name) {
    return json({ error: "customerName is required." }, 400);
  }

  const built = await buildProjectQuote(env, body);
  if ("error" in built && built.error) {
    return json({ error: built.error }, built.status);
  }
  const { film, quote } = built as {
    film: {
      handle: string;
      name: string;
      brand: string | null;
      finish: string | null;
      sku: string | null;
      image_url: string | null;
      in_stock: boolean;
    };
    quote: NonNullable<ReturnType<typeof quoteProject>>;
  };

  const id = orderId();
  await insertPendingOrder(env.DB, {
    id,
    surface: quote.surface,
    coverage: quote.coverage,
    filmHandle: film.handle,
    filmName: film.name,
    filmFinish: film.finish || undefined,
    difficulty: quote.difficulty,
    bodyClass: body.bodyClass,
    bikeYear: body.bikeYear,
    bikeMake: body.bikeMake,
    bikeModel: body.bikeModel,
    bikeLabel: body.bikeLabel,
    helmetNotes: body.helmetNotes,
    customerName: name,
    customerEmail: email,
    customerPhone: body.customerPhone,
    firebaseUid: body.firebaseUid,
    projectId: body.projectId,
    quote,
  });

  const base = siteUrl(request, env);
  const surfaceLabel =
    quote.surface === "helmet" ? "Helmet wrap" : "Motorcycle wrap";
  const coverageLabel = quote.coverage === "accent" ? "accent package" : "full wrap";
  const productName = `${surfaceLabel} — ${film.name}`;
  const description = [
    `${coverageLabel} · ${quote.difficultyLabel}`,
    `Labour ${formatUsd(quote.labourUsd)}`,
    `Vinyl ${quote.rolls}× ${quote.rollWidthFt}×${quote.rollLengthFt}ft @ Metro cost + ${Math.round(
      (quote.vinylMarkup - 1) * 100
    )}% (${formatUsd(quote.vinylSellUsd)})`,
  ].join(" · ");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set(
    "success_url",
    `${base}/project-thanks?order_id=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`
  );
  params.set(
    "cancel_url",
    `${base}/project?film=${encodeURIComponent(film.handle)}&cancelled=1`
  );
  params.set("customer_creation", "always");
  params.set("customer_email", email);
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "true");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(quote.amountCents));
  params.set("line_items[0][price_data][product_data][name]", productName);
  params.set("line_items[0][price_data][product_data][description]", description);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[order_id]", id);
  params.set("metadata[surface]", quote.surface);
  params.set("metadata[coverage]", quote.coverage);
  params.set("metadata[film_handle]", film.handle);
  params.set("metadata[difficulty]", String(quote.difficulty));
  params.set("metadata[total_usd]", String(quote.totalUsd));
  params.set("payment_intent_data[description]", `Kisala Films — ${productName}`);
  params.set("payment_intent_data[metadata][order_id]", id);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const stripeBody = (await stripeRes.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok || !stripeBody.url || !stripeBody.id) {
    return json(
      {
        error:
          stripeBody.error?.message ||
          "Stripe rejected the checkout session.",
      },
      502
    );
  }

  await attachStripeSession(env.DB, id, stripeBody.id);

  return json({
    url: stripeBody.url,
    sessionId: stripeBody.id,
    orderId: id,
    amount: quote.totalUsd,
    quote,
    film,
  });
}

/**
 * Stripe webhook signature (v1) — HMAC-SHA256 over `${t}.${payload}`.
 * Accepts without secret only in local/dev when STRIPE_WEBHOOK_SECRET is unset
 * would be unsafe; require the secret in production.
 */
async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    })
  );
  const timestamp = parts.t;
  const signatures = header
    .split(",")
    .filter((p) => p.trim().startsWith("v1="))
    .map((p) => p.trim().slice(3));
  if (!timestamp || !signatures.length) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`)
  );
  const digest = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatures.some((sig) => timingSafeEqual(sig, digest));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
  const payload = await request.text();
  const sig = request.headers.get("Stripe-Signature");

  if (env.STRIPE_WEBHOOK_SECRET) {
    const ok = await verifyStripeSignature(
      payload,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
    if (!ok) return json({ error: "Invalid Stripe signature." }, 400);
  } else {
    // Without a webhook secret we refuse — never trust unsigned events.
    return json(
      {
        error:
          "STRIPE_WEBHOOK_SECRET is not set. Configure the Worker secret before enabling webhooks.",
      },
      503
    );
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object || {};
    const sessionId = String(session.id || "");
    const meta = (session.metadata || {}) as Record<string, string>;
    const orderIdMeta = meta.order_id || "";
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : "";
    if (sessionId || orderIdMeta) {
      await markOrderPaid(env.DB, {
        orderId: orderIdMeta || undefined,
        sessionId: sessionId || undefined,
        paymentIntent: paymentIntent || undefined,
      });
    }
  }

  return json({ received: true });
}

async function confirmCheckoutSession(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Stripe is not configured." }, 503);
  }
  if (!env.DB) return json({ error: "D1 database is not bound." }, 503);

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") || "";
  const orderIdParam = url.searchParams.get("order_id") || "";
  if (!sessionId && !orderIdParam) {
    return json({ error: "session_id or order_id required." }, 400);
  }

  if (sessionId) {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      }
    );
    const session = (await stripeRes.json()) as {
      id?: string;
      payment_status?: string;
      payment_intent?: string;
      metadata?: Record<string, string>;
      error?: { message?: string };
    };
    if (!stripeRes.ok) {
      return json(
        { error: session.error?.message || "Could not load Stripe session." },
        502
      );
    }
    if (session.payment_status === "paid") {
      const paid = await markOrderPaid(env.DB, {
        orderId: session.metadata?.order_id,
        sessionId: session.id,
        paymentIntent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : undefined,
      });
      if (paid) return json({ ok: true, order: publicOrder(paid) });
    }
  }

  const row = orderIdParam
    ? await getOrderById(env.DB, orderIdParam)
    : await getOrderBySession(env.DB, sessionId);
  if (!row) return json({ error: "Order not found." }, 404);
  return json({ ok: true, order: publicOrder(row) });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (!env.DB) {
      console.error("D1 not bound; skip Metro price sync");
      return;
    }
    ctx.waitUntil(
      syncMetroPrices(env.DB)
        .then((r) => console.log("metro price sync", JSON.stringify(r)))
        .catch((err) => console.error("metro price sync failed", String(err)))
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/lookbook" || url.pathname === "/lookbook/") {
      return redirect("/vinyl-catalog" + url.search);
    }
    if (
      url.pathname === "/lookbook/film" ||
      url.pathname === "/lookbook/film/" ||
      url.pathname === "/lookbook/film.html"
    ) {
      return redirect("/vinyl-catalog/film.html" + url.search);
    }

    if (url.pathname === "/api/checkout/deposit") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      return createDepositCheckout(request, env);
    }

    if (url.pathname === "/api/quote/project") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      let body: ProjectBody;
      try {
        body = (await request.json()) as ProjectBody;
      } catch {
        return json({ error: "Expected JSON body." }, 400);
      }
      const built = await buildProjectQuote(env, body);
      if ("error" in built && built.error) {
        return json({ error: built.error }, built.status);
      }
      return json(built);
    }

    if (url.pathname === "/api/checkout/project") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      return createProjectCheckout(request, env);
    }

    if (url.pathname === "/api/checkout/session") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      return confirmCheckoutSession(request, env);
    }

    if (url.pathname === "/api/webhooks/stripe") {
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      return handleStripeWebhook(request, env);
    }

    if (url.pathname.match(/^\/api\/orders\/([^/]+)\/?$/)) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
      const id = decodeURIComponent(
        url.pathname.replace(/^\/api\/orders\//, "").replace(/\/$/, "")
      );
      const row = await getOrderById(env.DB, id);
      if (!row) return json({ error: "Order not found." }, 404);
      return json({ order: publicOrder(row) });
    }

    if (url.pathname === "/api/films/pricing.csv") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
      return withCors(await pricingCsv(env.DB), request);
    }

    if (url.pathname === "/api/founder/complete") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
      if (!adminAuthed(request, env)) {
        return json({ error: "Unauthorized." }, 401);
      }
      let body: { set?: number } = {};
      try {
        body = (await request.json()) as { set?: number };
      } catch {
        /* increment by default */
      }
      const founder =
        typeof body.set === "number"
          ? await setCompletedOrders(env.DB, body.set)
          : await incrementCompletedOrders(env.DB);
      return json({ ok: true, ...founder });
    }

    if (url.pathname === "/api/films" || url.pathname === "/api/films/") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      if (!env.DB) {
        return json({ error: "D1 database is not bound." }, 503);
      }
      return withCors(await listFilms(env.DB, url), request);
    }

    if (url.pathname === "/api/films/import") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      if (!env.DB) {
        return json({ error: "D1 database is not bound." }, 503);
      }
      return importFilms(request, env.DB, env.FILMS_IMPORT_TOKEN);
    }

    if (url.pathname === "/api/films/sync-prices") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
      if (!adminAuthed(request, env)) {
        return json({ error: "Unauthorized." }, 401);
      }
      const result = await syncMetroPrices(env.DB);
      return json({ ok: true, ...result });
    }

    const filmMatch = url.pathname.match(/^\/api\/films\/([^/]+)\/?$/);
    if (filmMatch) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsApi(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      if (!env.DB) {
        return json({ error: "D1 database is not bound." }, 503);
      }
      const handle = decodeURIComponent(filmMatch[1]);
      if (["import", "pricing.csv", "sync-prices"].includes(handle)) {
        return json({ error: "Not found." }, 404);
      }
      return withCors(await getFilm(env.DB, handle), request);
    }

    return env.ASSETS.fetch(request);
  },
};
