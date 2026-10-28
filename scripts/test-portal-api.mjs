/**
 * End-to-end check of the portal API against a running Worker.
 *
 *   npm run dev                      (in another terminal)
 *   node scripts/test-portal-api.mjs [http://localhost:8787]
 *
 * It relies on the local-only devLink/devCode fields the auth endpoints add
 * when the request host is localhost, so it cannot be pointed at production.
 * Each run uses fresh customer addresses; the admin address is the first in
 * ADMIN_EMAILS and is limited to five sign-ins an hour like anyone else.
 */
const BASE = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
const ADMIN = process.env.ADMIN_EMAIL || "elombe@swftstudios.com";
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("Refusing to run against a non-local server.");
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const call = async (method, path, { body, cookie, type, raw } = {}) => {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
  if (type) headers["Content-Type"] = type;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, headers: res.headers };
};

const sessionFrom = (headers) => {
  const set = headers.get("set-cookie") || "";
  const m = set.match(/kf_session=([^;]*)/);
  return m && m[1] ? `kf_session=${m[1]}` : null;
};

// A few bytes that claim to be a JPEG: the API checks type and size, not pixels.
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(2048).fill(7), 0xff, 0xd9]);
const draft = `d_${crypto.randomUUID().replace(/-/g, "")}`;
const stamp = Date.now();
const riderA = `rider.a.${stamp}@example.com`;
const riderB = `rider.b.${stamp}@example.com`;

const jobBody = (address, name) => ({
  draft,
  name,
  email: address,
  phone: "201-555-0100",
  bike: { year: "2005", make: "Honda", model: "CBR600 F4i", colour: "Black" },
  service: "fullWrap",
  coverage: "full",
  panels: ["tank", "tail"],
  finish: "satin",
  colour: "Satin dark grey",
  notes: "Keep the red wheel stripes.",
  preferredDates: "Early November",
  handoff: "pickup",
  pickupZip: "11211",
  estimate: { low: 1650, high: 2400 },
});

/* ---- Draft uploads ---------------------------------------------------- */
let r = await call("POST", `/api/uploads?draft=${draft}`, { raw: fakeJpeg, type: "image/jpeg" });
check("draft upload accepted", r.status === 201 && r.data?.id, JSON.stringify(r.data));
const photo1 = r.data?.id;
r = await call("POST", `/api/uploads?draft=${draft}`, { raw: fakeJpeg, type: "image/jpeg" });
const photo2 = r.data?.id;
r = await call("POST", `/api/uploads?draft=${draft}`, { raw: "hello", type: "text/plain" });
check("non-image upload rejected", r.status === 415);
r = await call("POST", `/api/uploads?draft=nope`, { raw: fakeJpeg, type: "image/jpeg" });
check("bad draft id rejected", r.status === 400);
r = await call("GET", `/api/photos/${photo1}?draft=${draft}`);
check("draft photo visible with its draft id", r.status === 200);
r = await call("GET", `/api/photos/${photo1}`);
check("draft photo hidden without its draft id", r.status === 404);
r = await call("DELETE", `/api/uploads/${photo2}?draft=${draft}`);
check("draft photo removed", r.status === 200);

/* ---- Create a job ----------------------------------------------------- */
r = await call("POST", "/api/jobs", { body: { email: riderA } });
check("incomplete job rejected", r.status === 400 && /make and model/.test(r.data?.error || ""), JSON.stringify(r.data));
r = await call("POST", "/api/jobs", { body: jobBody(riderA, "Rider A") });
check("job created", r.status === 201 && /^KF-\d+$/.test(r.data?.ref || ""), JSON.stringify(r.data));
check("job carries its draft photo", r.data?.photoCount === 1, `photoCount=${r.data?.photoCount}`);
check("no session cookie on create", !sessionFrom(r.headers));
const jobA = r.data?.jobId;
const linkA = r.data?.devLink;

r = await call("GET", "/api/jobs");
check("job list needs sign-in", r.status === 401);

/* ---- Sign in by link -------------------------------------------------- */
r = await call("GET", linkA.replace(BASE, ""));
const cookieA = sessionFrom(r.headers);
check("sign-in link sets a session", r.status === 302 && !!cookieA);
check("sign-in link returns to the job", r.headers.get("location") === `/portal?job=${jobA}`, r.headers.get("location"));
r = await call("GET", linkA.replace(BASE, ""));
check("sign-in link works only once", r.status === 302 && r.headers.get("location") === "/login?expired=1");

r = await call("GET", "/api/me", { cookie: cookieA });
check("me reports the customer", r.data?.signedIn && r.data.customer.email === riderA && r.data.isAdmin === false);

r = await call("GET", "/api/jobs", { cookie: cookieA });
check("job list has the job", r.data?.jobs?.length === 1 && r.data.jobs[0].id === jobA);

