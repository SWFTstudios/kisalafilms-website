import { depositQuote, type PackageKey } from "./deposit";

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  STRIPE_SECRET_KEY?: string;
  SITE_URL?: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    return env.ASSETS.fetch(request);
  },
};
