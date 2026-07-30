import { depositQuote, type PackageKey } from "./deposit";
import {
  getFilm,
  importFilms,
  incrementCompletedOrders,
  listFilms,
  pricingCsv,
  setCompletedOrders,
  type D1Database,
} from "./films";
import { syncMetroPrices } from "./metro-prices";

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
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

function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function corsFilms(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function withCors(res: Response, request: Request): Response {
  const headers = new Headers(res.headers);
  Object.entries(corsFilms(request)).forEach(([k, v]) => headers.set(k, v));
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

    // Lookbook → vinyl catalog redirects
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
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method !== "POST") {
        return json({ error: "POST only." }, 405);
      }
      return createDepositCheckout(request, env);
    }

    if (url.pathname === "/api/films/pricing.csv") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsFilms(request) });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
      return withCors(await pricingCsv(env.DB), request);
    }

    if (url.pathname === "/api/founder/complete") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsFilms(request) });
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
        return new Response(null, { status: 204, headers: corsFilms(request) });
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
        return new Response(null, { status: 204, headers: corsFilms(request) });
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
        return new Response(null, { status: 204, headers: corsFilms(request) });
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
        return new Response(null, { status: 204, headers: corsFilms(request) });
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
