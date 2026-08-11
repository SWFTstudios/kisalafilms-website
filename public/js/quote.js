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
    wizard.sync();
    updateSummary();
  }

  /* ---- The wizard --------------------------------------------------------
     One step at a time, with a progress bar — but strictly as an enhancement
     over the long form underneath. Two rules keep that honest:

     1. Every field stays in the DOM and stays enabled. Steps are hidden with a
        class, never with `disabled`, so the native multipart POST still carries
        all of them no matter which step is on screen. The form already sets
        `novalidate`, which matters more than it looks: a `required` field the
        browser cannot focus because its step is off screen would make Chrome
        refuse to submit at all, and a swallowed lead is the one outcome this
        page cannot have.
     2. `hidden` keeps meaning what it meant before — "this step does not apply
        to you" — and is owned by syncConditionals. The step you are *on* is a
        separate axis, so a helmet-only request can never end up parked on the
        bike step, and neither mechanism has to know about the other. */
  const wizard = (() => {
    const progress = document.querySelector("[data-progress]");
    const nav = $("[data-nav]");
    const submitBlock = $(".q-submit");
    const backBtn = $("[data-back]");
    const nextBtn = $("[data-next]");
    const dotList = progress && progress.querySelector("[data-progress-dots]");
    const fill = progress && progress.querySelector("[data-progress-fill]");
    const track = progress && progress.querySelector("[data-progress-track]");
    const currentOut = progress && progress.querySelector("[data-progress-current]");
    const totalOut = progress && progress.querySelector("[data-progress-total]");
    const nameOut = progress && progress.querySelector("[data-progress-name]");

    /* No progress bar in the markup means no wizard, and the page falls back to
       the scrolling form it already was. */
    if (!progress || !nav || !backBtn || !nextBtn) {
      return { active: false, sync() {}, revealFieldOf() {} };
    }

    const applicable = () => $$(".q-step").filter((step) => !step.hidden);
    const visited = new Set();
    let current = null;

    /** The legend without its "Step 3" badge, for the progress bar's caption. */
    function titleOf(step) {
      const legend = step.querySelector("legend");
      if (!legend) return "";
      let text = "";
      legend.childNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList.contains("q-step-num")) return;
        text += node.textContent;
      });
      return text.replace(/\s+/g, " ").trim();
    }

    function renderDots(list, index) {
      if (!dotList) return;
      dotList.textContent = "";
      list.forEach((step, i) => {
        const li = document.createElement("li");
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "q-progress-dot";
        // Jumping back to a step already answered is free; jumping forward is
        // not, because the steps in between have not been checked yet.
        dot.disabled = !visited.has(step);
        if (i === index) {
          dot.classList.add("is-current");
          dot.setAttribute("aria-current", "step");
        }
        if (i < index) dot.classList.add("is-done");
        dot.setAttribute("aria-label", `Step ${i + 1}: ${titleOf(step)}`);
        dot.addEventListener("click", () => show(applicable(), i));
        li.appendChild(dot);
        dotList.appendChild(li);
      });
    }

    function render(list, index) {
      const total = list.length;
      const step = index + 1;
      const pct = total > 1 ? Math.round((index / (total - 1)) * 100) : 100;

      if (currentOut) currentOut.textContent = String(step);
      if (totalOut) totalOut.textContent = String(total);
      if (nameOut) nameOut.textContent = titleOf(list[index]);
      if (fill) fill.style.width = `${pct}%`;
      if (track) {
        track.setAttribute("aria-valuenow", String(pct));
        track.setAttribute("aria-valuetext", `Step ${step} of ${total}`);
      }

      const last = index === total - 1;
      backBtn.hidden = index === 0;
      nextBtn.hidden = last;
      // The submit button only exists where submitting is the thing to do.
      if (submitBlock) submitBlock.hidden = !last;

      renderDots(list, index);
    }

    function show(list, target, opts) {
      if (!list.length) return;
      const index = Math.max(0, Math.min(target, list.length - 1));
      current = list[index];
      visited.add(current);

      list.forEach((step) => step.classList.toggle("is-current", step === current));
      render(list, index);

      if (opts && opts.quiet) return;
      // tabindex, because a fieldset is not focusable and moving focus is the
      // only thing that tells a screen reader the page has changed under it.
      current.setAttribute("tabindex", "-1");
      current.focus({ preventScroll: true });
      announce(`Step ${index + 1} of ${list.length}. ${titleOf(current)}.`);
      if (typeof progress.scrollIntoView === "function") {
        progress.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }

    form.classList.add("q-form--wizard");
    progress.hidden = false;
    nav.hidden = false;

    nextBtn.addEventListener("click", () => {
      const list = applicable();
      const index = list.indexOf(current);
      // Checking only this step's own fields, so a rider is never told about a
      // question they have not been asked yet.
      if (!validateStep(current)) return;
      clearAllErrors();
      show(list, index + 1);
    });

    backBtn.addEventListener("click", () => {
      const list = applicable();
      clearAllErrors();
      show(list, list.indexOf(current) - 1);
    });

    /* Enter in a text field means "next", not "send". Without this the browser
       implicitly submits from step 1 and the rider gets a wall of errors for
       questions they were on their way to answering. */
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const el = e.target;
      if (!el.matches("input") || el.type === "file") return;
      e.preventDefault();
      if (!nextBtn.hidden) nextBtn.click();
      else if (submitBtn) submitBtn.click();
    });

    return {
      active: true,

      /** Re-derive the step list after conditional steps appear or disappear. */
      sync() {
        const list = applicable();
        if (!list.length) return;
        let index = list.indexOf(current);
        if (index < 0) {
          // The step the rider was on stopped applying — most often the bike
          // step after switching to a helmet. Take the place it used to hold,
          // which keeps them where they were rather than back at the start. On
          // the very first sync `current` is null and this lands on step one.
          index = list.filter(
            (step) =>
              current &&
              current.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_PRECEDING
          ).length;
        }
        show(list, index, { quiet: true });
      },

      /** Bring the step holding this field on screen so its error is visible. */
      revealFieldOf(node) {
        const step = node && node.closest(".q-step");
        if (!step || step === current) return;
        const list = applicable();
        const index = list.indexOf(step);
        if (index >= 0) show(list, index, { quiet: true });
      },
    };
  })();

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

    /* The picker owns the films; this only reads the hidden field it writes, so
       neither file has to know how the other works. One film per line. */
    const chosen = filmLines();
    const film = [
      checkedValues("film_types").join(", "),
      chosen.length ? `${chosen.length} film${chosen.length === 1 ? "" : "s"} picked` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      item: itemValue(),
      services: services.join(", "),
      bike,
      helmet,
      finish: val("finish"),
      film,
      photos: photos ? `${photos} attached` : "",
      handoff: handoff && zip ? `${handoff} — ${zip}` : handoff,
    };
  }

  const filmLines = () =>
    val("film_choices")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

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

  /**
   * Every rule, as data, touching nothing.
   *
   * Split out from validate() so the same rules can answer two different
   * questions: "can this send?" at submit, and "can the rider leave this step?"
   * on Continue. One list means a step can never enforce something the submit
   * does not, or let through something the submit will reject two steps later.
   */
  function problems() {
    const found = [];
    const note = (name, message) => found.push({ name, message });

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

    return found;
  }

  /** The node a rule points at, so a caller can ask which step it lives on. */
  function nodeFor(name) {
    const input = form.elements[name];
    return input && input.length ? input[0] : input || null;
  }

  /**
   * Show a set of problems and put the rider on the first one.
   *
   * `summarise` is off for a single step, because "3 fields need a look before
   * this can send" is wrong when the rider is four steps from sending.
   */
  function report(list, summarise) {
    const shown = list.map(({ name, message }) => fail(name, message)).filter(Boolean);
    if (!shown.length) return true;

    const first = shown[0];
    if (summarise && formError) {
      formError.textContent =
        shown.length === 1
          ? "One field needs a look before this can send."
          : `${shown.length} fields need a look before this can send.`;
      formError.hidden = false;
    }
    announce(`${shown.length} field${shown.length === 1 ? "" : "s"} need attention.`);

    wizard.revealFieldOf(first);
    first.focus({ preventScroll: true });
    // jsdom has no layout, so it has no scrollIntoView. Guarded rather than
    // wrapped, because a throw here would land in the submit handler's catch
    // and be read as "validation could not run".
    if (typeof first.scrollIntoView === "function") {
      first.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return false;
  }

  function validate() {
    clearAllErrors();
    return report(problems(), true);
  }

  /** Only the rules whose field lives on this step. */
  function validateStep(step) {
    clearAllErrors();
    const mine = problems().filter(({ name }) => {
      const node = nodeFor(name);
      return node && step.contains(node);
    });
    return report(mine, false);
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
      film_types: checkedValues("film_types"),
      film_choices: filmLines(),
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
