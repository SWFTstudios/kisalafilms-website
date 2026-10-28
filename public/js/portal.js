/**
 * /portal — the client portal.
 *
 * Without ?job= it lists the rider's builds; with ?job=<id> it shows one:
 * the stage timeline, updates from the studio with their photos, the quote
 * (approve it here), payments (paid through Stripe Checkout), messages, the
 * brief and the rider's own photos.
 *
 * Everything comes from the /api/jobs endpoints and is drawn with DOM calls
 * and textContent, never innerHTML with data, so nothing a rider or the
 * studio types can turn into markup.
 */
(() => {
  const root = document.querySelector("[data-portal-root]");
  const loading = document.querySelector("[data-portal-loading]");
  if (!root) return;

  const track = (name, params) => window.KisalaTrack && window.KisalaTrack(name, params);

  const { h, arrow, money, when, whenTime, toast, lightbox, photoGrid, shrink } = window.KFUI;

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...options });
    if (res.status === 401) { toLogin(); throw new Error("signed out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toLogin() {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }

  /* ---- Header (both views) ---------------------------------------------- */
  let me = null;

  function signOut() {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => location.assign("/"));
  }

  /* ---- List view -------------------------------------------------------- */
  async function renderList() {
    const { jobs } = await api("/api/jobs");
    const first = (me.customer.name || "").split(" ")[0];
    root.replaceChildren(
      h("div", { class: "portal-head" },
        h("div", null,
          h("p", { class: "label", text: "Client portal" }),
          h("h1", { class: "display-l" }, first ? `Hello, ${first}.` : "Your builds.")),
        h("div", { class: "actions" },
          me.isAdmin ? h("a", { class: "btn", href: "/admin" }, "Studio admin") : null,
          h("a", { class: "btn", href: "/book" }, "Start another build"),
          h("button", { class: "btn", type: "button", onclick: signOut }, "Sign out"))),
      jobs.length
        ? h("div", { class: "job-cards" }, jobs.map((j) =>
            h("a", { class: "job-card", href: `/portal?job=${encodeURIComponent(j.id)}`, onclick: (e) => { e.preventDefault(); openJob(j.id); } },
              h("div", { class: "job-card-media" },
                j.coverPhoto ? h("img", { src: j.coverPhoto, alt: "", loading: "lazy" }) : h("span", { class: "label", text: j.ref })),
              h("div", { class: "job-card-body" },
                h("span", { class: `stage-pill${j.stage === "complete" ? " stage-pill--done" : ""}${j.stage === "cancelled" ? " stage-pill--cancelled" : ""}`, text: j.stageLabel }),
                h("h2", { text: j.bike }),
                h("p", { class: "meta", text: `${j.ref} · ${j.service || "Build"} · updated ${when(j.updatedAt)}` })))))
        : h("div", { class: "portal-empty" },
            h("p", { class: "display-s", text: "No builds yet." }),
            h("p", { class: "body", text: "Start one and it appears here, with your quote and every update." }),
            h("a", { class: "btn btn--solid", href: "/book" }, "Start your build ", arrow()))
    );
    document.title = "Your Builds | K Films Client Portal";
  }

  /* ---- Job view --------------------------------------------------------- */
  async function renderJob(id) {
    const d = await api(`/api/jobs/${encodeURIComponent(id)}`);
    const { job, bike, stages, events, photos, messages, quotes, payments } = d;
    const stageIndex = stages.findIndex((s) => s.id === job.stage);
    const current = stages[stageIndex];
    const studioPhotos = photos.filter((p) => p.kind === "progress");
    const myPhotos = photos.filter((p) => p.kind === "customer");

    /* Timeline */
    const timeline = h("section", { class: "timeline", "aria-label": "Build progress" },
      h("div", { class: "timeline-now" },
        h("p", { class: "label", text: job.stage === "cancelled" ? "Status" : `Stage ${stageIndex + 1} of ${stages.length}` }),
        h("h2", { text: job.stageLabel }),
        current ? h("p", { text: stageNote(job, current, quotes) }) : null),
      h("ol", { class: "timeline-steps" }, stages.map((s, i) =>
        h("li", { class: i < stageIndex ? "is-done" : i === stageIndex ? "is-current" : "", "aria-current": i === stageIndex ? "step" : null },
          h("span", { class: "n", text: String(i + 1).padStart(2, "0") }),
          h("span", { class: "t", text: s.label })))));

    /* Updates feed: newest first, each with the photos posted on it */
    const feed = h("div", { class: "feed" }, [...events].reverse().map((ev) => {
      const evPhotos = photos.filter((p) => p.event_id === ev.id);
      return h("article", { class: "feed-item" },
        h("div", { class: "feed-meta" },
          h("span", { class: "stage-pill", text: ev.stageLabel }),
          h("span", { class: "meta", text: whenTime(ev.created_at) })),
        ev.note ? h("p", { text: ev.note }) : null,
        evPhotos.length ? photoGrid(evPhotos) : null);
    }));
    const updates = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Updates" }), h("span", { class: "meta", text: `${events.length}` })),
      feed,
      studioPhotos.length ? h("div", { class: "panel-body" },
        h("p", { class: "label", text: "All photos from the studio" }), photoGrid(studioPhotos)) : null);

    /* Quote */
    const quote = quotes.find((q) => q.status === "sent" || q.status === "approved");
    const quotePanel = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Quote" }),
        quote ? h("span", { class: "quote-status", text: quote.status === "approved" ? "Approved" : "Ready to review" }) : null),
      h("div", { class: "panel-body" }, quote ? [
        h("table", { class: "quote-table" },
          h("tbody", null,
            quote.items.map((it) => h("tr", null,
              h("td", null, it.label, it.quantity > 1 ? h("span", { class: "qty", text: ` × ${it.quantity}` }) : null),
              h("td", { text: money(it.unit_cents * it.quantity) }))),
            h("tr", { class: "total" }, h("td", { text: "Total" }), h("td", { text: money(quote.total_cents) })),
            quote.deposit_cents ? h("tr", null, h("td", { text: "Deposit to book" }), h("td", { text: money(quote.deposit_cents) })) : null)),
        quote.notes ? h("p", { class: "body", text: quote.notes }) : null,
        quote.status === "sent"
          ? h("div", null, h("button", { class: "btn btn--solid", type: "button", onclick: (e) => approve(job.id, quote.id, e.currentTarget) }, "Approve quote ", arrow()))
          : h("p", { class: "meta", text: `Approved ${when(quote.approved_at)}.` }),
      ] : h("p", { class: "body", text: "Your written quote will appear here, usually after the studio has gone through your photos. You'll get an email when it's ready." })));

    /* Payments */
    // Unfinished checkouts are bookkeeping, not something to show the rider.
    const settled = payments.filter((p) => p.status === "paid" || p.status === "refunded");
    const paid = payments.filter((p) => p.status === "paid");
    const paidTotal = paid.reduce((n, p) => n + p.amount_cents, 0);
    const due = quote && quote.status === "approved" ? Math.max(quote.total_cents - paidTotal, 0) : 0;
    const depositDue = quote && quote.status === "approved" && !paid.some((p) => p.kind === "deposit") ? quote.deposit_cents : 0;
    const paymentsPanel = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Payments" })),
      h("div", { class: "panel-body" },
        settled.length ? h("dl", { class: "details" }, settled.map((p) =>
          h("div", null, h("dt", { class: "label", text: p.kind }),
            h("dd", { text: `${money(p.amount_cents)} · ${p.status === "paid" ? `paid ${when(p.paid_at)}` : p.status}` })))) : null,
        quote && quote.status === "approved"
          ? h("p", { class: "body", text: depositDue ? `Deposit due to hold your date: ${money(depositDue)}.` : due ? `Balance due at collection: ${money(due)}.` : "Paid in full. Thank you." })
          : h("p", { class: "body", text: "Nothing is due yet. Payments are taken here once you've approved your quote." }),
        (depositDue || due) && d.canPay ? h("button", { class: "btn btn--solid", type: "button",
          onclick: (e) => pay(job.id, depositDue ? "deposit" : "balance", e.currentTarget) }, `Pay ${money(depositDue || due)} `, arrow()) : null,
        (depositDue || due) && d.canPay ? h("p", { class: "meta", text: "Card, Apple Pay or Google Pay, through Stripe." }) : null));

    /* Messages */
    const thread = h("div", { class: "thread" }, messages.map((m) => message(m)));
    const textarea = h("textarea", { name: "body", rows: "3", placeholder: "Write to the studio", "aria-label": "Message" });
    const msgError = h("p", { class: "inline-error", hidden: true });
    const composer = h("form", { class: "composer", onsubmit: async (e) => {
      e.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      const btn = composer.querySelector("button");
      btn.disabled = true;
      msgError.hidden = true;
      try {
        const res = await api(`/api/jobs/${job.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
        thread.append(message(res.message));
        thread.scrollTop = thread.scrollHeight;
        textarea.value = "";
        track("portal_message");
      } catch (err) {
        msgError.textContent = err.message;
        msgError.hidden = false;
      } finally {
        btn.disabled = false;
      }
    } }, textarea, msgError,
      h("div", { class: "composer-row" }, h("span", { class: "meta", text: "The studio gets an email and replies here." }),
        h("button", { class: "btn btn--solid btn--small", type: "submit" }, "Send")));
    const messagesPanel = h("section", { class: "panel", id: "messages" },
      h("div", { class: "panel-head" }, h("h2", { text: "Messages" })), thread, composer);

    /* Brief */
    const notesBox = h("textarea", { rows: "4", "aria-label": "Notes" });
    notesBox.value = job.notes || "";
    const datesBox = h("input", { type: "text", "aria-label": "Preferred dates" });
    datesBox.value = job.preferredDates || "";
    const brief = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Your brief" })),
      h("div", { class: "panel-body" },
        h("dl", { class: "details" },
          row("Bike", bike ? bike.label : ""),
          row("Bike colour", bike && bike.colour),
          row("Work", job.serviceLabel),
          row("Coverage", job.coverage),
          row("Panels", (job.panels || []).join(", ")),
          row("Finish", job.finish),
          row("Colour", job.colour),
          row("Getting here", job.handoff ? `${job.handoff}${job.pickupZip ? `, ${job.pickupZip}` : ""}` : ""),
          row("Ballpark", job.estimate ? `${money(job.estimate.low * 100)}–${money(job.estimate.high * 100)}` : ""),
          job.editable ? null : row("Notes", job.notes),
          job.editable ? null : row("Dates", job.preferredDates)),
        job.editable ? h("form", { class: "form", onsubmit: async (e) => {
          e.preventDefault();
          try {
            await api(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesBox.value, preferredDates: datesBox.value }) });
            toast("Saved.");
          } catch (err) { toast(err.message); }
        } },
          h("div", { class: "field" }, h("label", { class: "label", text: "Notes" }), notesBox),
          h("div", { class: "field" }, h("label", { class: "label", text: "Preferred dates" }), datesBox),
          h("div", null, h("button", { class: "btn btn--small", type: "submit" }, "Save changes"))) : null));

    /* My photos */
    const addTile = job.editable ? h("label", { class: "photo-add" },
      h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/heic,image/heif", multiple: true, "aria-label": "Add photos", onchange: (e) => addPhotos(job.id, e.target) }),
      "+ Add photos") : null;
    const mine = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Your photos" }), h("span", { class: "meta", text: `${myPhotos.length}` })),
      h("div", { class: "panel-body" },
        myPhotos.length || addTile ? photoGrid(myPhotos, addTile) : h("p", { class: "meta", text: "No photos." })));

    /* Aftercare */
    const care = job.stage === "ready" || job.stage === "complete" ? h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Caring for your film" })),
      h("div", { class: "panel-body" },
        h("ul", { class: "lines" },
          [["Give it a week", "Let the film settle for about a week before the first wash."],
           ["Hand wash", "Two buckets and a soft mitt. Keep pressure washers away from edges."],
           ["Right products", "No abrasive polish; matte-safe products on matte and satin film."],
           ["Store it covered", "Sun ages film fastest. A garage or breathable cover adds years."]]
            .map(([t, p], i) => h("li", null, h("span", { text: String(i + 1).padStart(2, "0") }), h("div", null, h("h3", { text: t }), h("p", { text: p }))))))) : null;

    const alertText = quote && quote.status === "sent"
      ? "Your quote is ready to review."
      : depositDue ? `Deposit of ${money(depositDue)} due to hold your date.`
      : job.stage === "ready" && due ? `Your bike is ready. Balance due: ${money(due)}.` : "";
    const jump = (el) => () => el.scrollIntoView({ behavior: "smooth", block: "start" });
    const alertBox = alertText ? h("div", { class: "job-alert", role: "status" },
      h("p", { text: alertText }),
      h("button", { class: "btn btn--small btn--solid", type: "button", onclick: jump(quote && quote.status === "sent" ? quotePanel : paymentsPanel) },
        quote && quote.status === "sent" ? "Review quote" : "View payment")) : null;

    // replaceChildren would write a null out as the text "null".
    root.replaceChildren(...[
      h("div", { class: "job-head" },
        h("nav", { class: "crumbs label", "aria-label": "Breadcrumb" },
          h("a", { href: "/portal", onclick: (e) => { e.preventDefault(); openList(); } }, "Your builds"),
          h("span", { "aria-hidden": "true" }, "/"), h("span", { text: job.ref })),
        h("h1", { class: "display-l", text: bike ? bike.label : job.ref }),
        h("div", { class: "meta-row" },
          h("span", { class: "meta", text: `${job.ref} · ${job.serviceLabel} · started ${when(job.createdAt)}` }),
          me.isAdmin ? h("a", { class: "link-line", href: `/admin?job=${job.id}` }, "Open in admin") : null)),
      alertBox,
      timeline,
      h("div", { class: "job-grid" },
        h("div", { class: "job-col" }, updates, care, messagesPanel),
        h("div", { class: "job-col" }, quotePanel, paymentsPanel, brief, mine)),
    ].filter(Boolean));

    thread.scrollTop = thread.scrollHeight;
    document.title = `${job.ref} · ${bike ? bike.label : "Build"} | K Films Client Portal`;
  }

  /** The stage's line, unless the rider has already done what it asks. */
  function stageNote(job, current, quotes) {
    if (job.stage === "quoted" && quotes.some((q) => q.status === "approved")) {
      return "Quote approved. Pay the deposit to hold your studio date.";
    }
    return current.customer;
  }

  function row(label, value) {
    if (!value) return null;
    return h("div", null, h("dt", { class: "label", text: label }), h("dd", { text: value }));
  }

  function message(m) {
    const mine = me.isAdmin ? m.author === "studio" : m.author === "customer";
    return h("div", { class: `msg${mine ? " msg--mine" : ""}` },
      h("span", { class: "meta", text: `${m.author === "studio" ? "K Films studio" : "You"} · ${whenTime(m.created_at)}` }),
      h("p", { text: m.body }));
  }

  async function pay(jobId, kind, button) {
    button.disabled = true;
    try {
      const { url } = await api(`/api/jobs/${jobId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
      });
      track("portal_checkout", { kind });
      location.assign(url);
    } catch (err) {
      button.disabled = false;
      toast(err.message);
    }
  }

  /** Back from Stripe: confirm the session so the page is right straight away,
   *  without waiting on the webhook. */
  async function settleReturn(jobId) {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get("paid");
    if (params.has("cancelled")) toast("Payment cancelled. Nothing was charged.");
    if (!sessionId && !params.has("cancelled")) return;
    history.replaceState(null, "", `/portal?job=${encodeURIComponent(jobId)}`);
    if (!sessionId) return;
    try {
      const res = await api(`/api/jobs/${jobId}/checkout/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }),
      });
      toast(res.status === "paid" ? "Payment received. Thank you." : "Payment is processing. This page updates when it clears.");
      track("portal_payment_return", { status: res.status });
    } catch (err) {
      toast(err.message);
    }
  }

  async function approve(jobId, quoteId, button) {
    button.disabled = true;
    try {
      await api(`/api/jobs/${jobId}/quotes/${quoteId}/approve`, { method: "POST" });
      track("portal_quote_approved");
      toast("Quote approved.");
      renderJob(jobId);
    } catch (err) {
      button.disabled = false;
      toast(err.message);
    }
  }

  async function addPhotos(jobId, input) {
    const files = [...input.files];
    input.value = "";
    toast(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    for (const file of files) {
      const blob = await shrink(file);
      try {
        await api(`/api/jobs/${jobId}/photos`, { method: "POST", headers: { "Content-Type": blob.type || file.type || "image/jpeg" }, body: blob });
      } catch (err) {
        toast(err.message);
        break;
      }
    }
    renderJob(jobId);
  }

  /* ---- Routing ---------------------------------------------------------- */
  function show(promise) {
    return promise
      .catch((err) => {
        if (err.message === "signed out") return;
        root.replaceChildren(h("div", { class: "portal-empty" },
          h("p", { class: "display-s", text: "That build couldn't be opened." }),
          h("p", { class: "body", text: err.message }),
          h("a", { class: "btn", href: "/portal" }, "Your builds")));
      })
      .finally(() => { loading.hidden = true; });
  }
  function openJob(id) {
    history.pushState(null, "", `/portal?job=${encodeURIComponent(id)}`);
    window.scrollTo(0, 0);
    show(renderJob(id));
  }
  function openList() {
    history.pushState(null, "", "/portal");
    show(renderList());
  }
  function route() {
    const id = new URLSearchParams(location.search).get("job");
    return show(id ? settleReturn(id).then(() => renderJob(id)) : renderList());
  }
  window.addEventListener("popstate", route);
  // Coming back to the tab picks up anything the studio posted meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !document.querySelector(".lightbox") && !document.activeElement.closest("form")) route();
  });

  fetch("/api/me", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((data) => {
      if (!data.signedIn) return toLogin();
      me = data;
      route();
    })
    .catch(() => toLogin());
})();
