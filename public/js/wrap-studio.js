/**
 * Wrap Studio: photo attachments, live build summary, and a RollerReels-style
 * slide wizard (auto-advance, back/next, swipe, multi-setup garage).
 *
 * The form posts natively as multipart/form-data because FormSubmit only
 * delivers attachments on the standard endpoint — its AJAX endpoint silently
 * drops files. Everything here is progressive enhancement on top of that.
 */
(() => {
  const form = document.querySelector("[data-wrap-studio]");
  if (!form) return;

  /* ---- Photo attachments ------------------------------------------------ */
  const input = form.querySelector("[data-photo-input]");
  const dropzone = form.querySelector("[data-dropzone]");
  const previews = form.querySelector("[data-photo-previews]");
  const meter = form.querySelector("[data-photo-meter]");
  const countOut = form.querySelector("[data-photo-count]");
  const sizeOut = form.querySelector("[data-photo-size]");
  const errorOut = form.querySelector("[data-photo-error]");

  // FormSubmit caps a submission at 10MB; hold back a megabyte for the fields.
  const MAX_TOTAL = 9 * 1024 * 1024;
  const MAX_FILES = 8;

  let photos = [];
  const previewUrls = new Map();
  const supportsDataTransfer = typeof DataTransfer === "function";

  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  const total = () => photos.reduce((sum, file) => sum + file.size, 0);

  function showError(message) {
    if (!errorOut) return;
    errorOut.textContent = message;
    errorOut.hidden = !message;
  }

  function syncInput() {
    if (!supportsDataTransfer) return;
    const bucket = new DataTransfer();
    photos.forEach((file) => bucket.items.add(file));
    input.files = bucket.files;
  }

  function renderPhotos() {
    if (!previews) return;

    previewUrls.forEach((url, file) => {
      if (!photos.includes(file)) {
        URL.revokeObjectURL(url);
        previewUrls.delete(file);
      }
    });

    previews.hidden = !photos.length;
    if (meter) meter.hidden = !photos.length;

    previews.innerHTML = "";
    photos.forEach((file, index) => {
      const tile = document.createElement("div");
      tile.className = "upload-thumb";

      const isHeic = /\.hei[cf]$/i.test(file.name) || /image\/hei/i.test(file.type);
      if (isHeic) {
        tile.classList.add("is-heic");
        tile.innerHTML = `<span class="upload-heic-name">${escapeHtml(file.name)}</span>`;
      } else {
        let url = previewUrls.get(file);
        if (!url) {
          url = URL.createObjectURL(file);
          previewUrls.set(file, url);
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = file.name;
        tile.appendChild(img);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "upload-remove";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        photos.splice(index, 1);
        syncInput();
        renderPhotos();
        updateSummary();
      });
      tile.appendChild(remove);
      previews.appendChild(tile);
    });

    if (countOut) countOut.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
    if (sizeOut) sizeOut.textContent = `${mb(total())} MB of 9 MB`;
  }

  function addFiles(list) {
    showError("");
    const incoming = Array.from(list || []);
    let skipped = [];

    for (const file of incoming) {
      if (photos.length >= MAX_FILES) {
        skipped.push(file.name);
        continue;
      }
      if (photos.some((p) => p.name === file.name && p.size === file.size)) continue;
      if (total() + file.size > MAX_TOTAL) {
        skipped.push(file.name);
        continue;
      }
      photos.push(file);
    }

    if (skipped.length) {
      showError(
        skipped.length === 1
          ? `${skipped[0]} would push past 8 photos or 9 MB — skipped.`
          : `${skipped.length} files would push past 8 photos or 9 MB — skipped.`
      );
    }

    syncInput();
    renderPhotos();
    updateSummary();
  }

  if (input) {
    input.addEventListener("change", () => {
      addFiles(input.files);
      // Rebuilding via DataTransfer already owns the files; clear the raw pick
      // so the same file can be chosen again after removal.
      if (supportsDataTransfer) input.value = "";
    });
  }

  if (dropzone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((type) => {
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    dropzone.addEventListener("dragenter", () => dropzone.classList.add("is-drag"));
    dropzone.addEventListener("dragover", () => dropzone.classList.add("is-drag"));
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-drag"));
    dropzone.addEventListener("drop", (e) => {
      dropzone.classList.remove("is-drag");
      const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => /^image\//.test(f.type));
      if (dropped.length) addFiles(dropped);
    });
  }

  /* ---- Deep links -------------------------------------------------------
     The home page finish tiles and service cards link straight in with the
     choice already made, e.g. /wrap-studio.html?finish=Matte             */
  const params = new URLSearchParams(window.location.search);
  let deepLinkUsed = false;

  const preselectFinish = params.get("finish");
  if (preselectFinish) {
    const select = form.querySelector('[name="finish"]');
    if (select && Array.from(select.options).some((o) => o.value === preselectFinish)) {
      select.value = preselectFinish;
      deepLinkUsed = true;
    }
  }

  const preselectService = params.get("service");
  if (preselectService) {
    const radio = form.querySelector(`input[name="service"][value="${CSS.escape(preselectService)}"]`);
    if (radio) {
      radio.checked = true;
      deepLinkUsed = true;
    }
  }

  /* ---- Getting the bike here -------------------------------------------
     The zone select and the fee attributes are written by config-apply.js, so
     the numbers here are whatever kisala-config.js says they are.          */
  const transportDetail = form.querySelector("[data-transport-detail]");
  const zoneSelect = form.querySelector('[name="pickup_zone"]');
  const zoneHint = form.querySelector("[data-zone-hint]");
  const transportField = document.querySelector("[data-transport-field]");

  /** Selected radio, or null before anything is picked. */
  const transportChoice = () => form.querySelector('input[name="transport"]:checked');

  /** True for the options where I have to travel to the bike. */
  function transportNeedsZone(choice) {
    const fee = Number(choice?.dataset.fee || 0);
    return fee > 0 || /not sure/i.test(choice?.value || "");
  }

  function transportFee() {
    const choice = transportChoice();
    if (!choice) return 0;

    const base = Number(choice.dataset.fee || 0);
    if (!base) return 0;

    // A zone can carry its own floor. Quote the higher of the two so a longer
    // run is never under-quoted by the generic rate.
    const picked = zoneSelect?.selectedOptions?.[0];
    const zoneFrom = Number(picked?.dataset.pickupFrom || 0);
    if (!zoneFrom) return base;

    // Round trip is two legs, so scale the zone floor the same way the flat
    // fee relates to the one-way rate rather than assuming a single leg.
    const oneWay = window.KisalaConfig?.get("transport.pickup.fee") || zoneFrom;
    const legs = Math.max(1, Math.round(base / oneWay));
    return Math.max(base, zoneFrom * legs);
  }

  function renderTransport() {
    const choice = transportChoice();
    const needsZone = transportNeedsZone(choice);

    if (transportDetail) {
      transportDetail.hidden = !needsZone;
      // A hidden zone must not post a stale value from an earlier choice.
      if (!needsZone && zoneSelect) zoneSelect.value = "";
    }

    if (zoneHint && zoneSelect) {
      const picked = zoneSelect.selectedOptions?.[0];
      const available = picked?.dataset.available !== "0";
      const from = Number(picked?.dataset.pickupFrom || 0);
      if (!picked || !picked.value) {
        zoneHint.textContent = `Pickup starts at ${plain(window.KisalaConfig?.get("transport.pickup.from") || 75)} and depends on the run.`;
      } else if (!available) {
        zoneHint.textContent = "Outside the usual run — tell me where and I'll say honestly whether I can get to you.";
      } else {
        zoneHint.textContent = `${picked.value}: pickup from ${plain(from)}.`;
      }
    }
  }

  /* ---- Ballpark estimate ------------------------------------------------ */
  const estimateOut = document.querySelector("[data-estimate-out]");
  const estimateNote = document.querySelector("[data-estimate-note]");
  const estimateField = document.querySelector("[data-estimate-field]");
  const totalField = document.querySelector("[data-total-field]");
  const missionTotal = form.querySelector("[data-mission-total]");
  const missionBar = form.querySelector("[data-mission-bar]");

  const money = (n) => "$" + (Math.round(n / 25) * 25).toLocaleString("en-US");
  /** Unrounded, for fees that are already exact figures. */
  const plain = (n) => "$" + Number(n).toLocaleString("en-US");

  function estimate() {
    const service = form.querySelector('input[name="service"]:checked');
    if (!service) return null;

    let low = Number(service.dataset.priceLow || 0);
    let high = Number(service.dataset.priceHigh || 0);
    if (!low || !high) return null;

    // Prices are quoted for a mid-complexity bike. Stripping a full touring
    // fairing is a different job from wrapping a naked tank, so scale the
    // body-dependent services by the difficulty band the bike index reports.
    const difficulty = Number(form.querySelector("[data-bike-difficulty]")?.value || 0);
    let scaled = false;
    if (service.dataset.priceScales === "1" && difficulty) {
      const factor = 1 + 0.18 * (difficulty - 3);
      low *= factor;
      high *= factor;
      scaled = true;
    }

    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).reduce(
      (sum, el) => sum + Number(el.dataset.price || 0),
      0
    );

    return { low: low + addons, high: high + addons, addons, scaled, difficulty };
  }

  function renderEstimate() {
    const fee = transportFee();

    // Transport is quoted on its own line whether or not a service is picked,
    // so the pickup number never looks like part of the wrap price.
    if (transportField) transportField.value = fee ? plain(fee) : "";
    write("transportfee", fee ? `${plain(fee)} est.` : "");

    if (!estimateOut) return;
    const result = estimate();

    if (!result) {
      estimateOut.textContent = "Pick a service";
      if (estimateNote) {
        estimateNote.textContent = "Scales with how much bodywork your bike has to come apart.";
      }
      if (estimateField) estimateField.value = "";
      if (totalField) totalField.value = "";
      if (missionTotal) missionTotal.textContent = "—";
      missionBar?.classList.add("is-empty");
      return;
    }

    const range = `${money(result.low)}–${money(result.high)}`;
    estimateOut.textContent = range;
    if (missionTotal) missionTotal.textContent = range;
    missionBar?.classList.remove("is-empty");

    if (estimateNote) {
      const parts = [];
      if (result.scaled) {
        parts.push(
          result.difficulty >= 4
            ? "Adjusted up for your bike's bodywork."
            : result.difficulty <= 2
              ? "Adjusted down for your bike's bodywork."
              : "Adjusted for your bike's bodywork."
        );
      } else if (!result.difficulty) {
        parts.push("Pick your bike to sharpen this.");
      }
      if (result.addons) parts.push(`Includes ${money(result.addons)} of add-ons.`);
      if (fee) parts.push(`Transport adds about ${plain(fee)} on top.`);
      parts.push("A ballpark, not a quote — photos decide the real number.");
      estimateNote.textContent = parts.join(" ");
    }

    // ballpark_estimate stays wrap-only, the way it has always arrived in the
    // inbox. The combined figure rides along beside it instead of replacing it.
    if (estimateField) estimateField.value = range;
    if (totalField) {
      totalField.value = fee
        ? `${money(result.low + fee)}–${money(result.high + fee)}`
        : range;
    }
  }

  /* ---- Live build summary ----------------------------------------------- */
  const outs = {};
  document.querySelectorAll("[data-summary-out]").forEach((el) => {
    outs[el.getAttribute("data-summary-out")] = el;
  });

  function write(key, value) {
    const el = outs[key];
    if (!el) return;
    const empty = !value;
    el.textContent = empty ? el.dataset.placeholder || el.textContent : value;
    if (!el.dataset.placeholder) el.dataset.placeholder = empty ? el.textContent : el.dataset.placeholder;
    el.classList.toggle("is-empty", empty);
  }

  document.querySelectorAll("[data-summary-out]").forEach((el) => {
    el.dataset.placeholder = el.textContent;
  });

  function updateSummary() {
    const year = form.querySelector("[data-bike-year]")?.value || "";
    const make = form.querySelector("[data-bike-make]")?.value || "";
    const model = form.querySelector("[data-bike-model]")?.value || "";
    write("bike", [year, make, model].filter(Boolean).join(" "));

    write("service", form.querySelector('input[name="service"]:checked')?.value || "");
    write("finish", form.querySelector('[name="finish"]')?.value || "");
    write("coverage", form.querySelector('[name="coverage"]')?.value || "");
    write("timeline", form.querySelector('[name="timeline"]')?.value || "");
    write("budget", form.querySelector('[name="budget"]')?.value || "");
    write("colour", form.querySelector("[data-vinyl-label]")?.value || "");

    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map((el) => el.value);
    write("addons", addons.join(", "));

    // vinyl-catalog.js owns the shortlist, writes the hidden field and publishes
    // the count alongside it — film titles contain pipes and newlines of their
    // own, so the value is not safe to count by splitting.
    const savedCount = Number(document.querySelector("[data-saved-films-field]")?.dataset.count || 0);
    write("saved", savedCount ? `${savedCount} shortlisted` : "");

    const choice = transportChoice();
    const zone = zoneSelect && !transportDetail?.hidden ? zoneSelect.value : "";
    write("transport", [choice?.value, zone].filter(Boolean).join(" · "));

    write(
      "photos",
      photos.length ? `${photos.length} attached · ${mb(total())} MB` : ""
    );

    renderTransport();
    renderEstimate();
  }

  // The vinyl picker writes its hidden field programmatically, which fires no
  // event — re-read shortly after any interaction to catch it.
  const refresh = () => {
    updateSummary();
    setTimeout(updateSummary, 150);
    syncNextButtonState();
    if (!suppressPersist) schedulePersist();
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  form.addEventListener("click", refresh);

  form.addEventListener("submit", (e) => {
    // Wizard gate: only submit from the review step (or aside button after review).
    if (STEPS[stepIndex] !== "review") {
      e.preventDefault();
      if (!validateThrough("review")) return;
      setStep(STEPS.indexOf("review"), "forward");
      return;
    }

    if (!validateStep("contact") || !validateStep("review")) {
      e.preventDefault();
      return;
    }

    if (total() > MAX_TOTAL) {
      e.preventDefault();
      showError("Those photos add up past 9 MB. Remove one or two and send again.");
      setStep(STEPS.indexOf("photos"), "back");
      errorOut?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Best-effort only. The native POST tears this page down, so the
    // conversion that actually gets counted is the one on /thanks.html.
    window.KisalaTrack?.("generate_lead", {
      label: form.querySelector('input[name="service"]:checked')?.value || "unknown",
      transport: transportChoice()?.value || "",
      budget: form.querySelector('[name="budget"]')?.value || "",
      photos: photos.length,
    });
  });

  /* ---- Slide wizard (RollerReels-style) --------------------------------- */
  const STEPS = Array.from(form.querySelectorAll("[data-studio-step]")).map((el) =>
    el.getAttribute("data-studio-step")
  );
  const STEP_LABELS = {
    bike: "Your Bike",
    service: "The Job",
    colour: "The Film",
    addons: "Extras",
    transport: "Logistics",
    photos: "Reference",
    contact: "Rider",
    review: "Review",
  };
  // Single-choice steps that advance themselves once complete.
  const AUTO_ADVANCE_STEPS = new Set(["bike", "service", "transport"]);

  const progressEl = form.querySelector("[data-studio-progress]");
  const stepLabelEl = form.querySelector("[data-studio-step-label]");
  const swipeHint = form.querySelector("[data-studio-swipe-hint]");
  const slideWrap = form.querySelector("[data-studio-slide-wrap]");
  const backBtn = form.querySelector("[data-studio-back]");
  const nextBtn = form.querySelector("[data-studio-next]");
  const submitBtn = form.querySelector("[data-studio-submit]");
  const reviewEl = form.querySelector("[data-studio-review]");

  let stepIndex = 0;
  let isAnimating = false;
  let autoAdvanceTimer = null;
  let suppressPersist = false;
  let suppressAutoAdvance = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stepPanel(id) {
    return form.querySelector(`[data-studio-step="${id}"]`);
  }

  function setStepError(id, message) {
    const el = form.querySelector(`[data-step-error="${id}"]`) || form.querySelector('[data-step-error="form"]');
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  function clearStepErrors() {
    form.querySelectorAll("[data-step-error]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
    });
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function isStepComplete(id) {
    switch (id) {
      case "bike": {
        const year = form.querySelector("[data-bike-year]")?.value;
        const make = form.querySelector("[data-bike-make]")?.value;
        const model = form.querySelector("[data-bike-model]")?.value;
        return !!(year && make && model);
      }
      case "service":
        return !!form.querySelector('input[name="service"]:checked');
      case "colour":
        return !!form.querySelector('[name="finish"]')?.value;
      case "addons":
        return true;
      case "transport": {
        const choice = transportChoice();
        if (!choice) return false;
        if (transportNeedsZone(choice) && !zoneSelect?.value) return false;
        return true;
      }
      case "photos":
        return true;
      case "contact": {
        const name = form.querySelector('[name="name"]')?.value?.trim();
        const email = form.querySelector('[name="email"]')?.value?.trim();
        const consent = form.querySelector('[name="consent"]')?.checked;
        return !!(name && email && isValidEmail(email) && consent);
      }
      case "review":
        return true;
      default:
        return true;
    }
  }

  function validateStep(id) {
    clearStepErrors();
    if (isStepComplete(id)) return true;

    const messages = {
      bike: "Pick year, make, and model to continue.",
      service: "Choose a service to continue.",
      colour: "Pick a finish to continue.",
      transport: "Choose how the bike gets here — and the zone if I’m collecting it.",
      contact: "Name, a valid email, and the consent box are required.",
      review: "Fix the missing details above, then send.",
    };
    setStepError(id, messages[id] || "Complete this step to continue.");

    // Native highlight for empty required fields in the active panel.
    const panel = stepPanel(id);
    const bad = panel?.querySelector(":invalid, select:required:invalid, input:required:invalid");
    bad?.focus?.({ preventScroll: true });
    return false;
  }

  function validateThrough(targetId) {
    const target = STEPS.indexOf(targetId);
    for (let i = 0; i <= target; i++) {
      if (!validateStep(STEPS[i])) {
        setStep(i, i < stepIndex ? "back" : "forward");
        return false;
      }
    }
    return true;
  }

  function renderProgress() {
    if (!progressEl) return;
    progressEl.innerHTML = STEPS.map((step, i) => {
      const state = i === stepIndex ? "is-active" : i < stepIndex ? "is-completed" : "";
      return `<button type="button" class="studio-dot ${state}" data-studio-goto="${step}" aria-label="${STEP_LABELS[step] || step}" aria-current="${i === stepIndex ? "step" : "false"}"></button>`;
    }).join("");
  }

  function renderReview() {
    if (!reviewEl) return;
    updateSummary();
    const year = form.querySelector("[data-bike-year]")?.value || "";
    const make = form.querySelector("[data-bike-make]")?.value || "";
    const model = form.querySelector("[data-bike-model]")?.value || "";
    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map((el) => el.value);
    const choice = transportChoice();
    const zone = zoneSelect && !transportDetail?.hidden ? zoneSelect.value : "";
    const result = estimate();
    const fee = transportFee();

    const rows = [
      ["Bike", [year, make, model].filter(Boolean).join(" ") || "—", "bike"],
      ["Service", form.querySelector('input[name="service"]:checked')?.value || "—", "service"],
      ["Finish", form.querySelector('[name="finish"]')?.value || "—", "colour"],
      ["Colour", form.querySelector("[data-vinyl-label]")?.value || "Not picked", "colour"],
      ["Coverage", form.querySelector('[name="coverage"]')?.value || "—", "colour"],
      ["Add-ons", addons.length ? addons.join(", ") : "None", "addons"],
      ["Getting here", [choice?.value, zone].filter(Boolean).join(" · ") || "—", "transport"],
      ["Photos", photos.length ? `${photos.length} attached` : "None yet", "photos"],
      ["Budget", form.querySelector('[name="budget"]')?.value || "—", "contact"],
      ["Timeline", form.querySelector('[name="timeline"]')?.value || "—", "contact"],
      ["Name", form.querySelector('[name="name"]')?.value || "—", "contact"],
      ["Email", form.querySelector('[name="email"]')?.value || "—", "contact"],
      [
        "Ballpark",
        result
          ? fee
            ? `${money(result.low)}–${money(result.high)} wrap · ${plain(fee)} transport`
            : `${money(result.low)}–${money(result.high)}`
          : "—",
        "service",
      ],
    ];

    reviewEl.innerHTML = rows
      .map(
        ([label, value, goto]) => `<div class="studio-review-row">
        <div>
          <p class="studio-review-label">${escapeHtml(label)}</p>
          <p class="studio-review-value">${escapeHtml(value)}</p>
        </div>
        <button type="button" class="studio-review-edit" data-studio-goto="${goto}">Edit</button>
      </div>`
      )
      .join("");
  }

  function updateStepNavUI() {
    renderProgress();
    if (stepLabelEl) stepLabelEl.textContent = STEP_LABELS[STEPS[stepIndex]] || "";
    if (backBtn) backBtn.hidden = stepIndex === 0;

    const onReview = STEPS[stepIndex] === "review";
    if (nextBtn) nextBtn.hidden = onReview;
    if (submitBtn) submitBtn.hidden = !onReview;
    syncNextButtonState();
  }

  function syncNextButtonState() {
    if (!nextBtn || nextBtn.hidden) return;
    const ready = isStepComplete(STEPS[stepIndex]);
    nextBtn.classList.toggle("is-disabled", !ready);
    nextBtn.setAttribute("aria-disabled", ready ? "false" : "true");
  }

  function handleArrival(id) {
    clearStepErrors();
    if (id === "review") renderReview();
    updateStepNavUI();
    updateSummary();
    schedulePersist();
  }

  function setStep(index, direction) {
    if (isAnimating || !STEPS.length) return;
    const clamp = Math.max(0, Math.min(STEPS.length - 1, index));
    direction = direction || (clamp > stepIndex ? "forward" : "back");
    const prevIndex = stepIndex;
    const prevId = STEPS[prevIndex];
    const nextId = STEPS[clamp];
    if (prevId === nextId && form.querySelector(`[data-studio-step="${nextId}"].is-active`)) {
      handleArrival(nextId);
      return;
    }

    const outgoing = stepPanel(prevId);
    const incoming = stepPanel(nextId);
    stepIndex = clamp;

    const gsap = window.gsap;
    const canAnimate =
      typeof gsap !== "undefined" &&
      slideWrap &&
      outgoing &&
      incoming &&
      prevIndex !== clamp &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!canAnimate) {
      form.querySelectorAll("[data-studio-step]").forEach((panel) => {
        const on = panel.getAttribute("data-studio-step") === nextId;
        panel.hidden = !on;
        panel.classList.toggle("is-active", on);
      });
      handleArrival(nextId);
      return;
    }

    isAnimating = true;
    updateStepNavUI();

    const fromX = direction === "forward" ? "100%" : "-100%";
    const toX = direction === "forward" ? "-100%" : "100%";

    slideWrap.style.height = `${outgoing.offsetHeight}px`;
    slideWrap.style.overflow = "hidden";

    outgoing.hidden = false;
    incoming.hidden = false;
    incoming.classList.add("is-active");

    gsap.set(outgoing, { position: "absolute", top: 0, left: 0, width: "100%", zIndex: 1 });
    gsap.set(incoming, { x: fromX, opacity: 0, zIndex: 2 });

    const inH = Math.max(incoming.scrollHeight || 220, 220);

    gsap
      .timeline({
        onComplete: () => {
          isAnimating = false;
          outgoing.classList.remove("is-active");
          outgoing.hidden = true;
          gsap.set(outgoing, { clearProps: "all" });
          gsap.set(incoming, { clearProps: "transform,opacity,zIndex" });
          slideWrap.style.height = "";
          slideWrap.style.overflow = "";
          handleArrival(nextId);
        },
      })
      .to(slideWrap, { height: inH, duration: 0.35, ease: "power2.out" }, 0)
      .to(outgoing, { x: toX, opacity: 0, duration: 0.32, ease: "power2.inOut" }, 0)
      .to(incoming, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, 0.04);
  }

  function goNext() {
    if (isAnimating) return;
    const id = STEPS[stepIndex];
    if (!validateStep(id)) return;
    if (stepIndex >= STEPS.length - 1) return;
    setStep(stepIndex + 1, "forward");
  }

  function goBack() {
    if (isAnimating || stepIndex <= 0) return;
    setStep(stepIndex - 1, "back");
  }

  function maybeAutoAdvance(changedEl) {
    if (suppressAutoAdvance) return;
    const id = STEPS[stepIndex];
    if (!AUTO_ADVANCE_STEPS.has(id)) return;
    if (!isStepComplete(id)) return;
    if (isAnimating) return;

    // Bike: only advance when the model select changes (year/make alone aren't enough).
    if (id === "bike" && changedEl && !changedEl.matches("[data-bike-model]")) return;
    // Transport: zone select completing a pickup choice should advance; radio alone may not.
    if (id === "transport" && changedEl?.type === "radio" && transportNeedsZone(changedEl) && !zoneSelect?.value) {
      return;
    }

    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      if (!isAnimating && STEPS[stepIndex] === id && isStepComplete(id) && stepIndex < STEPS.length - 1) {
        setStep(stepIndex + 1, "forward");
      }
    }, 460);
  }

  backBtn?.addEventListener("click", goBack);
  nextBtn?.addEventListener("click", () => {
    if (nextBtn.classList.contains("is-disabled")) {
      validateStep(STEPS[stepIndex]);
      return;
    }
    goNext();
  });

  form.addEventListener("click", (e) => {
    const goto = e.target.closest("[data-studio-goto]");
    if (!goto || !form.contains(goto)) return;
    const target = goto.getAttribute("data-studio-goto");
    const idx = STEPS.indexOf(target);
    if (idx < 0 || idx === stepIndex) return;
    // Back is always free; forward only through completed steps.
    if (idx > stepIndex) {
      for (let i = stepIndex; i < idx; i++) {
        if (!isStepComplete(STEPS[i])) {
          validateStep(STEPS[i]);
          return;
        }
      }
    }
    setStep(idx, idx > stepIndex ? "forward" : "back");
  });

  form.addEventListener("change", (e) => {
    const el = e.target;
    if (!form.contains(el)) return;

    // Pulse selected option cards (RR-style).
    if (el.type === "radio" || el.type === "checkbox") {
      const card = el.closest(".opt-card");
      if (card && el.checked && typeof window.gsap !== "undefined") {
        window.gsap.fromTo(card, { scale: 0.985 }, { scale: 1, duration: 0.32, ease: "back.out(2.2)" });
      }
    }

    maybeAutoAdvance(el);
  });

  // Touch swipe navigation
  (() => {
    const target = slideWrap || form;
    let startX = 0;
    let startY = 0;
    target.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );
    target.addEventListener(
      "touchend",
      (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) goNext();
        else goBack();
      },
      { passive: true }
    );

    if (swipeHint && window.innerWidth <= 640 && typeof window.gsap !== "undefined") {
      window.gsap.to(swipeHint, {
        opacity: 0,
        delay: 2.5,
        duration: 1.1,
        ease: "power2.in",
        onComplete: () => {
          swipeHint.hidden = true;
        },
      });
    } else if (swipeHint && window.innerWidth > 640) {
      swipeHint.hidden = true;
    }
  })();

  /* ---- Multi-setup garage (device-local) -------------------------------- */
  const STORAGE_KEY = form.getAttribute("data-studio-storage") || "kisala-wrap-studio-garage";
  const setupSelect = form.querySelector("[data-setup-select]");
  const setupSaveBtn = form.querySelector("[data-setup-save]");
  const setupNewBtn = form.querySelector("[data-setup-new]");
  const setupDeleteBtn = form.querySelector("[data-setup-delete]");
  const setupStatus = form.querySelector("[data-setup-status]");
  const setupNameField = form.querySelector("[data-setup-name-field]");

  let garage = { v: 1, activeId: null, setups: {} };
  let persistTimer = null;
  let activeSetupId = null;

  function uid() {
    return `setup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function readGarage() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object" || !raw.setups) return { v: 1, activeId: null, setups: {} };
      return raw;
    } catch {
      return { v: 1, activeId: null, setups: {} };
    }
  }

  function writeGarage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(garage));
    } catch {
      /* quota / private mode — ignore */
    }
  }

  function defaultSetupLabel() {
    const year = form.querySelector("[data-bike-year]")?.value || "";
    const make = form.querySelector("[data-bike-make]")?.value || "";
    const model = form.querySelector("[data-bike-model]")?.value || "";
    const service = form.querySelector('input[name="service"]:checked')?.value || "";
    const bike = [year, make, model].filter(Boolean).join(" ");
    if (bike && service) return `${bike} — ${service}`;
    if (bike) return bike;
    if (service) return service;
    return `Setup ${Object.keys(garage.setups).length + 1}`;
  }

  function collectDraft() {
    const fields = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.name.startsWith("_")) return;
      if (el.type === "file") return;
      if (el.type === "checkbox") return;
      if (el.type === "radio") {
        if (el.checked) fields[el.name] = el.value;
        return;
      }
      fields[el.name] = el.value;
    });
    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map((el) => el.value);
    const consent = !!form.querySelector('[name="consent"]')?.checked;
    return {
      id: activeSetupId,
      label: setupNameField?.value || defaultSetupLabel(),
      step: STEPS[stepIndex],
      fields,
      addons,
      consent,
      updatedAt: Date.now(),
    };
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (!activeSetupId) return;
      const draft = collectDraft();
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...draft,
        createdAt: garage.setups[activeSetupId]?.createdAt || Date.now(),
      };
      garage.activeId = activeSetupId;
      writeGarage();
      renderGarageSelect();
    }, 200);
  }

  function waitForBikeOptions() {
    return new Promise((resolve) => {
      const make = form.querySelector("[data-bike-make]");
      if (!make) return resolve();
      if (make.options.length > 1) return resolve();
      let tries = 0;
      const tick = () => {
        if (make.options.length > 1 || tries > 40) return resolve();
        tries += 1;
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function applyDraft(draft, opts = {}) {
    if (!draft) return;
    suppressPersist = true;
    suppressAutoAdvance = true;

    // Clear radios/checkboxes first so stale choices don't linger.
    form.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.checked = false;
    });
    form.querySelectorAll('input[name="addons"]').forEach((el) => {
      el.checked = false;
    });

    const fields = draft.fields || {};

    // Year first, then make/model after bike-search populates.
    if (fields.year) {
      const year = form.querySelector("[data-bike-year]");
      if (year) year.value = fields.year;
    }

    await waitForBikeOptions();

    const make = form.querySelector("[data-bike-make]");
    const model = form.querySelector("[data-bike-model]");
    if (make && fields.make) {
      make.value = fields.make;
      make.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Give bike-search a beat to fill models.
    await new Promise((r) => setTimeout(r, 40));
    if (model && fields.model) {
      model.disabled = false;
      model.value = fields.model;
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }

    Object.entries(fields).forEach(([name, value]) => {
      if (name === "year" || name === "make" || name === "model" || name === "addons") return;
      const el = form.elements.namedItem(name);
      if (!el) return;
      if (el instanceof RadioNodeList || (el.length && el[0]?.type === "radio")) {
        Array.from(el).forEach((n) => {
          n.checked = n.value === value;
        });
        return;
      }
      if (el.type === "checkbox") {
        el.checked = !!value;
        return;
      }
      el.value = value == null ? "" : String(value);
    });

    (draft.addons || []).forEach((value) => {
      const box = form.querySelector(`input[name="addons"][value="${CSS.escape(value)}"]`);
      if (box) box.checked = true;
    });

    const consent = form.querySelector('[name="consent"]');
    if (consent) consent.checked = !!draft.consent;

    if (setupNameField) setupNameField.value = draft.label || "";

    // Photos cannot be restored from storage.
    photos = [];
    syncInput();
    renderPhotos();
    showError("");

    renderTransport();
    updateSummary();

    const idx = STEPS.indexOf(draft.step);
    setStep(idx >= 0 && !opts.forceStart ? idx : 0, "forward");

    suppressPersist = false;
    // Allow auto-advance again after a tick so restore changes don't skip ahead.
    setTimeout(() => {
      suppressAutoAdvance = false;
    }, 500);
  }

  function renderGarageSelect() {
    if (!setupSelect) return;
    const entries = Object.values(garage.setups).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const current = setupSelect.value;
    setupSelect.innerHTML =
      `<option value="">${activeSetupId ? escapeHtml(garage.setups[activeSetupId]?.label || "Current build") : "Current build"}</option>` +
      entries
        .filter((s) => s.id !== activeSetupId)
        .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label || "Untitled setup")}</option>`)
        .join("");
    // Keep the active id selected via a dedicated option value.
    if (activeSetupId) {
      const activeLabel = garage.setups[activeSetupId]?.label || "Current build";
      setupSelect.innerHTML =
        `<option value="${escapeHtml(activeSetupId)}">${escapeHtml(activeLabel)}</option>` +
        entries
          .filter((s) => s.id !== activeSetupId)
          .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label || "Untitled setup")}</option>`)
          .join("");
      setupSelect.value = activeSetupId;
    } else if (current && garage.setups[current]) {
      setupSelect.value = current;
    }
    if (setupDeleteBtn) setupDeleteBtn.hidden = !activeSetupId || !garage.setups[activeSetupId];
  }

  function ensureActiveSetup() {
    if (activeSetupId && garage.setups[activeSetupId]) return;
    activeSetupId = uid();
    garage.setups[activeSetupId] = {
      id: activeSetupId,
      label: "Current build",
      step: STEPS[0],
      fields: {},
      addons: [],
      consent: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    garage.activeId = activeSetupId;
    writeGarage();
    renderGarageSelect();
  }

  function setStatus(message) {
    if (setupStatus) setupStatus.textContent = message;
  }

  setupSaveBtn?.addEventListener("click", () => {
    ensureActiveSetup();
    const label = window.prompt("Name this setup", garage.setups[activeSetupId]?.label || defaultSetupLabel());
    if (label == null) return;
    if (setupNameField) setupNameField.value = label.trim() || defaultSetupLabel();
    const draft = collectDraft();
    garage.setups[activeSetupId] = {
      ...(garage.setups[activeSetupId] || {}),
      ...draft,
      label: draft.label,
      createdAt: garage.setups[activeSetupId]?.createdAt || Date.now(),
    };
    garage.activeId = activeSetupId;
    writeGarage();
    renderGarageSelect();
    setStatus(`Saved “${draft.label}” on this device.`);
  });

  setupNewBtn?.addEventListener("click", () => {
    // Snapshot the current one first.
    if (activeSetupId) {
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...collectDraft(),
        createdAt: garage.setups[activeSetupId]?.createdAt || Date.now(),
      };
      writeGarage();
    }

    suppressAutoAdvance = true;
    form.querySelectorAll('input[type="radio"]').forEach((el) => {
      el.checked = false;
    });
    form.querySelectorAll('input[name="addons"]').forEach((el) => {
      el.checked = false;
    });
    // Restore default transport.
    const drop = form.querySelector('input[name="transport"][value="Drop-off — riding it in myself"]');
    if (drop) drop.checked = true;
    ["finish", "coverage", "budget", "timeline", "feature", "name", "email", "phone", "city", "notes", "pickup_zone", "pickup_area", "pickup_notes", "vinyl_color_query"].forEach(
      (name) => {
        const el = form.elements.namedItem(name);
        if (el && !(el instanceof RadioNodeList)) el.value = "";
      }
    );
    ["vinyl_color", "vinyl_handle", "vinyl_url", "vinyl_vendor", "vinyl_type", "vinyl_finish", "bike", "bike_body_class", "bike_difficulty", "fairing_rr_hours_low", "fairing_rr_hours_high", "fairing_rr_label"].forEach(
      (name) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) el.value = "";
      }
    );
    const year = form.querySelector("[data-bike-year]");
    const make = form.querySelector("[data-bike-make]");
    const model = form.querySelector("[data-bike-model]");
    if (year) year.value = "";
    if (make) {
      make.value = "";
      make.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (model) {
      model.value = "";
      model.disabled = true;
    }
    const consent = form.querySelector('[name="consent"]');
    if (consent) consent.checked = false;
    if (setupNameField) setupNameField.value = "";
    form.querySelector("[data-vinyl-selected]")?.setAttribute("hidden", "");
    form.querySelector("[data-vinyl-clear]")?.setAttribute("hidden", "");

    photos = [];
    syncInput();
    renderPhotos();
    showError("");

    activeSetupId = uid();
    garage.setups[activeSetupId] = {
      id: activeSetupId,
      label: `Setup ${Object.keys(garage.setups).length + 1}`,
      step: "bike",
      fields: {},
      addons: [],
      consent: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    garage.activeId = activeSetupId;
    writeGarage();
    renderGarageSelect();
    setStep(0, "back");
    updateSummary();
    setStatus("New setup started. Save it whenever you’re ready.");
    setTimeout(() => {
      suppressAutoAdvance = false;
    }, 400);
  });

  setupDeleteBtn?.addEventListener("click", () => {
    if (!activeSetupId || !garage.setups[activeSetupId]) return;
    const label = garage.setups[activeSetupId].label || "this setup";
    if (!window.confirm(`Delete “${label}” from this device?`)) return;
    delete garage.setups[activeSetupId];
    const remaining = Object.keys(garage.setups);
    activeSetupId = remaining[0] || null;
    garage.activeId = activeSetupId;
    writeGarage();
    if (activeSetupId) {
      applyDraft(garage.setups[activeSetupId]);
      setStatus(`Loaded “${garage.setups[activeSetupId].label}”.`);
    } else {
      setupNewBtn?.click();
      setStatus("Setup deleted.");
    }
    renderGarageSelect();
  });

  setupSelect?.addEventListener("change", () => {
    const id = setupSelect.value;
    if (!id || id === activeSetupId || !garage.setups[id]) return;
    if (activeSetupId) {
      garage.setups[activeSetupId] = {
        ...(garage.setups[activeSetupId] || {}),
        ...collectDraft(),
        createdAt: garage.setups[activeSetupId]?.createdAt || Date.now(),
      };
    }
    activeSetupId = id;
    garage.activeId = id;
    writeGarage();
    applyDraft(garage.setups[id]);
    setStatus(`Loaded “${garage.setups[id].label}”.`);
  });

  // Boot garage + wizard
  garage = readGarage();
  if (garage.activeId && garage.setups[garage.activeId] && !deepLinkUsed) {
    activeSetupId = garage.activeId;
    renderGarageSelect();
    applyDraft(garage.setups[activeSetupId]);
  } else {
    ensureActiveSetup();
    // Start on colour/service if deep-linked.
    if (deepLinkUsed && preselectService) setStep(STEPS.indexOf("service"), "forward");
    else if (deepLinkUsed && preselectFinish) setStep(STEPS.indexOf("colour"), "forward");
    else setStep(0, "forward");
  }

  updateSummary();
})();