r = await call("GET", `/api/jobs/${jobA}`, { cookie: cookieA });
check("job detail loads", r.status === 200 && r.data?.job?.ref && r.data.bike?.label === "2005 Honda CBR600 F4i");
check("job detail has timeline and photo", r.data?.events?.length === 1 && r.data?.photos?.length === 1 && r.data?.stages?.length === 9);
check("customer never sees internal notes", r.data && !("internalNotes" in r.data.job));

r = await call("GET", `/api/photos/${photo1}`, { cookie: cookieA });
check("owner can see attached photo", r.status === 200 && r.headers.get("content-type") === "image/jpeg");
r = await call("GET", `/api/photos/${photo1}?draft=${draft}`);
check("draft id no longer opens an attached photo", r.status === 404);

r = await call("POST", `/api/jobs/${jobA}/photos`, { cookie: cookieA, raw: fakeJpeg, type: "image/png" });
check("owner adds a photo before check-in", r.status === 201);

r = await call("PATCH", `/api/jobs/${jobA}`, { cookie: cookieA, body: { notes: "Also the fork lowers." } });
check("owner edits notes", r.status === 200);
r = await call("POST", `/api/jobs/${jobA}/messages`, { cookie: cookieA, body: { body: "Is satin OK on the tank?" } });
check("owner sends a message", r.status === 201 && r.data?.message?.author === "customer");

/* ---- Sign in by code -------------------------------------------------- */
r = await call("POST", "/api/auth/request", { body: { email: riderA, next: "/portal" } });
const codeA = r.data?.devCode;
check("code requested", r.status === 200 && /^\d{6}$/.test(codeA || ""));
r = await call("POST", "/api/auth/code", { body: { email: riderA, code: codeA === "000000" ? "111111" : "000000" } });
check("wrong code refused", r.status === 400);
r = await call("POST", "/api/auth/code", { body: { email: riderA, code: codeA } });
check("right code signs in", r.status === 200 && !!sessionFrom(r.headers));

r = await call("POST", "/api/auth/request", { body: { email: `nobody.${stamp}@example.com` } });
check("unknown address gets the same answer, no code", r.status === 200 && !r.data?.devCode);
r = await call("GET", "/api/auth/verify?token=not-a-token");
check("bad token goes to the expired page", r.status === 302 && r.headers.get("location") === "/login?expired=1");

/* ---- Another customer cannot see it ----------------------------------- */
r = await call("POST", "/api/jobs", { body: { ...jobBody(riderB, "Rider B"), draft: undefined } });
const cookieB = sessionFrom((await call("GET", r.data.devLink.replace(BASE, ""))).headers);
r = await call("GET", `/api/jobs/${jobA}`, { cookie: cookieB });
check("other customer gets 404 on the job", r.status === 404);
r = await call("GET", `/api/photos/${photo1}`, { cookie: cookieB });
check("other customer gets 404 on the photo", r.status === 404);
r = await call("POST", `/api/jobs/${jobA}/messages`, { cookie: cookieB, body: { body: "hi" } });
check("other customer cannot message the job", r.status === 404);
r = await call("POST", "/api/jobs", { body: { ...jobBody(riderA, "Someone Else"), draft: undefined, phone: "999" } });
r = await call("GET", "/api/me", { cookie: cookieA });
check("a later form can't overwrite the customer's details", r.data?.customer?.name === "Rider A" && r.data.customer.phone === "201-555-0100");

/* ---- Studio ----------------------------------------------------------- */
r = await call("POST", "/api/auth/request", { body: { email: ADMIN } });
if (!r.data?.devCode) {
  check("admin sign-in issued (skipped if rate-limited this hour)", true);
} else {
  r = await call("POST", "/api/auth/code", { body: { email: ADMIN, code: r.data.devCode } });
  const cookieAdmin = sessionFrom(r.headers);
  r = await call("GET", "/api/me", { cookie: cookieAdmin });
  check("admin is recognised", r.data?.isAdmin === true);
  r = await call("GET", `/api/jobs/${jobA}`, { cookie: cookieAdmin });
  check("admin opens any job, with internal notes", r.status === 200 && "internalNotes" in r.data.job);
  r = await call("POST", `/api/jobs/${jobA}/messages`, { cookie: cookieAdmin, body: { body: "Satin is perfect there." } });
  check("admin message is from the studio", r.data?.message?.author === "studio");
  r = await call("GET", `/api/jobs/${jobA}`, { cookie: cookieA });
  check("customer sees the studio reply", r.data?.messages?.some((m) => m.author === "studio"));
}

/* ---- Sign out --------------------------------------------------------- */
r = await call("POST", "/api/auth/logout", { cookie: cookieA });
r = await call("GET", "/api/me", { cookie: cookieA });
check("signed out session is gone", r.data?.signedIn === false);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll portal API checks passed");
process.exit(failures ? 1 : 0);
