/**
 * Phone-first multi-step inquiry wizard.
 * Persists draft to localStorage, computes Metro roll-size suggestion,
 * and requires a review/confirm step before FormSubmit POST.
 *
 * Form: [data-inquiry-wizard]
 * Steps: [data-wizard-step="bike|parts|finish|size|contact|review"]
 * Nav:   [data-wizard-next], [data-wizard-back], [data-wizard-goto="step"]
 * Parts: [data-part] checkboxes
 * Size:  [data-size-summary], [name=vinyl_length_ft], hidden size fields
 * Confirm: [data-confirm-send] checkbox required on review
 */
(() => {
  const FORM = document.querySelector("[data-inquiry-wizard]");
  if (!FORM) return;

  FORM.setAttribute("novalidate", "novalidate");

  const STORAGE_KEY = FORM.getAttribute("data-wizard-storage") || "kisala-inquiry-draft";
  const STEPS = Array.from(FORM.querySelectorAll("[data-wizard-step]")).map((el) =>
    el.getAttribute("data-wizard-step")
  );
  if (!STEPS.length) return;

  const PROGRESS = FORM.querySelector("[data-wizard-progress]");
  const SIZE_SUMMARY = FORM.querySelector("[data-size-summary]");
  const REVIEW = FORM.querySelector("[data-review-summary]");
  const CONFIRM = FORM.querySelector("[data-confirm-send]");
  const LENGTH_INPUT = FORM.querySelector("[name=vinyl_length_ft]");
  const FALLBACK = FORM.querySelector("[data-submit-fallback]");
  const FALLBACK_MAIL = FORM.querySelector("[data-fallback-mailto]");
  const FALLBACK_COPY = FORM.querySelector("[data-fallback-copy]");
  const FALLBACK_STATUS = FORM.querySelector("[data-fallback-status]");
  const SUBMIT_BTN = FORM.querySelector(".wiz-submit");
  const TO_EMAIL = "hello@swftstudios.com";
  const FORM_SUBMIT_TO = "hello@swftstudios.com";
  const SIZE_HIDDEN = {
    suggest: FORM.querySelector("[data-size-suggest]"),
    stock: FORM.querySelector("[data-size-stock]"),
    reason: FORM.querySelector("[data-size-reason]"),
    sqft: FORM.querySelector("[data-size-sqft]"),
  };

  let guide = null;
  let stepIndex = 0;
  let suppressPersist = false;

  function qs(sel) {
    return FORM.querySelector(sel);
  }

  function stepEl(id) {
    return FORM.querySelector(`[data-wizard-step="${id}"]`);
  }

  function val(name) {
    const el = FORM.elements.namedItem(name);
    if (!el) return "";
    if (el instanceof RadioNodeList) {
      const checked = Array.from(el).find((n) => n.checked);
      return checked ? checked.value : "";
    }
    return el.value || "";
  }

  function setVal(name, value) {
    const el = FORM.elements.namedItem(name);
    if (!el) return;
    if (el instanceof RadioNodeList) {
      Array.from(el).forEach((n) => {
        n.checked = n.value === value;
      });
      return;
    }
    el.value = value == null ? "" : String(value);
  }

  function selectedParts() {
    return Array.from(FORM.querySelectorAll("[data-part]:checked")).map((el) => el.value);
  }

  function setParts(parts) {
    const set = new Set(parts || []);
    FORM.querySelectorAll("[data-part]").forEach((el) => {
      el.checked = set.has(el.value);
    });
    syncExclusiveParts();
  }

  function syncExclusiveParts() {
    const full = FORM.querySelector('[data-part][value="full_bike"]');
    if (!full) return;
    const others = Array.from(FORM.querySelectorAll("[data-part]")).filter((el) => el.value !== "full_bike");
    if (full.checked) {
      others.forEach((el) => {
        el.checked = false;
        el.disabled = true;
      });
    } else {
      others.forEach((el) => {
        el.disabled = false;
      });
    }
  }

  function bodyClass() {
    return val("bike_body_class") || "unknown";
  }

  function finishKey() {
    return val("vinyl_finish") || val("finish") || "";
  }

  function roundToStock(feet, stock) {
    const list = stock || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] >= feet) return list[i];
    }
    return list.length ? list[list.length - 1] : Math.ceil(feet);
  }

  function computeSize() {
    if (!guide) {
      return {
        rawFt: 0,
        suggestFt: 0,
        stockFt: 0,
        safeFt: 0,
        sqft: 0,
        reason: "Size guide still loading…",
        filmLabel: "",
        packageLabel: "",
      };
    }

    const parts = selectedParts();
    const body = bodyClass();
    const finish = finishKey();
    const film = guide.filmDifficulty[finish] || guide.filmDifficulty._default;
    const fullMeta = guide.fullPackageByBody[body] || guide.fullPackageByBody.unknown;
    const fairingMul = guide.fairingMultiplierByBody[body] || 1;
    let raw = 0;
    const bits = [];

    if (!parts.length) {
      return {
        rawFt: 0,
        suggestFt: 0,
        stockFt: 0,
        safeFt: 0,
        sqft: 0,
        reason: "Pick what you want wrapped to estimate film length.",
        filmLabel: film.label,
        packageLabel: "",
      };
    }

    if (parts.includes("full_bike")) {
      raw = fullMeta.ft;
      bits.push(`${fullMeta.label}: ~${fullMeta.ft} ft`);
    } else {
      parts.forEach((id) => {
        const part = guide.parts[id];
        if (!part || part.baseFt == null) return;
        let add = part.baseFt;
        if (id === "fairings") add = Math.round(part.baseFt * fairingMul * 10) / 10;
        raw += add;
        bits.push(`${part.label}: ~${add} ft`);
      });
    }

    const withWaste = raw * (film.waste || 1.2);
    const suggestFt = Math.ceil(withWaste);
    const stockFt = roundToStock(suggestFt, guide.stockLengthsFt);
    const safeFt = roundToStock(suggestFt + (guide.safeExtraFt || 2), guide.stockLengthsFt);
    const width = guide.rollWidthFt || 5;
    const sqft = Math.round(stockFt * width);

    bits.push(`Film handling ×${(film.waste || 1.2).toFixed(2)} (${film.label})`);

    return {
      rawFt: Math.round(raw * 10) / 10,
      suggestFt,
      stockFt,
      safeFt,
      sqft,
      reason: bits.join(" · "),
      filmLabel: film.label,
      packageLabel: parts.includes("full_bike") ? fullMeta.label : parts.map((p) => (guide.parts[p] || {}).label || p).join(", "),
      widthFt: width,
      difficulty: film.level || 2,
    };
  }

  function writeSizeFields(size) {
    if (SIZE_HIDDEN.suggest) SIZE_HIDDEN.suggest.value = size.suggestFt ? String(size.suggestFt) : "";
    if (SIZE_HIDDEN.stock) SIZE_HIDDEN.stock.value = size.stockFt ? `${size.widthFt || 5}ft x ${size.stockFt}ft` : "";
    if (SIZE_HIDDEN.reason) SIZE_HIDDEN.reason.value = size.reason || "";
    if (SIZE_HIDDEN.sqft) SIZE_HIDDEN.sqft.value = size.sqft ? String(size.sqft) : "";
  }

  function renderSize() {
    const size = computeSize();
    writeSizeFields(size);

    if (LENGTH_INPUT && document.activeElement !== LENGTH_INPUT) {
      if (size.stockFt) LENGTH_INPUT.value = String(size.stockFt);
      else if (!LENGTH_INPUT.value) LENGTH_INPUT.value = "";
    }

    if (!SIZE_SUMMARY) return;
    if (!size.stockFt) {
      SIZE_SUMMARY.innerHTML = `<p class="wiz-size-empty">${escapeHtml(size.reason)}</p>`;
      return;
    }

    const length = Number(LENGTH_INPUT && LENGTH_INPUT.value) || size.stockFt;
    const orderLabel = `${size.widthFt || 5}ft × ${length}ft`;
    const sq = Math.round(length * (size.widthFt || 5));
    SIZE_SUMMARY.innerHTML = `
      <div class="wiz-size-card">
        <p class="wiz-size-kicker">Suggested Metro order</p>
        <p class="wiz-size-hero">${escapeHtml(orderLabel)}</p>
        <p class="wiz-size-meta">~${sq} sq ft · difficulty ${size.difficulty}/5 · ${escapeHtml(size.filmLabel)}</p>
        <p class="wiz-size-reason">${escapeHtml(size.reason)}</p>
        <p class="wiz-size-alt">Safer buffer if you're new to this film: <strong>${size.widthFt || 5}ft × ${size.safeFt}ft</strong></p>
      </div>`;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function coverageFromParts() {
    const parts = selectedParts();
    if (parts.includes("full_bike")) return "Full transformation";
    if (parts.includes("tank") && parts.length === 1) return "Tank / PPF only";
    if (parts.length) return "Accent package";
    return val("coverage") || "";
  }

  function syncCoverageField() {
    const coverage = FORM.elements.namedItem("coverage");
    if (!coverage) return;
    const derived = coverageFromParts();
    if (derived) coverage.value = derived;
  }

  function renderProgress() {
    if (!PROGRESS) return;
    const id = STEPS[stepIndex];
    const labels = {
      bike: "Bike",
      parts: "Parts",
      finish: "Finish",
      size: "Film size",
      contact: "Contact",
      review: "Review",
    };
    PROGRESS.innerHTML = STEPS.map((step, i) => {
      const state = i === stepIndex ? "is-current" : i < stepIndex ? "is-done" : "";
      return `<button type="button" class="wiz-dot ${state}" data-wizard-goto="${step}" aria-current="${i === stepIndex ? "step" : "false"}"><span class="wiz-dot-num">${i + 1}</span><span class="wiz-dot-label">${labels[step] || step}</span></button>`;
    }).join("");
  }

  function renderReview() {
    if (!REVIEW) return;
    const size = computeSize();
    const length = Number(LENGTH_INPUT && LENGTH_INPUT.value) || size.stockFt || "";
    const orderSize = length ? `${size.widthFt || 5}ft × ${length}ft` : "Not set";
    const parts = selectedParts()
      .map((p) => (guide && guide.parts[p] ? guide.parts[p].label : p))
      .join(", ");
    const vinyl =
      val("vinyl_color") ||
      val("vinyl_color_query") ||
      "No specific Metro color picked";
    const vinylLink = val("vinyl_url");

    const rows = [
      ["Bike", [val("year"), val("make"), val("model")].filter(Boolean).join(" ") || val("bike") || "—", "bike"],
      ["Parts", parts || "—", "parts"],
      ["Finish", val("finish") || "—", "finish"],
      ["Vinyl color", vinyl, "finish"],
      ["Suggested film", orderSize, "size"],
      ["Timeline", val("timeline") || "—", "contact"],
      ["Name", val("name") || "—", "contact"],
      ["Email", val("email") || "—", "contact"],
      ["Phone", val("phone") || "—", "contact"],
      ["Notes", val("msg") || "—", "contact"],
    ];

    REVIEW.innerHTML = rows
      .map(([label, value, goto]) => {
        const extra =
          label === "Vinyl color" && vinylLink
            ? ` <a href="${escapeHtml(vinylLink)}" target="_blank" rel="noopener">View on Metro</a>`
            : "";
        return `<div class="wiz-review-row">
          <div>
            <p class="wiz-review-label">${escapeHtml(label)}</p>
            <p class="wiz-review-value">${escapeHtml(value)}${extra}</p>
          </div>
          <button type="button" class="wiz-edit" data-wizard-goto="${goto}">Edit</button>
        </div>`;
      })
      .join("");
  }

  function showStep(index, opts) {
    const clamp = Math.max(0, Math.min(STEPS.length - 1, index));
    stepIndex = clamp;
    const id = STEPS[stepIndex];
    FORM.querySelectorAll("[data-wizard-step]").forEach((panel) => {
      const on = panel.getAttribute("data-wizard-step") === id;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });

    if (id === "size") renderSize();
    if (id === "review") {
      syncCoverageField();
      renderSize();
      renderReview();
    }
    renderProgress();

    FORM.querySelectorAll("[data-wizard-back]").forEach((btn) => {
      btn.hidden = stepIndex === 0;
    });
    FORM.querySelectorAll("[data-wizard-next]").forEach((btn) => {
      btn.hidden = id === "review";
    });
    FORM.querySelectorAll("[data-wizard-submit-wrap]").forEach((el) => {
      el.hidden = id !== "review";
    });

    if (!opts || opts.scroll !== false) {
      const anchor = FORM.querySelector("[data-wizard-top]") || FORM;
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    persist();
  }

  function validateStep(id) {
    const panel = stepEl(id);
    if (!panel) return true;

    // Special: parts step needs ≥1 part
    if (id === "parts") {
      if (!selectedParts().length) {
        const hint = panel.querySelector("[data-parts-error]");
        if (hint) {
          hint.hidden = false;
          hint.textContent = "Pick at least one area to wrap.";
        }
        return false;
      }
      const hint = panel.querySelector("[data-parts-error]");
      if (hint) hint.hidden = true;
      return true;
    }

    if (id === "size") {
      const n = Number(LENGTH_INPUT && LENGTH_INPUT.value);
      if (!n || n < 1) {
        if (LENGTH_INPUT) LENGTH_INPUT.reportValidity();
        return false;
      }
      return true;
    }

    if (id === "review") {
      if (CONFIRM && !CONFIRM.checked) {
        CONFIRM.focus();
        const err = FORM.querySelector("[data-confirm-error]");
        if (err) {
          err.hidden = false;
          err.textContent = "Confirm your request before sending.";
        }
        return false;
      }
      return true;
    }

    for (const el of panel.querySelectorAll("input, select, textarea")) {
      if (el.disabled || el.type === "hidden") continue;
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    return true;
  }

  function goNext() {
    const id = STEPS[stepIndex];
    if (!validateStep(id)) return;
    if (id === "parts") syncCoverageField();
    if (id === "finish" || id === "parts") renderSize();
    showStep(stepIndex + 1);
  }

  function goBack() {
    showStep(stepIndex - 1);
  }

  function goTo(stepId) {
    const idx = STEPS.indexOf(stepId);
    if (idx < 0) return;
    // Allow editing prior steps freely; only block skipping ahead past invalid
    if (idx > stepIndex) {
      for (let i = stepIndex; i < idx; i++) {
        if (!validateStep(STEPS[i])) {
          showStep(i);
          return;
        }
      }
    }
    showStep(idx);
  }

  function collectDraft() {
    const data = {
      v: 1,
      step: STEPS[stepIndex],
      fields: {},
      parts: selectedParts(),
      confirm: !!(CONFIRM && CONFIRM.checked),
      savedAt: Date.now(),
    };
    Array.from(FORM.elements).forEach((el) => {
      if (!el.name || el.name === "_honey") return;
      if (el.type === "checkbox" && el.hasAttribute("data-part")) return;
      if (el.type === "checkbox" && el.hasAttribute("data-confirm-send")) return;
      if (el.type === "radio" && !el.checked) return;
      data.fields[el.name] = el.value;
    });
    return data;
  }

  function persist() {
    if (suppressPersist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectDraft()));
    } catch (_) {
      /* private mode */
    }
  }

  function restore() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return false;
    }
    if (!raw) return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return false;
    }
    if (!data || !data.fields) return false;

    suppressPersist = true;
    Object.keys(data.fields).forEach((name) => {
      if (name === "_honey") return;
      setVal(name, data.fields[name]);
    });
    setParts(data.parts || []);
    if (CONFIRM) CONFIRM.checked = !!data.confirm;

    const selected = FORM.querySelector("[data-vinyl-selected]");
    const clearBtn = FORM.querySelector("[data-vinyl-clear]");
    const label = data.fields.vinyl_color;
    const url = data.fields.vinyl_url;
    if (selected && label) {
      selected.hidden = false;
      const link = url
        ? `<a class="vinyl-picked-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">View on Metro</a>`
        : "";
      selected.innerHTML = `<div class="vinyl-picked-copy"><strong>${escapeHtml(label)}</strong>${link}</div>`;
      if (clearBtn) clearBtn.hidden = false;
    }

    const idx = STEPS.indexOf(data.step);
    showStep(idx >= 0 ? idx : 0, { scroll: false });
    suppressPersist = false;

    // Re-apply bike make/model after bike-search finishes populating
    const savedMake = data.fields.make || "";
    const savedModel = data.fields.model || "";
    if (savedMake) {
      waitForBikeOptions().then(() => {
        const make = FORM.querySelector("[data-bike-make]");
        const model = FORM.querySelector("[data-bike-model]");
        if (!make) return;
        make.value = savedMake;
        make.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          if (model && savedModel) {
            model.value = savedModel;
            model.dispatchEvent(new Event("change", { bubbles: true }));
          }
          persist();
        }, 150);
      });
    }
    return true;
  }

  function waitForBikeOptions(maxMs = 4000) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function tick() {
        const make = FORM.querySelector("[data-bike-make]");
        if (make && make.options.length > 3) {
          resolve();
          return;
        }
        if (Date.now() - start > maxMs) {
          resolve();
          return;
        }
        setTimeout(tick, 100);
      })();
    });
  }

  function clearDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  async function loadGuide() {
    try {
      const res = await fetch("/data/vinyl-size-guide.json", { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      guide = await res.json();
    } catch (err) {
      console.warn("Vinyl size guide failed to load", err);
      guide = {
        rollWidthFt: 5,
        stockLengthsFt: [5, 10, 15, 20, 25, 30],
        parts: {},
        fullPackageByBody: { unknown: { ft: 18, label: "General" } },
        fairingMultiplierByBody: { unknown: 1 },
        filmDifficulty: { _default: { waste: 1.2, label: "General buffer", level: 2 } },
        safeExtraFt: 2,
      };
    }
    renderSize();
  }

  // Events
  FORM.addEventListener("click", (e) => {
    const next = e.target.closest("[data-wizard-next]");
    if (next && FORM.contains(next)) {
      e.preventDefault();
      goNext();
      return;
    }
    const back = e.target.closest("[data-wizard-back]");
    if (back && FORM.contains(back)) {
      e.preventDefault();
      goBack();
      return;
    }
    const goto = e.target.closest("[data-wizard-goto]");
    if (goto && FORM.contains(goto)) {
      e.preventDefault();
      goTo(goto.getAttribute("data-wizard-goto"));
    }
  });

  FORM.addEventListener("change", (e) => {
    if (e.target && e.target.matches("[data-part]")) {
      syncExclusiveParts();
      syncCoverageField();
      renderSize();
    }
    if (e.target && (e.target.name === "finish" || e.target.hasAttribute("data-vinyl-finish"))) {
      renderSize();
    }
    persist();
  });

  FORM.addEventListener("input", () => {
    if (STEPS[stepIndex] === "size") renderSize();
    persist();
  });

  // Soft-refresh size when bike labor meta changes
  const bodyMeta = FORM.querySelector("[data-bike-body-class]");
  if (bodyMeta) {
    const obs = new MutationObserver(() => renderSize());
    obs.observe(bodyMeta, { attributes: true, attributeFilter: ["value"] });
    bodyMeta.addEventListener("change", () => renderSize());
  }
  // bike-search sets .value without events — poll lightly while on relevant steps
  setInterval(() => {
    if (STEPS[stepIndex] === "size" || STEPS[stepIndex] === "review") renderSize();
  }, 800);

  function buildSummaryText() {
    const size = computeSize();
    const length = Number(LENGTH_INPUT && LENGTH_INPUT.value) || size.stockFt || "";
    const orderSize = length ? `${size.widthFt || 5}ft x ${length}ft` : "Not set";
    const parts = selectedParts()
      .map((p) => (guide && guide.parts[p] ? guide.parts[p].label : p))
      .join(", ");
    return [
      "Kisala Films wrap inquiry",
      "",
      `Name: ${val("name")}`,
      `Phone: ${val("phone")}`,
      `Email: ${val("email")}`,
      `Bike: ${[val("year"), val("make"), val("model")].filter(Boolean).join(" ") || val("bike")}`,
      `Body class: ${val("bike_body_class") || ""}`,
      `Parts: ${parts}`,
      `Coverage: ${val("coverage")}`,
      `Finish: ${val("finish")}`,
      `Vinyl color: ${val("vinyl_color") || val("vinyl_color_query") || "n/a"}`,
      `Vinyl URL: ${val("vinyl_url") || "n/a"}`,
      `Film order: ${orderSize}`,
      `Size reason: ${val("vinyl_size_reason") || size.reason || ""}`,
      `Timeline: ${val("timeline")}`,
      `Notes: ${val("msg") || "(none)"}`,
    ].join("\n");
  }

  function buildMailtoHref() {
    const subjectEl = FORM.querySelector('input[name="_subject"]');
    const subject = encodeURIComponent((subjectEl && subjectEl.value) || "Kisala Films - wrap inquiry");
    const body = encodeURIComponent(buildSummaryText());
    return `mailto:${TO_EMAIL}?subject=${subject}&body=${body}`;
  }

  function showFallback(message) {
    if (FALLBACK_MAIL) FALLBACK_MAIL.href = buildMailtoHref();
    if (FALLBACK) FALLBACK.hidden = false;
    if (FALLBACK_STATUS) {
      FALLBACK_STATUS.hidden = false;
      FALLBACK_STATUS.textContent = message || "Mail service timed out. Use email backup below.";
    }
    if (SUBMIT_BTN) {
      SUBMIT_BTN.classList.remove("is-sending");
      SUBMIT_BTN.textContent = SUBMIT_BTN.getAttribute("data-default-label") || "Try send again →";
    }
  }

  function hideFallback() {
    if (FALLBACK) FALLBACK.hidden = true;
    if (FALLBACK_STATUS) FALLBACK_STATUS.hidden = true;
  }

  async function postViaFormSubmitAjax() {
    const fd = new FormData(FORM);
    fd.set("_captcha", "false");
    fd.set("_template", "table");
    fd.set("_honey", "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${FORM_SUBMIT_TO}`, {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (data.success === "false" || data.success === false) {
        throw new Error(data.message || "FormSubmit rejected the send");
      }
      return true;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  FORM.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (STEPS[stepIndex] !== "review") {
      goNext();
      return;
    }

    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(STEPS[i])) {
        showStep(i);
        validateStep(STEPS[i]);
        return;
      }
    }

    const model = FORM.querySelector("[data-bike-model]");
    if (model && model.disabled) model.disabled = false;

    syncCoverageField();
    const size = computeSize();
    writeSizeFields(size);
    const partsSummary = FORM.querySelector("[data-parts-summary]");
    if (partsSummary) {
      partsSummary.value = selectedParts()
        .map((p) => (guide && guide.parts[p] ? guide.parts[p].label : p))
        .join(", ");
    }
    if (LENGTH_INPUT && LENGTH_INPUT.value) {
      if (SIZE_HIDDEN.stock) {
        SIZE_HIDDEN.stock.value = `${size.widthFt || 5}ft x ${LENGTH_INPUT.value}ft`;
      }
      if (SIZE_HIDDEN.sqft) {
        SIZE_HIDDEN.sqft.value = String(Math.round(Number(LENGTH_INPUT.value) * (size.widthFt || 5)));
      }
    }
    const honey = FORM.querySelector('input[name="_honey"]');
    if (honey) honey.value = "";

    if (SUBMIT_BTN) {
      if (!SUBMIT_BTN.getAttribute("data-default-label")) {
        SUBMIT_BTN.setAttribute("data-default-label", SUBMIT_BTN.textContent);
      }
      SUBMIT_BTN.classList.add("is-sending");
      SUBMIT_BTN.textContent = "Sending…";
    }
    hideFallback();

    try {
      await postViaFormSubmitAjax();
      clearDraft();
      const nextInput = FORM.querySelector('input[name="_next"]');
      const next = (nextInput && nextInput.value) || `${location.pathname}?sent=1`;
      location.href = next;
    } catch (err) {
      console.warn("Inquiry send failed", err);
      const msg =
        err && err.name === "AbortError"
          ? "Timed out waiting for FormSubmit (Cloudflare 524). Your draft is saved."
          : "Couldn’t reach FormSubmit. Your draft is saved — email the request directly.";
      showFallback(msg);
    }
  });

  if (FALLBACK_COPY) {
    FALLBACK_COPY.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(buildSummaryText());
        if (FALLBACK_STATUS) {
          FALLBACK_STATUS.hidden = false;
          FALLBACK_STATUS.textContent = "Summary copied — paste into Mail or Messages.";
        }
      } catch (_) {
        if (FALLBACK_STATUS) {
          FALLBACK_STATUS.hidden = false;
          FALLBACK_STATUS.textContent = "Copy failed — use Email this request instead.";
        }
      }
    });
  }

  if (FALLBACK_MAIL) {
    FALLBACK_MAIL.addEventListener("click", () => {
      FALLBACK_MAIL.href = buildMailtoHref();
    });
  }

  // Clear draft after successful redirect
  if (/[?&]sent=1(?:&|$)/.test(location.search)) {
    clearDraft();
  }

  loadGuide().then(() => {
    const restored = restore();
    if (!restored) showStep(0, { scroll: false });
  });
})();
