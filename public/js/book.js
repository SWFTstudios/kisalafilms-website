/**
 * Start your build — the intake wizard at /book.
 *
 * The markup is a complete form that posts natively to /api/jobs with every
 * step showing, so a visitor without scripts can still send a build. This file
 * turns it into the step-by-step version:
 *
 *   - one step at a time, with the progress row and Back / Continue
 *   - a search over /data/motorcycles.json that fills year, make and model
 *   - photos resized on the device and uploaded as they are added, onto a
 *     draft id minted here, so the final submit is small and fast
 *   - the whole thing saved to localStorage, so a refresh loses nothing
 *   - a live summary and ballpark from kisala-config.js
 *   - the submit as JSON, and the confirmation in place
 *
 * A lead must never be lost to a script error: if the JSON submit throws or
 * the network fails, the form falls back to its native post, carrying the
 * draft id so the uploaded photos still attach.
 */
(() => {
  const root = document.querySelector("[data-book]");
  const form = document.getElementById("book-form");
  if (!root || !form) return;

  const CONFIG = window.KISALA_CONFIG || {};
  const track = (name, params) => window.KisalaTrack && window.KisalaTrack(name, params);
  const $ = (sel, scope = root) => scope.querySelector(sel);
  const $$ = (sel, scope = root) => [...scope.querySelectorAll(sel)];

  const STORE_KEY = "kf-build-draft";
  const MAX_PHOTOS = 20;
  const MAX_EDGE = 2400;
  const steps = $$(".book-step", form);
  const progress = $$("[data-progress-step]");
  const nav = $("[data-nav]");
  const backBtn = $("[data-back]");
  const nextBtn = $("[data-next]");
  const errorBox = $("[data-error]");
  const thumbs = $("[data-thumbs]");
  const fileInput = form.querySelector('input[type="file"][name="photos"]');

  /* ---- Saved state ------------------------------------------------------ */
  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
  };
  const store = (state) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  };
  const mintDraft = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return "d_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const saved = load() || {};
  const state = {
    draft: saved.draft || mintDraft(),
    step: Math.min(Math.max(Number(saved.step) || 1, 1), steps.length),
    fields: saved.fields || {},
    photos: Array.isArray(saved.photos) ? saved.photos : [],
  };
  form.elements.draft.value = state.draft;

  const fieldNames = () =>
    [...new Set([...form.elements].map((el) => el.name).filter((n) => n && n !== "photos" && n !== "draft" && n !== "source"))];

  function readFields() {
    const out = {};
    fieldNames().forEach((name) => {
      const els = [...form.elements].filter((el) => el.name === name);
      if (els[0].type === "checkbox") out[name] = els.filter((el) => el.checked).map((el) => el.value);
      else if (els[0].type === "radio") out[name] = (els.find((el) => el.checked) || {}).value || "";
      else out[name] = els[0].value;
    });
    return out;
  }

  function writeFields(values) {
    Object.entries(values).forEach(([name, value]) => {
      [...form.elements].filter((el) => el.name === name).forEach((el) => {
        if (el.type === "checkbox") el.checked = Array.isArray(value) && value.includes(el.value);
        else if (el.type === "radio") el.checked = el.value === value;
        else if (value != null) el.value = value;
      });
    });
  }

  let saveTimer = null;
  let finished = false;
  const persist = () => {
    clearTimeout(saveTimer);
    if (finished) return;
    saveTimer = setTimeout(() => {
      state.fields = readFields();
      const photos = state.photos.filter((p) => p.id).map((p) => ({ id: p.id, url: p.url }));
      store({ draft: state.draft, step: state.step, fields: state.fields, photos });
    }, 250);
  };

  /* ---- Prefill: saved draft, then links like ?service=fullWrap ---------- */
  writeFields(state.fields);
  const params = new URLSearchParams(location.search);
  const prefill = {
    service: params.get("service"),
    finish: params.get("finish"),
    colour: params.get("colour"),
    film_handle: params.get("film"),
  };
  Object.entries(prefill).forEach(([k, v]) => { if (v) writeFields({ [k]: v }); });

  // Films saved with "Add to build" in the catalog (vinyl-build.js).
  try {
    const basket = JSON.parse(localStorage.getItem("kisala-vinyl-build") || "null");
    const films = basket && Array.isArray(basket.films) ? basket.films.filter((f) => f && f.handle) : [];
    if (films.length && !form.elements.colour.value) {
      writeFields({
        colour: films.map((f) => [f.brand, f.name].filter(Boolean).join(" ")).join(", ").slice(0, 120),
        film_handle: films.map((f) => f.handle).join(",").slice(0, 120),
      });
    }
  } catch (e) { /* no basket */ }

  /* ---- Pricing helpers (mirror config-apply.js) ------------------------- */
  const MODE = CONFIG.pricingMode === "standard" ? "standard" : "founding";
  const round25 = (n) => Math.round(n / 25) * 25;
  const money = (n) => "$" + Number(n).toLocaleString("en-US");
  function servicePrice(key) {
    const entry = (CONFIG.services || {})[key];
    if (!entry || !entry.founding) return null;
    if (MODE === "founding") return entry.founding;
    if (entry.standard) return entry.standard;
    const up = CONFIG.standardUplift || 1;
    return { low: round25(entry.founding.low * up), high: round25(entry.founding.high * up) };
  }
  const transportFee = (id) =>
    (Object.values(CONFIG.transport || {}).find((t) => t.id === id) || {}).fee || 0;

  /* ---- Bike search ------------------------------------------------------ */
  let bikes = null;
  let bands = {};
  let bikesLoading = null;
  const makeList = $("#bike-makes");
  const search = $("#bike-search");
  const results = $("#bike-results");
  const searchWrap = $("[data-bike-search]");
  if (searchWrap) searchWrap.hidden = false;

  const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  function loadBikes() {
    if (!bikesLoading) {
      bikesLoading = fetch("/data/motorcycles.json")
        .then((r) => r.json())
        .then((data) => {
          bands = data.laborBands || {};
          bikes = (data.bikes || []).map((b) => ({ ...b, key: normal(b.l) }));
          const makes = [...new Set(bikes.map((b) => b.m))].sort();
          if (makeList) makeList.innerHTML = makes.map((m) => `<option value="${m}">`).join("");
          update();
        })
        .catch(() => { bikes = []; });
    }
    return bikesLoading;
  }

  let active = -1;
  let matches = [];
  function renderResults() {
    const q = search.value.trim();
    if (!q || !bikes) { results.hidden = true; search.setAttribute("aria-expanded", "false"); return; }
    const words = q.toLowerCase().split(/\s+/).map(normal).filter(Boolean);
    matches = bikes.filter((b) => words.every((w) => b.key.includes(w))).slice(0, 8);
    active = -1;
    results.innerHTML = "";
    matches.forEach((b, i) => {
      const li = document.createElement("li");
      li.id = `bike-opt-${i}`;
      li.setAttribute("role", "option");
      li.innerHTML = `<span></span><span class="meta"></span>`;
      li.children[0].textContent = b.l;
      li.children[1].textContent = (bands[b.c] || {}).label ? bands[b.c].label.split(" — ")[0] : "";
      li.addEventListener("mousedown", (e) => { e.preventDefault(); chooseBike(b); });
      results.appendChild(li);
    });
    const other = document.createElement("li");
    other.className = "bike-results-other";
    other.setAttribute("role", "option");
    other.textContent = matches.length ? "Not listed? Type the make and model below" : "No match. Type the make and model below";
    other.addEventListener("mousedown", (e) => { e.preventDefault(); results.hidden = true; $("#bike-make").focus(); });
    results.appendChild(other);
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }

  function chooseBike(b) {
    form.elements.bike_make.value = b.m;
    form.elements.bike_model.value = b.o;
    form.elements.body_class.value = b.c || "";
    search.value = b.l;
    results.hidden = true;
    search.setAttribute("aria-expanded", "false");
    if (!form.elements.bike_year.value) form.elements.bike_year.focus();
    update();
  }

  if (search) {
    search.addEventListener("focus", loadBikes);
    search.addEventListener("input", () => loadBikes().then(renderResults));
    search.addEventListener("blur", () => setTimeout(() => (results.hidden = true), 120));
    search.addEventListener("keydown", (e) => {
      const items = [...results.children];
      if (results.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
        search.setAttribute("aria-activedescendant", items[active].id || "");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (active >= 0 && matches[active]) chooseBike(matches[active]);
        else if (matches[0]) chooseBike(matches[0]);
      } else if (e.key === "Escape") {
        results.hidden = true;
      }
    });
  }
  // A hand-typed make/model drops the body class from an earlier search pick.
  ["bike_make", "bike_model"].forEach((n) =>
    form.elements[n].addEventListener("input", () => (form.elements.body_class.value = ""))
  );

  /* ---- Conditional fields, summary, ballpark ---------------------------- */
  const WRAP_SERVICES = new Set(["fullWrap", "ppf", "partialWrap", "customPrint"]);
  const label = (name) => {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    if (!el) return "";
    const card = el.closest("label");
    return (card.querySelector(".choice-title") || card.querySelector("span")).textContent.trim();
  };

  function update() {
    const f = readFields();
    const showCoverage = WRAP_SERVICES.has(f.service);
    const showPanels = f.service === "partialWrap" || f.service === "chromeDelete" ||
      (showCoverage && (f.coverage === "partial" || f.coverage === "panels"));
    $('[data-when="coverage"]').classList.toggle("is-shown", showCoverage);
    $('[data-when="panels"]').classList.toggle("is-shown", showPanels);
    $('[data-when="zip"]').classList.toggle("is-shown", f.handoff === "pickup" || f.handoff === "round-trip");

    const bike = [f.bike_year, f.bike_make, f.bike_model].filter(Boolean).join(" ");
    $('[data-sum="bike"]').textContent = bike || "—";
    $('[data-sum="service"]').textContent =
      [label("service"), showCoverage ? label("coverage") : ""].filter(Boolean).join(", ") || "—";
    $('[data-sum="finish"]').textContent = [label("finish"), f.colour].filter(Boolean).join(", ") || "—";
    $('[data-sum="photos"]').textContent = String(state.photos.filter((p) => p.id).length);
    $('[data-sum="handoff"]').textContent = label("handoff") || "—";

    const est = estimate(f);
    const box = $("[data-estimate]");
    box.hidden = !est;
    if (est) {
      $("[data-estimate-figure]").textContent = `${money(est.low)}–${money(est.high)}`;
      $("[data-estimate-note]").textContent = est.transport
        ? `Plus ${money(est.transport)} transport. A starting range for this kind of bike; your written quote is the real number.`
        : "A starting range for this kind of bike. Your written quote is the real number.";
    }
  }

  function estimate(f) {
    const price = servicePrice(f.service);
    if (!price) return null;
    const entry = CONFIG.services[f.service];
    const band = bands[f.body_class] || null;
    const difficulty = band && band.difficulty != null ? band.difficulty : 3;
    const factor = entry.scales ? 1 + 0.18 * (difficulty - 3) : 1;
    return {
      low: round25(price.low * factor),
      high: round25(price.high * factor),
      transport: transportFee(f.handoff),
    };
  }

  form.addEventListener("input", (e) => {
    // Fixing the field that was flagged clears the message about it.
    const field = e.target.closest && e.target.closest(".field.is-invalid");
    if (field) { field.classList.remove("is-invalid"); showError(""); }
    update();
    persist();
  });
  form.addEventListener("change", () => { update(); persist(); });

  /* ---- Steps ------------------------------------------------------------ */
  function showError(message) {
    errorBox.textContent = message || "";
    errorBox.hidden = !message;
  }

  function validate(n) {
    const f = readFields();
    const bad = [];
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    const flag = (name) => {
      const el = form.elements[name];
      const field = (el.length ? el[0] : el).closest(".field");
      if (field) field.classList.add("is-invalid");
      bad.push(el.length ? el[0] : el);
    };
    if (n === 1) {
      if (!f.bike_make.trim()) flag("bike_make");
      if (!f.bike_model.trim()) flag("bike_model");
      if (bad.length) return [bad, "Add your bike's make and model. Search above, or type them in."];
    }
    if (n === 2 && !f.service) return [[form.elements.service[0]], "Choose the work you have in mind, or “Not sure yet”."];
    if (n === 3 && state.photos.some((p) => p.uploading)) return [[], "Photos are still uploading. One moment."];
    if (n === 4 && (f.handoff === "pickup" || f.handoff === "round-trip") && !/^\d{5}/.test(f.pickup_zip.trim())) {
      flag("pickup_zip");
      return [bad, "Add the ZIP code to collect from."];
    }
    if (n === 5) {
      if (!f.name.trim()) flag("name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) flag("email");
      if (bad.length) return [bad, "Add your name and a valid email, so the quote can reach you."];
    }
    return null;
  }

  function go(n, focus = true) {
    state.step = Math.min(Math.max(n, 1), steps.length);
    steps.forEach((s, i) => s.classList.toggle("is-current", i + 1 === state.step));
    progress.forEach((p, i) => {
      p.classList.toggle("is-current", i + 1 === state.step);
      p.classList.toggle("is-done", i + 1 < state.step);
    });
    backBtn.hidden = state.step === 1;
    nextBtn.hidden = state.step === steps.length;
    showError("");
    persist();
    if (focus) {
      const current = steps[state.step - 1];
      current.querySelector("legend").scrollIntoView({ behavior: "smooth", block: "center" });
      const first = current.querySelector("input:not([type=hidden]):not([type=file]), select, textarea");
      if (first && window.matchMedia("(min-width: 1000px)").matches) first.focus({ preventScroll: true });
    }
    track("book_step", { step: state.step });
  }

  function next() {
    const problem = validate(state.step);
    if (problem) {
      showError(problem[1]);
      if (problem[0][0]) problem[0][0].focus();
      return;
    }
    if (state.step === 3 && !state.photos.some((p) => p.id) && !next.warned) {
      next.warned = true;
      showError("No photos yet. You can carry on, but photos make the quote far more accurate.");
      return;
    }
    go(state.step + 1);
  }

  nav.hidden = false;
  backBtn.addEventListener("click", () => go(state.step - 1));
  nextBtn.addEventListener("click", next);

  /* ---- Photos ----------------------------------------------------------- */
  const dropzone = $("[data-dropzone]");

  function thumbFor(photo) {
    const li = document.createElement("li");
    li.className = "thumb";
    li.innerHTML = '<img alt=""><span class="thumb-bar"></span><button class="thumb-remove" type="button" aria-label="Remove photo">&times;</button>';
    li.querySelector("img").src = photo.preview || photo.url;
    li.querySelector("button").addEventListener("click", () => removePhoto(photo, li));
    photo.el = li;
    thumbs.appendChild(li);
    return li;
  }

  async function removePhoto(photo, li) {
    li.remove();
    state.photos = state.photos.filter((p) => p !== photo);
    if (photo.xhr) photo.xhr.abort();
    if (photo.id) {
      fetch(`/api/uploads/${photo.id}?draft=${state.draft}`, { method: "DELETE" }).catch(() => {});
    }
    update();
    persist();
  }

  /** Resize to MAX_EDGE on the long side as JPEG. Anything the browser can't
   *  decode (HEIC outside Safari) goes up as it is. */
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.type === "image/jpeg" && file.size < 2.5e6) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      return blob || file;
    } catch (e) {
      return file;
    }
  }

  function upload(photo, blob) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      photo.xhr = xhr;
      xhr.open("POST", `/api/uploads?draft=${encodeURIComponent(state.draft)}`);
      xhr.setRequestHeader("Content-Type", blob.type || "image/jpeg");
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) photo.el.style.setProperty("--up", (e.loaded / e.total).toFixed(3));
      });
      xhr.addEventListener("load", () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* empty */ }
        resolve(xhr.status === 201 ? data : { error: data.error || "Upload failed." });
      });
      xhr.addEventListener("error", () => resolve({ error: "Upload failed. Check your connection." }));
      xhr.addEventListener("abort", () => resolve({ error: "aborted" }));
      xhr.send(blob);
    });
  }

  async function addFiles(files) {
    const room = MAX_PHOTOS - state.photos.length;
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    if (list.length > room) showError(`Up to ${MAX_PHOTOS} photos. The first ${Math.max(room, 0)} were added.`);
    for (const file of list.slice(0, Math.max(room, 0))) {
      const photo = { preview: URL.createObjectURL(file), uploading: true };
      state.photos.push(photo);
      const li = thumbFor(photo);
      li.classList.add("is-uploading");
      const blob = await shrink(file);
      const typed = blob.type ? blob : new Blob([blob], { type: /heif$/i.test(file.name) ? "image/heif" : "image/heic" });
      const result = await upload(photo, typed);
      photo.uploading = false;
      li.classList.remove("is-uploading");
      if (result.id) {
        photo.id = result.id;
        photo.url = result.url;
        track("book_photo_upload");
      } else if (result.error !== "aborted") {
        li.classList.add("is-failed");
        showError(result.error);
      }
      update();
      persist();
    }
  }

  if (fileInput) {
    // The input stays in the form for the native fallback; once the wizard
    // owns uploads it must not carry files on a fallback post as well.
    fileInput.addEventListener("change", () => {
      addFiles(fileInput.files);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((t) =>
      dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); })
    );
    ["dragleave", "drop"].forEach((t) =>
      dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove("is-over"); })
    );
    dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  }

  // Photos from a saved draft come back from the server by draft id.
  state.photos.forEach((p) => { if (p.id) thumbFor(p); });

  /* ---- Submit ----------------------------------------------------------- */
  let submitting = false;

  function payload() {
    const f = readFields();
    const est = estimate(f);
    return {
      draft: state.draft,
      source: "book",
      name: f.name,
      email: f.email,
      phone: f.phone,
      bike: { year: f.bike_year, make: f.bike_make, model: f.bike_model, colour: f.bike_colour, mileage: f.bike_mileage, vin: f.bike_vin },
      service: f.service,
      coverage: f.coverage,
      panels: f.panels,
      finish: f.finish,
      colour: f.colour,
      filmHandle: f.film_handle,
      notes: f.notes,
      inspiration: f.inspiration,
      preferredDates: f.preferred_dates,
      handoff: f.handoff,
      pickupZip: f.pickup_zip,
      estimate: est ? { low: est.low, high: est.high } : null,
    };
  }

  function nativeFallback() {
    // Let the browser post the form as it stands; the Worker accepts that too.
    submitting = true;
    HTMLFormElement.prototype.submit.call(form);
  }

  form.addEventListener("submit", async (e) => {
    if (submitting) return;
    e.preventDefault();
    // Enter in a field on an earlier step means "continue", not "send".
    if (state.step < steps.length) { next(); return; }
    for (let n = 1; n <= steps.length; n++) {
      const problem = validate(n);
      if (problem) {
        go(n);
        showError(problem[1]);
        return;
      }
    }

    const button = $("[data-submit]");
    button.disabled = true;
    button.firstChild.textContent = "Sending… ";
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400) {
        showError(data.error || "Something is missing. Check the steps above.");
        button.disabled = false;
        button.firstChild.textContent = "Send my build ";
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

      track("book_submit", { service: payload().service, photos: state.photos.filter((p) => p.id).length });
      finished = true;
      clearTimeout(saveTimer);
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
      showDone(data);
    } catch (err) {
      console.error("JSON submit failed, posting the form natively", err);
      nativeFallback();
    }
  });

  function showDone(data) {
    form.hidden = true;
    $(".book-progress").hidden = true;
    const done = $("[data-done]");
    $("[data-done-ref]").textContent = data.ref || "";
    $("[data-done-email]").textContent = form.elements.email.value.trim();
    if (data.devLink) {
      $("[data-done-dev]").hidden = false;
      $("[data-done-dev-link]").href = data.devLink;
      $("[data-done-dev-code]").textContent = data.devCode || "";
    }
    done.hidden = false;
    done.scrollIntoView({ behavior: "smooth", block: "start" });
    done.focus({ preventScroll: true });
  }

  /* ---- Start ------------------------------------------------------------ */
  if (form.elements.body_class.value || state.fields.body_class) loadBikes();
  update();
  go(state.step, false);
  // A native post the Worker rejected comes back as ?error=…
  if (params.get("error")) showError(params.get("error"));
})();
