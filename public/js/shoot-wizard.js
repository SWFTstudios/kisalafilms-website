/**
 * Media shoot inquiry wizard (photo / cinema / rollers).
 * Persists draft to localStorage; review step before FormSubmit Ajax.
 *
 * Form: [data-shoot-wizard]
 * Steps: shoot | vehicle | location | deliverables | contact | review
 */
(() => {
  const FORM = document.querySelector("[data-shoot-wizard]");
  if (!FORM) return;

  FORM.setAttribute("novalidate", "novalidate");

  const STORAGE_KEY = FORM.getAttribute("data-wizard-storage") || "kisala-shoot-inquiry";
  const STEPS = Array.from(FORM.querySelectorAll("[data-wizard-step]")).map((el) =>
    el.getAttribute("data-wizard-step")
  );
  if (!STEPS.length) return;

  const PROGRESS = FORM.querySelector("[data-wizard-progress]");
  const REVIEW = FORM.querySelector("[data-review-summary]");
  const CONFIRM = FORM.querySelector("[data-confirm-send]");
  const FALLBACK = FORM.querySelector("[data-submit-fallback]");
  const FALLBACK_MAIL = FORM.querySelector("[data-fallback-mailto]");
  const FALLBACK_COPY = FORM.querySelector("[data-fallback-copy]");
  const FALLBACK_STATUS = FORM.querySelector("[data-fallback-status]");
  const SUBMIT_BTN = FORM.querySelector(".wiz-submit");
  const TO_EMAIL = "hello@swftstudios.com";
  const FORM_SUBMIT_TO = "hello@swftstudios.com";

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

  function showStep(i, { scroll = true } = {}) {
    stepIndex = Math.max(0, Math.min(i, STEPS.length - 1));
    STEPS.forEach((id, idx) => {
      const el = stepEl(id);
      if (!el) return;
      const on = idx === stepIndex;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });
    const back = FORM.querySelector("[data-wizard-back]");
    const next = FORM.querySelector("[data-wizard-next]");
    const submitWrap = FORM.querySelector("[data-wizard-submit-wrap]");
    if (back) back.hidden = stepIndex === 0;
    if (next) next.hidden = STEPS[stepIndex] === "review";
    if (submitWrap) submitWrap.hidden = STEPS[stepIndex] !== "review";
    renderProgress();
    if (STEPS[stepIndex] === "review") renderReview();
    if (scroll) {
      const top = FORM.querySelector("[data-wizard-top]") || FORM;
      top.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    persist();
  }

  function renderProgress() {
    if (!PROGRESS) return;
    PROGRESS.innerHTML = STEPS.map((id, idx) => {
      const labels = {
        shoot: "Shoot",
        vehicle: "Vehicle",
        location: "Location",
        deliverables: "Deliverables",
        contact: "Contact",
        review: "Review",
      };
      const state = idx < stepIndex ? "done" : idx === stepIndex ? "on" : "";
      return `<button type="button" class="wiz-dot ${state}" data-wizard-goto="${id}" ${
        idx > stepIndex ? "disabled" : ""
      }>${labels[id] || id}</button>`;
    }).join("");
  }

  function validateStep(id) {
    const el = stepEl(id);
    if (!el) return true;
    let ok = true;
    el.querySelectorAll("[required]").forEach((field) => {
      const bad = !field.value || (field.type === "checkbox" && !field.checked);
      field.classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    if (id === "shoot") {
      const err = qs("[data-shoot-error]");
      if (!val("shoot_type")) {
        ok = false;
        if (err) {
          err.hidden = false;
          err.textContent = "Pick a shoot type to continue.";
        }
      } else if (err) err.hidden = true;
    }
    if (id === "review") {
      const err = qs("[data-confirm-error]");
      if (CONFIRM && !CONFIRM.checked) {
        ok = false;
        if (err) {
          err.hidden = false;
          err.textContent = "Confirm before sending.";
        }
      } else if (err) err.hidden = true;
    }
    return ok;
  }

  function goNext() {
    if (!validateStep(STEPS[stepIndex])) return;
    showStep(stepIndex + 1);
  }

  function goBack() {
    showStep(stepIndex - 1);
  }

  function goTo(id) {
    const idx = STEPS.indexOf(id);
    if (idx < 0 || idx > stepIndex) return;
    showStep(idx);
  }

  function renderReview() {
    if (!REVIEW) return;
    const rows = [
      ["Shoot type", val("shoot_type")],
      ["Vehicle", val("vehicle")],
      ["Look / vibe", val("vibe")],
      ["Location", val("location_pref")],
      ["Timing", val("timing")],
      ["Deliverables", val("deliverables")],
      ["Formats", val("formats")],
      ["Name", val("name")],
      ["Phone", val("phone")],
      ["Email", val("email")],
      ["Instagram", val("instagram") || "—"],
      ["Notes", val("msg") || "—"],
    ];
    REVIEW.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div class="wiz-review-row"><button type="button" class="wiz-review-edit" data-wizard-goto="${stepForField(
            label
          )}">Edit</button><strong>${label}</strong><span>${escapeHtml(value || "—")}</span></div>`
      )
      .join("");
  }

  function stepForField(label) {
    const map = {
      "Shoot type": "shoot",
      Vehicle: "vehicle",
      "Look / vibe": "vehicle",
      Location: "location",
      Timing: "location",
      Deliverables: "deliverables",
      Formats: "deliverables",
      Name: "contact",
      Phone: "contact",
      Email: "contact",
      Instagram: "contact",
      Notes: "contact",
    };
    return map[label] || "review";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function persist() {
    if (suppressPersist) return;
    const data = {
      step: STEPS[stepIndex],
      values: {},
    };
    Array.from(FORM.elements).forEach((el) => {
      if (!el.name || el.name.startsWith("_")) return;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) data.values[el.name] = el.value;
        return;
      }
      data.values[el.name] = el.value;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      /* ignore */
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
    suppressPersist = true;
    Object.entries(data.values || {}).forEach(([name, value]) => setVal(name, value));
    suppressPersist = false;
    const idx = STEPS.indexOf(data.step);
    showStep(idx >= 0 ? idx : 0, { scroll: false });
    return true;
  }

  function clearDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function buildSummaryText() {
    return [
      "Kisala Films shoot inquiry",
      "",
      `Shoot type: ${val("shoot_type")}`,
      `Vehicle: ${val("vehicle")}`,
      `Look / vibe: ${val("vibe")}`,
      `Location: ${val("location_pref")}`,
      `Timing: ${val("timing")}`,
      `Deliverables: ${val("deliverables")}`,
      `Formats: ${val("formats")}`,
      `Name: ${val("name")}`,
      `Phone: ${val("phone")}`,
      `Email: ${val("email")}`,
      `Instagram: ${val("instagram") || "n/a"}`,
      `Notes: ${val("msg") || "(none)"}`,
    ].join("\n");
  }

  function buildMailtoHref() {
    const subjectEl = FORM.querySelector('input[name="_subject"]');
    const subject = encodeURIComponent((subjectEl && subjectEl.value) || "Kisala Films - shoot inquiry");
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

  FORM.addEventListener("change", () => persist());
  FORM.addEventListener("input", () => persist());

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
      console.warn("Shoot inquiry send failed", err);
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

  if (/[?&]sent=1(?:&|$)/.test(location.search)) {
    clearDraft();
  }

  if (!restore()) showStep(0, { scroll: false });
})();
