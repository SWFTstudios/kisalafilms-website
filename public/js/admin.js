/**
 * /admin — the studio side of the portal. ADMIN_EMAILS only; the API refuses
 * everyone else, so this page only decides what to draw.
 *
 * Without ?job= it is the board: a column per stage, cards dragged between
 * them (a drop opens the update dialog, so moving a bike always says why).
 * With ?job=<id> it is the workspace for one build:
 *
 *   - post an update: stage, note, photos from the phone camera, whether the
 *     customer sees it and gets an email
 *   - the full history, studio-only entries included
 *   - messages
 *   - the quote builder (draft or send), Stripe payment links, payments
 *     taken in person
 *   - the brief, the rider's photos, internal notes
 *   - publish the finished build to /builds
 *
 * Shared UI pieces come from ui.js (window.KFUI).
 */
(() => {
  const root = document.querySelector("[data-admin-root]");
  const loading = document.querySelector("[data-portal-loading]");
  if (!root) return;

  const { h, arrow, money, when, whenTime, toast, lightbox, photoGrid, shrink } = window.KFUI;
  const CONFIG = window.KISALA_CONFIG || {};

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...options });
    if (res.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new Error("signed out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  const post = (path, body, method = "POST") =>
    api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const ago = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return when(iso);
  };
  const dollars = (v) => Math.round(Number(String(v).replace(/[^0-9.-]/g, "")) * 100);

  /* ---- Pricing defaults from kisala-config.js --------------------------- */
  const round25 = (n) => Math.round(n / 25) * 25;
  function servicePrice(key) {
    const entry = (CONFIG.services || {})[key];
    if (!entry || !entry.founding) return null;
    if (CONFIG.pricingMode !== "standard") return entry.founding;
    if (entry.standard) return entry.standard;
    const up = CONFIG.standardUplift || 1;
    return { low: round25(entry.founding.low * up), high: round25(entry.founding.high * up) };
  }
  const transportFee = (id) => (Object.values(CONFIG.transport || {}).find((t) => t.id === id) || {}).fee || 0;
  const depositFor = (cents) => round25(((CONFIG.deposit && CONFIG.deposit.percent) || 0.25) * cents / 100) * 100;

  /* ---- Update dialog (used by the board's drag and drop) ---------------- */
  function updateDialog(job, stages, stage) {
    return new Promise((resolve) => {
      const select = h("select", { "aria-label": "Stage" }, stages.map((s) => h("option", { value: s.id, selected: s.id === stage ? true : null }, s.label)));
      const note = h("textarea", { rows: "3", placeholder: "What should the customer know? (optional)", "aria-label": "Note" });
      const notify = h("input", { type: "checkbox", checked: true });
      const close = (value) => { back.remove(); resolve(value); };
      const back = h("div", { class: "dialog-backdrop", onclick: (e) => { if (e.target === back) close(null); } },
        h("form", { class: "dialog panel-body", onsubmit: (e) => { e.preventDefault(); close({ stage: select.value, note: note.value, notify: notify.checked }); } },
          h("h2", { text: `${job.ref} · ${job.bike}` }),
          h("div", null, h("label", { class: "label", text: "Move to" }), select),
          h("div", null, h("label", { class: "label", text: "Note" }), note),
          h("label", { class: "toggle" }, notify, "Email the customer"),
          h("div", { class: "dialog-actions" },
            h("button", { class: "btn", type: "button", onclick: () => close(null) }, "Cancel"),
            h("button", { class: "btn btn--solid", type: "submit" }, "Move ", arrow()))));
      document.body.append(back);
      note.focus();
    });
  }

  /* ---- Board ------------------------------------------------------------ */
  let boardState = { q: "", showDone: false };

  async function renderBoard() {
    const { jobs, stages } = await api("/api/admin/jobs");
    const search = h("input", { type: "search", placeholder: "Search ref, bike, name or email", value: boardState.q, "aria-label": "Search builds" });
    const showDone = h("input", { type: "checkbox", checked: boardState.showDone ? true : null });
    const boardEl = h("div", { class: "board" });

    const open = jobs.filter((j) => !["complete", "cancelled"].includes(j.stage));
    const unread = jobs.reduce((n, j) => n + j.unread, 0);
    const pipeline = open.reduce((n, j) => n + (j.quote ? j.quote.totalCents : 0), 0);
    const owed = open.reduce((n, j) => n + (j.quote && j.quote.status === "approved" ? Math.max(j.quote.totalCents - j.paidCents, 0) : 0), 0);

    function draw() {
      const q = boardState.q.toLowerCase();
      const visibleStages = stages.filter((s) => boardState.showDone || !["complete", "cancelled"].includes(s.id));
      const match = (j) => !q || [j.ref, j.bike, j.customer.name, j.customer.email, j.service].join(" ").toLowerCase().includes(q);
      boardEl.replaceChildren(...visibleStages.map((s) => {
        const items = jobs.filter((j) => j.stage === s.id && match(j));
        const body = h("div", { class: "board-col-body" }, items.map(card));
        const col = h("section", { class: "board-col", "aria-label": s.label,
          ondragover: (e) => { e.preventDefault(); col.classList.add("is-over"); },
          ondragleave: () => col.classList.remove("is-over"),
          ondrop: async (e) => {
            e.preventDefault();
            col.classList.remove("is-over");
            const job = jobs.find((j) => j.id === e.dataTransfer.getData("text/plain"));
            if (!job || job.stage === s.id) return;
            const result = await updateDialog(job, stages, s.id);
            if (!result) return;
            try {
              await post(`/api/admin/jobs/${job.id}/stage`, { stage: result.stage, note: result.note, notify: result.notify });
              toast(`${job.ref} moved to ${stages.find((x) => x.id === result.stage).label}.`);
              renderBoard();
            } catch (err) { toast(err.message); }
          } },
          h("div", { class: "board-col-head" }, h("h2", { text: s.label }), h("span", { class: "meta", text: String(items.length) })),
          body);
        return col;
      }));
    }

    function card(j) {
      const badges = [
        j.unread ? h("span", { class: "badge badge--alert", text: `${j.unread} new message${j.unread > 1 ? "s" : ""}` }) : null,
        j.quote ? h("span", { class: `badge${j.quote.status === "approved" ? " badge--good" : ""}`, text: `Quote ${j.quote.status} · ${money(j.quote.totalCents)}` }) : null,
        j.paidCents ? h("span", { class: "badge badge--good", text: `Paid ${money(j.paidCents)}` }) : null,
        j.photos ? h("span", { class: "badge", text: `${j.photos} photo${j.photos > 1 ? "s" : ""}` }) : null,
        j.published ? h("span", { class: "badge badge--good", text: "On /builds" }) : null,
      ];
      return h("a", { class: "board-card", href: `/admin?job=${j.id}`, draggable: "true",
        ondragstart: (e) => { e.dataTransfer.setData("text/plain", j.id); e.currentTarget.classList.add("is-dragging"); },
        ondragend: (e) => e.currentTarget.classList.remove("is-dragging"),
        onclick: (e) => { e.preventDefault(); openJob(j.id); } },
        h("span", { class: "meta", text: `${j.ref} · ${ago(j.updatedAt)}` }),
        h("h3", { text: j.bike }),
        h("span", { class: "meta", text: `${j.customer.name || j.customer.email} · ${j.service || ""}` }),
        h("div", { class: "badges" }, badges));
    }

    search.addEventListener("input", () => { boardState.q = search.value; draw(); });
    showDone.addEventListener("change", () => { boardState.showDone = showDone.checked; draw(); });

    root.replaceChildren(
      h("div", { class: "portal-head" },
        h("div", null, h("p", { class: "label", text: "Studio admin" }), h("h1", { class: "display-l", text: "The board." })),
        h("div", { class: "actions" },
          h("a", { class: "btn", href: "/portal" }, "My portal"),
          h("button", { class: "btn", type: "button", onclick: () => fetch("/api/auth/logout", { method: "POST" }).finally(() => location.assign("/")) }, "Sign out"))),
      h("div", { class: "board-tools" },
        search,
        h("label", { class: "toggle" }, showDone, "Show complete & cancelled"),
        h("dl", { class: "board-stats" },
          h("div", null, h("dt", { class: "label", text: "Open builds" }), h("dd", { text: String(open.length) })),
          h("div", null, h("dt", { class: "label", text: "Unread" }), h("dd", { text: String(unread) })),
          h("div", null, h("dt", { class: "label", text: "Quoted" }), h("dd", { text: money(pipeline) })),
          h("div", null, h("dt", { class: "label", text: "Owed" }), h("dd", { text: money(owed) })))),
      boardEl);
    draw();
    document.title = "Board | K Films Studio";
  }

  /* ---- Workspace -------------------------------------------------------- */
  async function renderJob(id) {
    const d = await api(`/api/jobs/${encodeURIComponent(id)}`);
    const { job, bike, stages, events, photos, messages, quotes, payments } = d;
    const allStages = [...stages, { id: "cancelled", label: "Cancelled" }];
    const reload = () => renderJob(id);
    const customerPhotos = photos.filter((p) => p.kind === "customer");
    const studioPhotos = photos.filter((p) => p.kind === "progress");
    const c = job.customer || {};

    /* Post an update */
    const stageSel = h("select", { "aria-label": "Stage" }, allStages.map((s) => h("option", { value: s.id, selected: s.id === job.stage ? true : null }, s.label)));
    const noteBox = h("textarea", { rows: "3", placeholder: "Fairings off and decontaminated…", "aria-label": "Note" });
    const files = h("input", { type: "file", accept: "image/*", multiple: true, "aria-label": "Photos" });
    const visible = h("input", { type: "checkbox", checked: true });
    const notify = h("input", { type: "checkbox", checked: true });
    visible.addEventListener("change", () => { notify.disabled = !visible.checked; if (!visible.checked) notify.checked = false; });
    const updateForm = h("form", { class: "panel-body", onsubmit: async (e) => {
      e.preventDefault();
      const btn = updateForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const chosen = [...files.files];
        const res = await post(`/api/admin/jobs/${job.id}/stage`, {
          stage: stageSel.value,
          note: noteBox.value || (chosen.length ? "New photos from the studio." : ""),
          visible: visible.checked,
          notify: notify.checked,
        });
        for (const [i, file] of chosen.entries()) {
          btn.textContent = `Uploading ${i + 1} of ${chosen.length}…`;
          const blob = await shrink(file);
          await api(`/api/admin/jobs/${job.id}/photos?event=${res.eventId}`, { method: "POST", headers: { "Content-Type": blob.type || file.type || "image/jpeg" }, body: blob });
        }
        toast("Update posted.");
        reload();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = "Post update";
      }
    } },
      h("div", { class: "row-2" },
        h("div", null, h("label", { class: "label", text: "Stage" }), stageSel),
        h("div", null, h("label", { class: "label", text: "Photos" }), files)),
      h("div", null, h("label", { class: "label", text: "Note" }), noteBox),
      h("div", { class: "checks" },
        h("label", { class: "toggle" }, visible, "Customer can see it"),
        h("label", { class: "toggle" }, notify, "Email the customer")),
      h("div", null, h("button", { class: "btn btn--solid", type: "submit" }, "Post update")));
    const updatePanel = h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", { text: "Post an update" })), updateForm);

    /* History */
    const history = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "History" }), h("span", { class: "meta", text: String(events.length) })),
      h("div", { class: "feed" }, [...events].reverse().map((ev) => {
        const evPhotos = photos.filter((p) => p.event_id === ev.id);
        return h("article", { class: `feed-item${ev.visible ? "" : " is-private"}` },
          h("div", { class: "feed-meta" },
            h("span", { class: "stage-pill", text: ev.stageLabel }),
            h("span", { class: "meta", text: `${whenTime(ev.created_at)} · ${ev.author}${ev.visible ? "" : " · studio only"}` })),
          ev.note ? h("p", { text: ev.note }) : null,
          evPhotos.length ? photoGrid(evPhotos) : null);
      })));

    /* Messages */
    const thread = h("div", { class: "thread" }, messages.map((m) => h("div", { class: `msg${m.author === "studio" ? " msg--mine" : ""}` },
      h("span", { class: "meta", text: `${m.author === "studio" ? "Studio" : c.name || "Customer"} · ${whenTime(m.created_at)}` }),
      h("p", { text: m.body }))));
    const reply = h("textarea", { rows: "3", placeholder: `Reply to ${c.name || "the customer"}`, "aria-label": "Reply" });
    const messagesPanel = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Messages" })),
      thread,
      h("form", { class: "composer", onsubmit: async (e) => {
        e.preventDefault();
        if (!reply.value.trim()) return;
        try { await post(`/api/jobs/${job.id}/messages`, { body: reply.value }); toast("Sent."); reload(); }
        catch (err) { toast(err.message); }
      } }, reply,
        h("div", { class: "composer-row" }, h("span", { class: "meta", text: "They get an email with a link back here." }),
          h("button", { class: "btn btn--solid btn--small", type: "submit" }, "Send"))));

    /* Quote builder */
    const live = quotes.find((q) => q.status !== "superseded");
    const tbody = h("tbody");
    const depositInput = h("input", { type: "text", inputmode: "decimal", "aria-label": "Deposit" });
    const notesInput = h("textarea", { rows: "2", placeholder: "Anything the customer should know about this quote", "aria-label": "Quote notes" });
    const totalEl = h("span", { class: "qb-total" });
    let depositTouched = false;

    function addLine(label = "", qty = 1, cents = "") {
      const tr = h("tr", null,
        h("td", null, h("input", { type: "text", value: label, placeholder: "Description", "aria-label": "Description", class: "qb-label" })),
        h("td", null, h("input", { type: "number", min: "1", max: "99", value: String(qty), "aria-label": "Quantity", class: "qb-qty" })),
        h("td", null, h("input", { type: "text", inputmode: "decimal", value: cents === "" ? "" : (cents / 100).toFixed(2), placeholder: "0.00", "aria-label": "Unit price", class: "qb-price" })),
        h("td", null, h("button", { class: "qb-remove", type: "button", "aria-label": "Remove line", onclick: () => { tr.remove(); recalc(); } }, "×")));
      tbody.append(tr);
    }
    function lines() {
      return [...tbody.children].map((tr) => ({
        label: tr.querySelector(".qb-label").value.trim(),
        quantity: Number(tr.querySelector(".qb-qty").value) || 1,
        unitCents: dollars(tr.querySelector(".qb-price").value || 0),
      })).filter((l) => l.label);
    }
    function recalc() {
      const total = lines().reduce((n, l) => n + l.quantity * l.unitCents, 0);
      totalEl.textContent = money(total);
      if (!depositTouched) depositInput.value = (depositFor(total) / 100).toFixed(2);
    }
    if (live) {
      live.items.forEach((it) => addLine(it.label, it.quantity, it.unit_cents));
      depositInput.value = (live.deposit_cents / 100).toFixed(2);
      notesInput.value = live.notes || "";
      depositTouched = true;
    } else {
      const price = servicePrice(job.service);
      addLine(`${job.serviceLabel || "Labour"}${job.finish ? `, ${job.finish}` : ""}${job.colour ? ` (${job.colour})` : ""}`, 1, price ? price.low * 100 : "");
      const fee = transportFee(job.handoff);
      if (fee) addLine(job.handoff === "round-trip" ? "Pickup and return delivery" : "Pickup", 1, fee * 100);
    }
    tbody.addEventListener("input", recalc);
    depositInput.addEventListener("input", () => { depositTouched = true; });
    recalc();

    async function saveQuote(send) {
      const items = lines();
      if (send && !confirm(`Send this quote (${totalEl.textContent}) to ${c.email}?`)) return;
      try {
        await post(`/api/admin/jobs/${job.id}/quotes`, { items, depositCents: dollars(depositInput.value || 0), notes: notesInput.value, send });
        toast(send ? "Quote sent." : "Draft saved.");
        reload();
      } catch (err) { toast(err.message); }
    }
    const quotePanel = h("section", { class: "panel", id: "quote" },
      h("div", { class: "panel-head" }, h("h2", { text: "Quote" }),
        live ? h("span", { class: "quote-status", text: `${live.status}${live.sent_at ? ` · sent ${when(live.sent_at)}` : ""}` }) : h("span", { class: "meta", text: "Not quoted yet" })),
      h("div", { class: "panel-body" },
        job.estimate ? h("p", { class: "meta", text: `Ballpark shown to them: ${money(job.estimate.low * 100)}–${money(job.estimate.high * 100)}` }) : null,
        h("table", { class: "qb-table" },
          h("thead", null, h("tr", null, h("th", { text: "Line" }), h("th", { text: "Qty" }), h("th", { text: "Price" }), h("th"))),
          tbody),
        h("div", null, h("button", { class: "btn btn--small", type: "button", onclick: () => { addLine(); tbody.lastChild.querySelector("input").focus(); } }, "+ Add line")),
        h("div", { class: "qb-totals" },
          h("div", null, h("p", { class: "label", text: "Total" }), totalEl),
          h("div", { style: "min-width:160px" }, h("label", { class: "label", text: "Deposit to book" }), depositInput)),
        notesInput,
        live && live.status === "approved" ? h("p", { class: "meta", text: `Approved ${when(live.approved_at)}. Sending a new quote replaces it and asks for approval again.` }) : null,
        h("div", { class: "checks" },
          h("button", { class: "btn", type: "button", onclick: () => saveQuote(false) }, "Save draft"),
          h("button", { class: "btn btn--solid", type: "button", onclick: () => saveQuote(true) }, live && live.status !== "draft" ? "Send revised quote " : "Send to customer ", arrow()))));

    /* Payments */
    const paid = payments.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_cents, 0);
    const kindSel = h("select", { "aria-label": "Payment type" }, ["deposit", "balance", "other"].map((k) => h("option", { value: k }, k)));
    const amountIn = h("input", { type: "text", inputmode: "decimal", placeholder: "0.00", "aria-label": "Amount" });
    const methodIn = h("input", { type: "text", placeholder: "Cash, Zelle…", "aria-label": "Method" });
    const paymentsPanel = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Payments" }),
        h("span", { class: "meta", text: live ? `${money(paid)} of ${money(live.total_cents)}` : money(paid) })),
      h("div", { class: "panel-body" },
        payments.length ? h("dl", { class: "details" }, payments.map((p) =>
          h("div", null, h("dt", { class: "label", text: p.kind }), h("dd", { text: `${money(p.amount_cents)} · ${p.status}${p.paid_at ? ` ${when(p.paid_at)}` : ""}` })))) : h("p", { class: "meta", text: "No payments yet." }),
        h("form", { class: "panel-body", style: "padding:0", onsubmit: async (e) => {
          e.preventDefault();
          if (!confirm(`Record ${money(dollars(amountIn.value))} ${kindSel.value} as paid? The customer gets a receipt email.`)) return;
          try { await post(`/api/admin/jobs/${job.id}/payments`, { kind: kindSel.value, amountCents: dollars(amountIn.value), method: methodIn.value }); toast("Payment recorded."); reload(); }
          catch (err) { toast(err.message); }
        } },
          d.canPay && live && live.status === "approved" ? h("div", { class: "checks" },
            h("button", { class: "btn btn--small", type: "button", onclick: () => sendLink("deposit") }, "Email deposit link"),
            h("button", { class: "btn btn--small", type: "button", onclick: () => sendLink("balance") }, "Email balance link")) : null,
          h("p", { class: "label", text: "Record a payment taken in person" }),
          h("div", { class: "row-2" }, kindSel, amountIn),
          methodIn,
          h("div", null, h("button", { class: "btn btn--small", type: "submit" }, "Record payment")))));

    async function sendLink(kind) {
      if (!confirm(`Email ${c.email} a Stripe link for the ${kind}?`)) return;
      try {
        const res = await post(`/api/admin/jobs/${job.id}/payment-link`, { kind });
        toast(`Link for ${money(res.amountCents)} sent.`);
        reload();
      } catch (err) { toast(err.message); }
    }

    /* Brief and rider photos */
    const row = (k, v) => (v ? h("div", null, h("dt", { class: "label", text: k }), h("dd", { text: v })) : null);
    const brief = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Brief" })),
      h("div", { class: "panel-body" },
        h("dl", { class: "details" },
          row("Bike", bike && bike.label), row("Colour now", bike && bike.colour), row("Mileage", bike && bike.mileage), row("VIN", bike && bike.vin),
          row("Work", job.serviceLabel), row("Coverage", job.coverage), row("Panels", (job.panels || []).join(", ")),
          row("Finish", job.finish), row("Colour", job.colour), row("Film", job.filmHandle),
          row("Getting here", job.handoff ? `${job.handoff}${job.pickupZip ? `, ${job.pickupZip}` : ""}` : ""),
          row("Dates", job.preferredDates), row("Notes", job.notes), row("Inspiration", job.inspiration)),
        customerPhotos.length ? h("div", null, h("p", { class: "label", text: `Their photos (${customerPhotos.length})` }), photoGrid(customerPhotos)) : h("p", { class: "meta", text: "No photos from the customer." })));

    /* Internal notes */
    const internal = h("textarea", { rows: "4", placeholder: "Only the studio sees this.", "aria-label": "Internal notes" });
    internal.value = job.internalNotes || "";
    internal.addEventListener("blur", async () => {
      if (internal.value === (job.internalNotes || "")) return;
      try { await post(`/api/admin/jobs/${job.id}`, { internalNotes: internal.value }, "PATCH"); job.internalNotes = internal.value; toast("Notes saved."); }
      catch (err) { toast(err.message); }
    });
    const internalPanel = h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", { text: "Internal notes" })), h("div", { class: "panel-body" }, internal));

    /* Publish */
    const titleIn = h("input", { type: "text", value: job.publicTitle || (bike ? bike.label : ""), "aria-label": "Title on /builds" });
    const summaryIn = h("textarea", { rows: "3", placeholder: "One or two lines about the build", "aria-label": "Summary on /builds" });
    summaryIn.value = job.publicSummary || "";
    const covers = h("div", { class: "cover-pick" }, studioPhotos.map((p, i) => h("label", null,
      h("input", { type: "radio", name: "cover", value: p.id, checked: p.is_cover || (!studioPhotos.some((x) => x.is_cover) && i === 0) ? true : null }),
      h("img", { src: p.url, alt: "" }))));
    const publishPanel = h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { text: "Publish to Builds" }),
        job.publishedAt ? h("a", { class: "link-line", href: `/builds/view?b=${job.id}`, target: "_blank", rel: "noopener" }, "Live") : null),
      h("div", { class: "panel-body" },
        studioPhotos.length ? [
          h("p", { class: "meta", text: "Only studio photos are published, never the customer's, their name or their notes." }),
          h("div", null, h("label", { class: "label", text: "Title" }), titleIn),
          h("div", null, h("label", { class: "label", text: "Summary" }), summaryIn),
          h("div", null, h("p", { class: "label", text: "Cover photo" }), covers),
          h("div", { class: "checks" },
            h("button", { class: "btn btn--solid", type: "button", onclick: async () => {
              const cover = covers.querySelector("input:checked");
              try { await post(`/api/admin/jobs/${job.id}/publish`, { title: titleIn.value, summary: summaryIn.value, coverPhotoId: cover ? cover.value : null }); toast("Published."); reload(); }
              catch (err) { toast(err.message); }
            } }, job.publishedAt ? "Update" : "Publish"),
            job.publishedAt ? h("button", { class: "btn", type: "button", onclick: async () => {
              try { await post(`/api/admin/jobs/${job.id}/publish`, { publish: false }); toast("Unpublished."); reload(); }
              catch (err) { toast(err.message); }
            } }, "Unpublish") : null),
        ] : h("p", { class: "meta", text: "Post an update with studio photos first." })));

    root.replaceChildren(
      h("div", { class: "job-head" },
        h("nav", { class: "crumbs label", "aria-label": "Breadcrumb" },
          h("a", { href: "/admin", onclick: (e) => { e.preventDefault(); openBoard(); } }, "Board"),
          h("span", { "aria-hidden": "true" }, "/"), h("span", { text: job.ref })),
        h("h1", { class: "display-l", text: bike ? bike.label : job.ref }),
        h("div", { class: "meta-row" },
          h("span", { class: "stage-pill", text: job.stageLabel }),
          h("span", { class: "meta", text: `${job.ref} · ${job.serviceLabel} · in ${when(job.createdAt)}` })),
        h("div", { class: "contact-row" },
          h("span", { text: c.name || "" }),
          c.email ? h("a", { href: `mailto:${c.email}` }, c.email) : null,
          c.phone ? h("a", { href: `tel:${c.phone.replace(/[^0-9+]/g, "")}` }, c.phone) : null,
          h("a", { class: "link-line", href: `/portal?job=${job.id}`, target: "_blank", rel: "noopener" }, "View as customer"))),
      h("div", { class: "job-grid" },
        h("div", { class: "job-col" }, updatePanel, history, messagesPanel),
        h("div", { class: "job-col" }, quotePanel, paymentsPanel, brief, internalPanel, publishPanel)));
    thread.scrollTop = thread.scrollHeight;
    document.title = `${job.ref} | K Films Studio`;
  }

  /* ---- Routing ---------------------------------------------------------- */
  function show(promise) {
    return promise
      .catch((err) => {
        if (err.message === "signed out") return;
        root.replaceChildren(h("div", { class: "portal-empty" }, h("p", { class: "display-s", text: err.message }), h("a", { class: "btn", href: "/admin" }, "Board")));
      })
      .finally(() => { loading.hidden = true; });
  }
  function openJob(id) { history.pushState(null, "", `/admin?job=${encodeURIComponent(id)}`); window.scrollTo(0, 0); show(renderJob(id)); }
  function openBoard() { history.pushState(null, "", "/admin"); show(renderBoard()); }
  function route() {
    const id = new URLSearchParams(location.search).get("job");
    return show(id ? renderJob(id) : renderBoard());
  }
  window.addEventListener("popstate", route);

  fetch("/api/me", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((me) => {
      if (!me.signedIn) return location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      if (!me.isAdmin) {
        loading.hidden = true;
        root.replaceChildren(h("div", { class: "portal-empty" },
          h("p", { class: "display-s", text: "This page is for the studio." }),
          h("a", { class: "btn", href: "/portal" }, "Go to your portal")));
        return;
      }
      route();
    })
    .catch(() => location.replace("/login?next=/admin"));
})();
