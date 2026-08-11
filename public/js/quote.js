/**
 * /quote — conditional fields, image uploads, validation and submission.
 *
 * Delivery is the browser's own multipart POST to FormSubmit, not an AJAX call
 * we control. That is deliberate: formsubmit.co sits behind a Cloudflare
 * managed challenge (it answers any non-browser client with `cf-mitigated:
 * challenge`), so a Worker cannot forward to it — only a real browser can. The
 * photos are the whole point of this form, and the native post is the only path
 * they survive.
 *
 * So this file never stands between the rider and the send. It validates,
 * curates the file list, fills the hidden summary field, fires a best-effort
 * record at /api/quote with keepalive so the lead lands in D1 even as the page
 * unloads, and then lets the browser submit. If /api/quote is down, or this
 * script throws before it runs, or JavaScript never loaded at all, the form
 * still posts and the lead still arrives.
 *
 * The conversion event fires on /quote-thanks rather than here, for the reason
 * analytics.js already documents: the redirect target is the only thing that
 * proves the POST completed.
 */
(() => {
  const form = document.getElementById("quote-form");
  if (!form) return;

  const CFG = (window.KisalaConfig && window.KisalaConfig.raw) || window.KISALA_CONFIG || {};
  const QUOTE = CFG.quote || {};
  const LIMITS = QUOTE.uploads || {};
  const MAX_FILES = LIMITS.maxFiles || 8;
  const MAX_FILE_BYTES = (LIMITS.maxFileMb || 5) * 1024 * 1024;
  const MAX_TOTAL_BYTES = (LIMITS.maxTotalMb || 9) * 1024 * 1024;
  const ACCEPT = LIMITS.accept || ["image/jpeg", "image/png", "image/webp"];
  const ACCEPT_LABEL = LIMITS.acceptLabel || "JPG, PNG or WEBP";

  const $ = (sel, root) => (root || form).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || form).querySelectorAll(sel));
  /* The summary aside is a sibling of the form, not a descendant, so it has to
     be looked up from the document or every row silently stays empty. */
  const $doc = (sel) => document.querySelector(sel);

  const live = $("[data-live]");
  const formError = $("[data-form-error]");
  const submitBtn = $("[data-submit]");
  const submitLabel = $("[data-submit-label]");

  function announce(message) {
    if (live) live.textContent = message;
  }

  /* ---- Conditional visibility ------------------------------------------- */
  const stepBike = document.getElementById("step-bike");
  const stepHelmet = document.getElementById("step-helmet");

  const itemValue = () => {
    const picked = $("[data-item-input]:checked");
    return picked ? picked.value : "";
  };

  const wantsBike = () => ["Bike", "Both"].includes(itemValue());
  const wantsHelmet = () => ["Helmet", "Both"].includes(itemValue());

  function show(el, visible) {
    if (!el) return;
    el.hidden = !visible;
  }

  /** Renumber the visible steps so hiding one never leaves a gap. */
  function renumberSteps() {
    let n = 0;
    $$(".q-step").forEach((step) => {
      if (step.hidden) return;
      n += 1;
      const badge = step.querySelector(".q-step-num");
      if (badge) badge.textContent = `Step ${n}`;
    });
  }

  function syncConditionals() {
    show(stepBike, wantsBike());
    show(stepHelmet, wantsHelmet());

    // Mailing a helmet in is only coherent if a helmet is involved, and only
    // offered at all once the config says the policy exists.
    const shipping = QUOTE.helmetShipping || {};
    const shipEl = $("[data-helmet-shipping]");
    if (shipEl) {
      const offer = Boolean(shipping.enabled) && wantsHelmet();
      show(shipEl, offer);
      const input = shipEl.querySelector("input");
      if (input) {
        input.disabled = !offer;
        // Withdrawing the option can't leave it selected.
        if (!offer && input.checked) input.checked = false;
      }
    }

    $$("[data-reveals]").forEach((input) => {
      const target = document.getElementById(input.getAttribute("data-reveals"));
      if (!target) return;
      // A radio's reveal follows the group, not just its own click.
      show(target, input.checked && !input.disabled);
    });

    renumberSteps();
    updateSummary();
  }

  /* ---- Uploads ----------------------------------------------------------- */
  /** Files the rider has actually chosen, per uploader, in the order added. */
  const picked = { current: [], inspiration: [] };
  const previews = new Map();

  const uploaders = $$("[data-uploader]").map((root) => ({
    key: root.getAttribute("data-uploader"),
    root,
    input: root.querySelector('input[type="file"]'),
    thumbs: root.querySelector("[data-thumbs]"),
    drop: root.querySelector("[data-dropzone]"),
  }));

  const totalBytes = () =>
    Object.values(picked).reduce(
      (sum, list) => sum + list.reduce((n, file) => n + file.size, 0),
      0
    );

  const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

  /**
   * Write the curated list back into the input.
   *
   * The native POST reads input.files, not our array, so removing a photo has
   * to reach the FileList or the deleted image is still sent. DataTransfer is
   * the only way to build one.
   */
  function syncInput(uploader) {
    if (typeof DataTransfer === "undefined") return;
    const dt = new DataTransfer();
    picked[uploader.key].forEach((file) => dt.items.add(file));
    uploader.input.files = dt.files;
  }

  function renderThumbs(uploader) {
    const list = picked[uploader.key];
    uploader.thumbs.textContent = "";

    list.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "q-thumb";

      let url = previews.get(file);
      if (!url) {
        url = URL.createObjectURL(file);
        previews.set(file, url);
      }

      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      li.appendChild(img);

      const name = document.createElement("span");
      name.className = "q-thumb-name";
      name.textContent = file.name;
      li.appendChild(name);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "q-thumb-remove";
      remove.innerHTML = "&times;";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.addEventListener("click", () => {
        const [dropped] = list.splice(index, 1);
        const stale = previews.get(dropped);
        if (stale) {
          URL.revokeObjectURL(stale);
          previews.delete(dropped);
        }
        syncInput(uploader);
        renderThumbs(uploader);
        updateSummary();
        announce(`${dropped.name} removed.`);
        uploader.drop.focus();
      });
      li.appendChild(remove);

      uploader.thumbs.appendChild(li);
    });
  }

  function addFiles(uploader, files) {
    const list = picked[uploader.key];
    const rejected = [];
    let added = 0;

    Array.from(files).forEach((file) => {
      if (!ACCEPT.includes(file.type)) {
        rejected.push(`${file.name} isn't a ${ACCEPT_LABEL} image`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is ${mb(file.size)}MB — the limit is ${mb(MAX_FILE_BYTES)}MB per image`);
        return;
      }
      if (list.length >= MAX_FILES) {
        rejected.push(`${file.name} — that uploader is full at ${MAX_FILES} images`);
        return;
      }
      // A duplicate is almost always a double-pick, not an intent to send twice.
      const duplicate = list.some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
      );
      if (duplicate) return;

      if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
        rejected.push(`${file.name} would take the upload past ${mb(MAX_TOTAL_BYTES)}MB in total`);
        return;
      }

      list.push(file);
      added += 1;
    });

    syncInput(uploader);
    renderThumbs(uploader);
    updateSummary();

    const uploadError = $('[data-error-for="uploads"]');
    if (rejected.length) {
      setError(uploadError, rejected.join(". ") + ".");
    } else {
      clearError(uploadError);
    }
    if (added) announce(`${added} image${added === 1 ? "" : "s"} added.`);
  }

  uploaders.forEach((uploader) => {
    if (!uploader.input || !uploader.thumbs || !uploader.drop) return;

    uploader.input.addEventListener("change", () => {
      addFiles(uploader, uploader.input.files);
      // Without this a rider who removes a photo and re-picks the same file
      // gets no change event, and nothing appears to happen.
      if (!picked[uploader.key].length) uploader.input.value = "";
    });

    ["dragenter", "dragover"].forEach((type) => {
      uploader.drop.addEventListener(type, (e) => {
        e.preventDefault();
        uploader.drop.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach((type) => {
      uploader.drop.addEventListener(type, (e) => {
        e.preventDefault();
        uploader.drop.classList.remove("is-dragover");
      });
    });

    uploader.drop.addEventListener("drop", (e) => {
      const dropped = e.dataTransfer && e.dataTransfer.files;
      if (dropped && dropped.length) addFiles(uploader, dropped);
    });
  });

  const rulesEl = $("[data-upload-rules]");
  if (rulesEl) {
    rulesEl.textContent = `Up to ${MAX_FILES} images each, ${mb(MAX_FILE_BYTES)}MB per image, ${mb(MAX_TOTAL_BYTES)}MB in total. ${ACCEPT_LABEL}.`;
  }

  const shippingCfg = QUOTE.helmetShipping || {};
  const shippingLabel = $("[data-shipping-label]");
  const shippingNote = $("[data-shipping-note]");
  if (shippingLabel && shippingCfg.label) shippingLabel.textContent = shippingCfg.label;
  if (shippingNote && shippingCfg.note) shippingNote.textContent = shippingCfg.note;

  /* ---- Summary ----------------------------------------------------------- */
  const summaryField = $("[data-summary-field]");

  const val = (name) => {
    const el = form.elements[name];
    if (!el) return "";
    const node = el.length && !el.value ? el[0] : el;
    return (node.value || "").trim();
  };

  function checkedValues(name) {
    return $$(`input[name="${name}"]:checked`).map((el) => el.value);
  }

  function summaryData() {
    const services = checkedValues("services");
    const other = val("service_other");
    if (other && services.includes("Other")) {
      services[services.indexOf("Other")] = `Other — ${other}`;
    }

    const bike = wantsBike()
      ? [val("bike_year"), val("bike_make"), val("bike_model")].filter(Boolean).join(" ")
      : "";
    const helmet = wantsHelmet()
      ? [val("helmet_brand"), val("helmet_model"), val("helmet_size")].filter(Boolean).join(" ")
      : "";

    const photos = picked.current.length + picked.inspiration.length;
    const handoff = checkedValues("handoff")[0] || "";
    const zip = val("pickup_zip");

    return {
      item: itemValue(),
      services: services.join(", "),
      bike,
      helmet,
      finish: val("finish"),
      photos: photos ? `${photos} attached` : "",
      handoff: handoff && zip ? `${handoff} — ${zip}` : handoff,
    };
  }

  function updateSummary() {
    const data = summaryData();
    let filled = 0;

    Object.keys(data).forEach((key) => {
      const row = $doc(`[data-summary-row="${key}"]`);
      const out = $doc(`[data-summary-out="${key}"]`);
      const value = data[key];
      if (out) out.textContent = value;
      if (row) row.hidden = !value;
      if (value) filled += 1;
    });

    const empty = $doc("[data-summary-empty]");
    if (empty) empty.hidden = filled > 0;

    // Carried into the email as one readable line, because FormSubmit's table
    // renders raw field names and the inbox deserves better than that.
    if (summaryField) {
      summaryField.value = Object.entries(data)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
    }
  }

  /* ---- Validation --------------------------------------------------------- */
  let errorSeq = 0;

  function fieldOf(el) {
    return el.closest(".fld");
  }

  function setError(target, message) {
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
  }

  function clearError(target) {
    if (!target) return;
    target.textContent = "";
    target.hidden = true;
  }

  function fail(name, message) {
    const target = $(`[data-error-for="${name}"]`);
    setError(target, message);

    const input = form.elements[name];
    const node = input && input.length ? input[0] : input;
    if (node) {
      const wrap = fieldOf(node);
      if (wrap) wrap.classList.add("has-error");
      if (target) {
        if (!target.id) target.id = `q-err-${(errorSeq += 1)}`;
        node.setAttribute("aria-describedby", target.id);
      }
      node.setAttribute("aria-invalid", "true");
    }
    return node || null;
  }

  function clearAllErrors() {
    $$("[data-error-for]").forEach(clearError);
    $$(".fld.has-error").forEach((el) => el.classList.remove("has-error"));
    $$("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    if (formError) {
      formError.hidden = true;
      formError.textContent = "";
    }
  }

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate() {
    clearAllErrors();
    const bad = [];
    const note = (name, message) => bad.push(fail(name, message));

    if (!itemValue()) note("item_type", "Pick what you're wrapping.");
    if (!checkedValues("services").length) {
      note("services", "Pick at least one — “Not sure” counts.");
    }

    if (wantsBike()) {
      if (!val("bike_make")) note("bike_make", "Which make?");
      if (!val("bike_model")) note("bike_model", "Which model?");
      const year = val("bike_year");
      if (year) {
        const n = Number(year);
        const next = new Date().getFullYear() + 1;
        if (!/^\d{4}$/.test(year) || n < 1900 || n > next) {
          note("bike_year", `Use a four-digit year between 1900 and ${next}.`);
        }
      }
    }

    if (wantsHelmet()) {
      if (!val("helmet_brand")) note("helmet_brand", "Which brand?");
      if (!val("helmet_model")) note("helmet_model", "Which model?");
    }

    if (!val("description")) {
      note("description", "Tell us what you have in mind, even roughly.");
    }

    const handoff = checkedValues("handoff")[0];
    if (!handoff) note("handoff", "Pick drop-off or pickup.");
    if (handoff === "Pickup & return") {
      const zip = val("pickup_zip");
      if (!zip) note("pickup_zip", "We need a ZIP to price the pickup.");
      else if (!/^\d{5}$/.test(zip)) note("pickup_zip", "Use a five-digit ZIP code.");
    }

    if (!val("name")) note("name", "What should we call you?");

    const email = val("email");
    if (!email) note("email", "We need an email to send the quote to.");
    else if (!EMAIL.test(email)) note("email", "That email doesn't look right.");

    // Asking to be texted or called without leaving a number is a dead end,
    // so the number is required exactly when it is the chosen channel.
    const contact = checkedValues("preferred_contact")[0];
    if ((contact === "Text" || contact === "Call") && !val("phone")) {
      note("phone", `You picked ${contact.toLowerCase()} — leave a number we can reach.`);
    }

    const real = bad.filter(Boolean);
    if (real.length) {
      const first = real[0];
      if (formError) {
        formError.textContent =
          real.length === 1
            ? "One field needs a look before this can send."
            : `${real.length} fields need a look before this can send.`;
        formError.hidden = false;
      }
      announce(`${real.length} field${real.length === 1 ? "" : "s"} need attention.`);
      first.focus({ preventScroll: true });
      if (typeof first.scrollIntoView === "function") {
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return false;
    }

    return true;
  }

  /* ---- Submission --------------------------------------------------------- */
  let sending = false;

  /**
   * Best-effort copy of the lead into our own database.
   *
   * Fire-and-forget on purpose: the email is already on its way via the native
   * POST, so a failure here costs a row, not a customer. keepalive is what lets
   * the request outlive the navigation the form is about to trigger.
   */
  function recordLead() {
    const endpoint = QUOTE.endpoint || "/api/quote";
    const data = summaryData();
    const payload = {
      item_type: data.item,
      services: checkedValues("services"),
      service_other: val("service_other"),
      bike_make: val("bike_make"),
      bike_model: val("bike_model"),
      bike_year: val("bike_year"),
      bike_style: val("bike_style"),
      helmet_brand: val("helmet_brand"),
      helmet_model: val("helmet_model"),
      helmet_size: val("helmet_size"),
      helmet_style: val("helmet_style"),
      description: val("description"),
      finish: val("finish"),
      desired_colour: val("desired_colour"),
      handoff: checkedValues("handoff")[0] || "",
      pickup_zip: val("pickup_zip"),
      name: val("name"),
      email: val("email"),
      phone: val("phone"),
      instagram: val("instagram"),
      preferred_contact: checkedValues("preferred_contact")[0] || "",
      photo_count: picked.current.length + picked.inspiration.length,
      summary: summaryField ? summaryField.value : "",
      page: window.location.pathname + window.location.search,
    };

    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* The lead is already going out by native post; nothing to recover. */
    }
  }

  form.addEventListener("submit", (e) => {
    if (sending) {
      e.preventDefault();
      return;
    }

    // A validator that throws must not become a wall between the rider and the
    // garage. Letting a half-checked request through costs a follow-up email;
    // swallowing it costs the job.
    let ok = true;
    try {
      ok = validate();
    } catch (err) {
      console.error("quote validation failed to run", err);
    }

    if (!ok) {
      e.preventDefault();
      return;
    }

    sending = true;
    updateSummary();
    recordLead();

    if (window.KisalaTrack) {
      window.KisalaTrack("quote_submit", {
        label: itemValue() || "unspecified",
        photos: picked.current.length + picked.inspiration.length,
      });
    }

    if (submitBtn) submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = "Sending…";
    announce("Sending your request.");

    // No preventDefault: the browser posts the form itself, photos and all.
    // The disabled button is what stops a second submit, and it is set after
    // the event so it cannot suppress the submission it belongs to.
  });

  /* ---- Wire-up ------------------------------------------------------------ */
  form.addEventListener("change", (e) => {
    if (e.target.matches("[data-item-input], [data-service-input], [data-handoff-input], [data-reveals]")) {
      syncConditionals();
    } else {
      updateSummary();
    }

    // Clearing an error the moment it is fixed is kinder than making the rider
    // submit again to find out.
    const wrap = e.target.closest(".fld");
    if (wrap && wrap.classList.contains("has-error")) {
      wrap.classList.remove("has-error");
      e.target.removeAttribute("aria-invalid");
      const name = e.target.getAttribute("name");
      if (name) clearError($(`[data-error-for="${name}"]`));
    }
  });

  form.addEventListener("input", (e) => {
    if (e.target.type === "file") return;
    updateSummary();
  });

  /* Deep links from /services carry the choice over: /quote?item=helmet. */
  const wanted = new URLSearchParams(window.location.search).get("item");
  if (wanted) {
    const map = { bike: "Bike", helmet: "Helmet", both: "Both" };
    const target = map[wanted.toLowerCase()];
    if (target) {
      const input = $$("[data-item-input]").find((el) => el.value === target);
      if (input) input.checked = true;
    }
  }

  /* Land the redirect on whichever host the rider is actually on, so a local
     or preview build doesn't bounce them to production after submitting. */
  const next = form.elements._next;
  if (next) next.value = `${window.location.origin}/quote-thanks`;

  syncConditionals();
  updateSummary();
})();
