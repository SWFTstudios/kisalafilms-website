/**
 * Photos, stored in R2 (the PHOTOS bucket) and indexed in the `photos` table.
 *
 *   POST   /api/uploads?draft=…        one image as the raw request body, from
 *                                      the intake form before the job exists
 *   DELETE /api/uploads/:id?draft=…    take one back off the draft
 *   POST   /api/jobs/:id/photos        one image, signed in, onto an existing job
 *   GET    /api/photos/:id             the image, to its owner or the studio
 *
 * A draft id is minted in the browser and is the only thing tying anonymous
 * uploads together, so it is treated like a bearer secret: long, random, never
 * listed. Drafts that never become a job are orphaned objects; they are small,
 * capped per draft, and can be swept by draft_id later.
 *
 * The browser compresses before upload (see the intake wizard), so the size
 * cap is generous for a phone photo rather than tight.
 */
import { currentViewer, type Viewer } from "./auth";
import { id, json, now, type PortalEnv } from "./http";
import { EDITABLE_STAGES } from "./stages";

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_DRAFT = 20;
export const MAX_PHOTOS_PER_JOB = 60;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const DRAFT_ID = /^d_[A-Za-z0-9_-]{20,64}$/;

export function validDraft(value: string | null): value is string {
  return !!value && DRAFT_ID.test(value);
}

type PhotoRow = {
  id: string;
  job_id: string | null;
  draft_id: string | null;
  r2_key: string;
  content_type: string;
};

async function storeBody(
  request: Request,
  env: PortalEnv,
  keyPrefix: string
): Promise<{ key: string; type: string; bytes: number; photoId: string } | Response> {
  if (!env.PHOTOS) return json({ error: "Photo storage is not configured." }, 503);

  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json({ error: "Photos must be JPEG, PNG, WebP or HEIC." }, 415);

  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > MAX_PHOTO_BYTES) return json({ error: "That photo is over 15 MB." }, 413);

  // Read it whole: the size has to be known for the cap, and a phone photo
  // after in-browser compression is a few hundred KB.
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "Empty upload." }, 400);
  if (body.byteLength > MAX_PHOTO_BYTES) return json({ error: "That photo is over 15 MB." }, 413);

  const photoId = id("ph");
  const key = `${keyPrefix}/${photoId}.${ext}`;
  await env.PHOTOS.put(key, body, { httpMetadata: { contentType: type } });
  return { key, type, bytes: body.byteLength, photoId };
}

export async function handleDraftUpload(request: Request, env: PortalEnv): Promise<Response> {
  const draft = new URL(request.url).searchParams.get("draft");
  if (!validDraft(draft)) return json({ error: "Missing or invalid draft id." }, 400);

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE draft_id = ?")
    .bind(draft)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_DRAFT) {
    return json({ error: `Up to ${MAX_PHOTOS_PER_DRAFT} photos per build.` }, 409);
  }

  const stored = await storeBody(request, env, `drafts/${draft}`);
  if (stored instanceof Response) return stored;

  await env.DB.prepare(
    "INSERT INTO photos (id, draft_id, kind, r2_key, content_type, bytes, created_at) VALUES (?, ?, 'customer', ?, ?, ?, ?)"
  )
    .bind(stored.photoId, draft, stored.key, stored.type, stored.bytes, now())
    .run();

  return json({ ok: true, id: stored.photoId, url: `/api/photos/${stored.photoId}?draft=${draft}` }, 201);
}

export async function handleDraftDelete(request: Request, env: PortalEnv, photoId: string): Promise<Response> {
  const draft = new URL(request.url).searchParams.get("draft");
  if (!validDraft(draft)) return json({ error: "Missing or invalid draft id." }, 400);
  const row = await env.DB.prepare(
    "SELECT id, r2_key FROM photos WHERE id = ? AND draft_id = ? AND job_id IS NULL"
  )
    .bind(photoId, draft)
    .first<{ id: string; r2_key: string }>();
  if (!row) return json({ error: "Not found." }, 404);
  await env.PHOTOS?.delete(row.r2_key);
  await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(row.id).run();
  return json({ ok: true });
}

/** Signed-in upload onto a job: the owner before check-in, or the studio any time. */
export async function handleJobUpload(
  request: Request,
  env: PortalEnv,
  jobId: string,
  options: { kind: "customer" | "progress"; eventId?: string; caption?: string } = { kind: "customer" }
): Promise<Response> {
  const viewer = await currentViewer(request, env);
  if (!viewer) return json({ error: "Sign in first." }, 401);

  const job = await env.DB.prepare("SELECT id, customer_id, stage FROM jobs WHERE id = ?")
    .bind(jobId)
    .first<{ id: string; customer_id: string; stage: string }>();
  if (!job || (!viewer.isAdmin && job.customer_id !== viewer.customer.id)) {
    return json({ error: "Not found." }, 404);
  }
  if (!viewer.isAdmin && !EDITABLE_STAGES.has(job.stage)) {
    return json({ error: "Your bike is already in the studio, so photos can't be added now. Send a message instead." }, 409);
  }
  const kind = viewer.isAdmin ? options.kind : "customer";

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE job_id = ?")
    .bind(jobId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_JOB) return json({ error: "This build has the maximum number of photos." }, 409);

  const stored = await storeBody(request, env, `jobs/${jobId}`);
  if (stored instanceof Response) return stored;

  await env.DB.prepare(
    "INSERT INTO photos (id, job_id, event_id, kind, r2_key, content_type, bytes, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(stored.photoId, jobId, options.eventId || null, kind, stored.key, stored.type, stored.bytes, options.caption || null, now())
    .run();

  return json({ ok: true, id: stored.photoId, url: `/api/photos/${stored.photoId}` }, 201);
}

async function canSee(request: Request, env: PortalEnv, photo: PhotoRow, viewer: Viewer | null): Promise<boolean> {
  if (photo.job_id) {
    if (!viewer) return false;
    if (viewer.isAdmin) return true;
    const job = await env.DB.prepare("SELECT customer_id FROM jobs WHERE id = ?")
      .bind(photo.job_id)
      .first<{ customer_id: string }>();
    return job?.customer_id === viewer.customer.id;
  }
  // Still on a draft: whoever holds the draft id, i.e. the browser that uploaded it.
  return !!photo.draft_id && new URL(request.url).searchParams.get("draft") === photo.draft_id;
}

export async function handlePhoto(request: Request, env: PortalEnv, photoId: string): Promise<Response> {
  if (!env.PHOTOS) return json({ error: "Photo storage is not configured." }, 503);
  const photo = await env.DB.prepare(
    "SELECT id, job_id, draft_id, r2_key, content_type FROM photos WHERE id = ?"
  )
    .bind(photoId)
    .first<PhotoRow>();
  const viewer = photo?.job_id ? await currentViewer(request, env) : null;
  if (!photo || !(await canSee(request, env, photo, viewer))) return json({ error: "Not found." }, 404);

  const object = await env.PHOTOS.get(photo.r2_key);
  if (!object) return json({ error: "Not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": photo.content_type,
      // Private to the signed-in browser; ids never change, so it can keep them.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
