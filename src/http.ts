/**
 * Small helpers shared by the portal modules (auth, uploads, jobs): JSON
 * responses, body parsing, cookies, ids, hashing and input clean-up.
 */
import type { D1Database } from "./films";

export type R2ObjectBody = {
  body: ReadableStream;
  size: number;
  httpMetadata?: { contentType?: string };
};

export type R2Bucket = {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } }
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBody | null>;
  delete: (key: string | string[]) => Promise<void>;
};

export type EmailBinding = {
  send: (message: {
    to: string | string[];
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
  }) => Promise<{ messageId: string }>;
};

/** Everything the portal needs from the Worker's environment. */
export type PortalEnv = {
  DB: D1Database;
  PHOTOS?: R2Bucket;
  EMAIL?: EmailBinding;
  EMAIL_FROM?: string;
  ADMIN_EMAILS?: string;
  RESEND_API_KEY?: string;
  SITE_URL?: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function now(): string {
  return new Date().toISOString();
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** 32 random bytes, base64url: the secret half of a link or session cookie. */
export function secret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strip control characters, trim and cap. Anything that isn't a string is "". */
export function text(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function email(value: unknown): string {
  const v = text(value, 254).toLowerCase();
  return EMAIL_PATTERN.test(v) ? v : "";
}

export function siteUrl(request: Request, env: { SITE_URL?: string }): string {
  // Local dev answers on localhost even though SITE_URL names production, and
  // a sign-in link has to come back to the server that issued it.
  const url = new URL(request.url);
  if (isLocal(request)) return `${url.protocol}//${url.host}`;
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, "");
  return `${url.protocol}//${url.host}`;
}

export function isLocal(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookie(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  // Secure is dropped on plain-http localhost, where the browser would refuse it.
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** A same-site path to send someone to after sign-in, or the portal. */
export function safeNext(value: unknown): string {
  const v = text(value, 300);
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "/portal";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
