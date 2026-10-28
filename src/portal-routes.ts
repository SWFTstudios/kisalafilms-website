/**
 * Routing for the portal API: sign-in, photos, jobs, the studio admin and
 * the public feed of published builds. Returns null for any
 * path it does not own, so index.ts can fall through to the rest.
 */
import {
  handleAdminJobs,
  handleAdminPayment,
  handleAdminPhoto,
  handleAdminPublish,
  handleAdminQuote,
  handleAdminStage,
  handleAdminUpdate,
  handlePublicBuilds,
} from "./admin";
import { handleAuthCode, handleAuthRequest, handleAuthVerify, handleLogout, handleMe } from "./auth";
import { json, type PortalEnv } from "./http";
import {
  handleApproveQuote,
  handleCreateJob,
  handleGetJob,
  handleListJobs,
  handlePostMessage,
  handleUpdateJob,
} from "./portal";
import { handleCheckout, handleCheckoutConfirm, handlePaymentLink } from "./payments";
import { handleDraftDelete, handleDraftUpload, handleJobUpload, handlePhoto } from "./uploads";

type Route = {
  method: string;
  pattern: RegExp;
  handle: (request: Request, env: PortalEnv, params: string[]) => Promise<Response>;
};

const ID = "([A-Za-z0-9_]{4,80})";

const ROUTES: Route[] = [
  { method: "POST", pattern: /^\/api\/auth\/request$/, handle: (r, e) => handleAuthRequest(r, e) },
  { method: "GET", pattern: /^\/api\/auth\/verify$/, handle: (r, e) => handleAuthVerify(r, e) },
  { method: "POST", pattern: /^\/api\/auth\/code$/, handle: (r, e) => handleAuthCode(r, e) },
  { method: "POST", pattern: /^\/api\/auth\/logout$/, handle: (r, e) => handleLogout(r, e) },
  { method: "GET", pattern: /^\/api\/me$/, handle: (r, e) => handleMe(r, e) },

  { method: "POST", pattern: /^\/api\/uploads$/, handle: (r, e) => handleDraftUpload(r, e) },
  { method: "DELETE", pattern: new RegExp(`^/api/uploads/${ID}$`), handle: (r, e, [p]) => handleDraftDelete(r, e, p) },
  { method: "GET", pattern: new RegExp(`^/api/photos/${ID}$`), handle: (r, e, [p]) => handlePhoto(r, e, p) },

  { method: "POST", pattern: /^\/api\/jobs$/, handle: (r, e) => handleCreateJob(r, e) },
  { method: "GET", pattern: /^\/api\/jobs$/, handle: (r, e) => handleListJobs(r, e) },
  { method: "GET", pattern: new RegExp(`^/api/jobs/${ID}$`), handle: (r, e, [j]) => handleGetJob(r, e, j) },
  { method: "PATCH", pattern: new RegExp(`^/api/jobs/${ID}$`), handle: (r, e, [j]) => handleUpdateJob(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/jobs/${ID}/messages$`), handle: (r, e, [j]) => handlePostMessage(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/jobs/${ID}/photos$`), handle: (r, e, [j]) => handleJobUpload(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/jobs/${ID}/quotes/${ID}/approve$`), handle: (r, e, [j, q]) => handleApproveQuote(r, e, j, q) },

  { method: "GET", pattern: /^\/api\/admin\/jobs$/, handle: (r, e) => handleAdminJobs(r, e) },
  { method: "PATCH", pattern: new RegExp(`^/api/admin/jobs/${ID}$`), handle: (r, e, [j]) => handleAdminUpdate(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/stage$`), handle: (r, e, [j]) => handleAdminStage(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/photos$`), handle: (r, e, [j]) => handleAdminPhoto(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/quotes$`), handle: (r, e, [j]) => handleAdminQuote(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/payments$`), handle: (r, e, [j]) => handleAdminPayment(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/publish$`), handle: (r, e, [j]) => handleAdminPublish(r, e, j) },

  { method: "POST", pattern: new RegExp(`^/api/admin/jobs/${ID}/payment-link$`), handle: (r, e, [j]) => handlePaymentLink(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/jobs/${ID}/checkout$`), handle: (r, e, [j]) => handleCheckout(r, e, j) },
  { method: "POST", pattern: new RegExp(`^/api/jobs/${ID}/checkout/confirm$`), handle: (r, e, [j]) => handleCheckoutConfirm(r, e, j) },

  { method: "GET", pattern: /^\/api\/builds$/, handle: (r, e) => handlePublicBuilds(r, e) },
];

export async function routePortal(request: Request, env: PortalEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  let pathMatched = false;
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (!match) continue;
    pathMatched = true;
    if (route.method !== request.method) continue;
    if (!env.DB) return json({ error: "D1 database is not bound." }, 503);
    try {
      return await route.handle(request, env, match.slice(1));
    } catch (err) {
      console.error("portal route failed", request.method, path, String(err));
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  }
  return pathMatched ? json({ error: "Method not allowed." }, 405) : null;
}
