/**
 * Transactional email: sign-in links, "your build is in", stage updates and
 * new-message alerts.
 *
 * Delivery tries, in order:
 *   1. The Cloudflare Email Service binding (`EMAIL` in wrangler.jsonc). It
 *      only sends from a domain onboarded to Email Sending, named by EMAIL_FROM.
 *   2. Resend, when RESEND_API_KEY is set, for a sending domain that lives
 *      somewhere else.
 *   3. Neither, or no EMAIL_FROM: the message is written to the Worker log. That is what local
 *      development uses, and in production it means mail is not configured.
 *
 * A send never throws. Sign-in and job creation must not fail because a mail
 * provider is having a bad minute, so the caller gets `{ sent: false }` and
 * carries on; the failure is in the log.
 */
import { escapeHtml, type PortalEnv } from "./http";

export type Email = {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  footnote?: string;
  replyTo?: string;
};

function parseFrom(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

function render(mail: Email): { html: string; text: string } {
  const p = mail.paragraphs
    .map((para) => `<p style="margin:0 0 16px;font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2b2925">${escapeHtml(para)}</p>`)
    .join("");
  const button = mail.button
    ? `<p style="margin:28px 0"><a href="${escapeHtml(mail.button.href)}" style="display:inline-block;padding:14px 26px;background:#0b0b0b;color:#ece8e1;text-decoration:none;font:500 12px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase">${escapeHtml(mail.button.label)}</a></p>`
    : "";
  const foot = mail.footnote
    ? `<p style="margin:24px 0 0;font:13px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#7c7871">${escapeHtml(mail.footnote)}</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff">
<tr><td style="padding:28px 32px;background:#0b0b0b;font:500 12px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#ece8e1">K Films</td></tr>
<tr><td style="padding:36px 32px 32px">
<h1 style="margin:0 0 20px;font:400 30px/1.15 Georgia,'Times New Roman',serif;color:#0b0b0b">${escapeHtml(mail.heading)}</h1>
${p}${button}${foot}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #ece8e1;font:12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#7c7871">K Films &middot; 95 Christopher Columbus Dr, Jersey City, NJ 07302</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    mail.heading,
    "",
    ...mail.paragraphs.flatMap((para) => [para, ""]),
    ...(mail.button ? [`${mail.button.label}: ${mail.button.href}`, ""] : []),
    ...(mail.footnote ? [mail.footnote, ""] : []),
    "K Films · 95 Christopher Columbus Dr, Jersey City, NJ 07302",
  ].join("\n");

  return { html, text };
}

export async function sendEmail(env: PortalEnv, mail: Email): Promise<{ sent: boolean; via: string }> {
  const { html, text } = render(mail);
  const from = env.EMAIL_FROM || "";

  if (env.EMAIL && from) {
    try {
      await env.EMAIL.send({
        to: mail.to,
        from: parseFrom(from),
        subject: mail.subject,
        html,
        text,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      });
      return { sent: true, via: "cloudflare" };
    } catch (err) {
      const code = (err as { code?: string }).code || "";
      console.error("email binding send failed", code, String(err));
      if (!env.RESEND_API_KEY) return { sent: false, via: "cloudflare" };
    }
  }

  if (env.RESEND_API_KEY && from) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          html,
          text,
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
      });
      if (res.ok) return { sent: true, via: "resend" };
      console.error("resend send failed", res.status, await res.text());
    } catch (err) {
      console.error("resend send failed", String(err));
    }
    return { sent: false, via: "resend" };
  }

  console.log(`[email not configured] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${text}`);
  return { sent: false, via: "log" };
}

/** Where studio alerts go: the first ADMIN_EMAILS address. */
export function studioInbox(env: PortalEnv): string | null {
  const first = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  return first || null;
}
