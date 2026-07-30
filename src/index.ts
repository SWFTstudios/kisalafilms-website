import { depositQuote, type PackageKey } from "./deposit";
import {
  getFilm,
  importFilms,
  listFilms,
  type D1Database,
} from "./films";

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  SITE_URL?: string;
  FILMS_IMPORT_TOKEN?: string;
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
  params.set(
    "line_items[0][price_data][currency]",
    "usd"
  );
  params.set(
    "line_items[0][price_data][unit_amount]",
    String(quote.amountCents)
  );
  params.set(
    "line_items[0][price_data][product_data][name]",
    quote.label
  );
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

/** Same-origin proxy so lookbook mockups can sample Metro/Shopify swatches on canvas. */
async function proxyImage(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "Invalid image url." }, 400);
  }

  const allowed =
    parsed.protocol === "https:" &&
    (parsed.hostname === "cdn.shopify.com" ||
      parsed.hostname === "metrorestyling.com" ||
      parsed.hostname.endsWith(".myshopify.com"));
  if (!allowed) {
    return json({ error: "Image host is not allowed." }, 400);
  }

  const upstream = await fetch(parsed.toString());

  if (!upstream.ok) {
    return json({ error: "Upstream image fetch failed." }, 502);
  }

  const contentType = upstream.headers.get("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return json({ error: "Upstream was not an image." }, 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function corsFilms(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/image-proxy") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        });
      }
      if (request.method !== "GET") {
        return json({ error: "GET only." }, 405);
      }
      return proxyImage(request);
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
      const res = await listFilms(env.DB, url);
      const headers = new Headers(res.headers);
      Object.entries(corsFilms(request)).forEach(([k, v]) => headers.set(k, v));
      return new Response(res.body, { status: res.status, headers });
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
      if (handle === "import") {
        return json({ error: "Not found." }, 404);
      }
      const res = await getFilm(env.DB, handle);
      const headers = new Headers(res.headers);
      Object.entries(corsFilms(request)).forEach(([k, v]) => headers.set(k, v));
      return new Response(res.body, { status: res.status, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
