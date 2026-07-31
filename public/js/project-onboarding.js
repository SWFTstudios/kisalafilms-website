/**
 * Vinyl project onboarding — multi-colour build → surface → setup →
 * details → save or payment. Quote is previewed then recomputed server-side.
 */
(() => {
  const root = document.querySelector("[data-project-root]");
  if (!root) return;

  const STORAGE_KEY = "kisala-vinyl-projects";
  const params = new URLSearchParams(window.location.search);
  const Build = window.KisalaVinylBuild;

  const state = {
    step: 0,
    surface: null,
    coverage: "full",
    projectId: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    quote: null,
    firebaseUid: null,
  };

  const els = {
    banner: root.querySelector("[data-project-banner]"),
    error: root.querySelector("[data-project-error]"),
    steps: root.querySelectorAll("[data-step-indicator]"),
    panels: root.querySelectorAll("[data-mission]"),
    xp: root.querySelector("[data-project-xp]"),
    xpLabel: root.querySelector("[data-project-xp-label]"),
    filmCard: root.querySelector("[data-project-film-card]"),
    filmName: root.querySelector("[data-project-film-name]"),
    filmMeta: root.querySelector("[data-project-film-meta]"),
    buildFilms: root.querySelector("[data-build-films]"),
    surfaceBtns: root.querySelectorAll("[data-surface]"),
    coverageBtns: root.querySelectorAll("[data-coverage]"),
    setupMoto: root.querySelector("[data-setup-motorcycle]"),
    setupHelmet: root.querySelector("[data-setup-helmet]"),
    setupLede: root.querySelector("[data-setup-lede]"),
    bikeDifficulty: root.querySelector("[data-bike-difficulty]"),
    bikeBody: root.querySelector("[data-bike-body-class]"),
    bikeLabel: root.querySelector("[data-bike-label]"),
    bikeYear: root.querySelector("[data-bike-year]"),
    bikeMake: root.querySelector("[data-bike-make]"),
    bikeModel: root.querySelector("[data-bike-model]"),
    bikeNote: root.querySelector("[data-bike-difficulty-note]"),
    helmetNotes: root.querySelector("[data-helmet-notes]"),
    name: root.querySelector("[data-customer-name]"),
    email: root.querySelector("[data-customer-email]"),
    phone: root.querySelector("[data-customer-phone]"),
    authStatus: root.querySelector("[data-auth-status]"),
    quoteBoard: root.querySelector("[data-quote-board]"),
    saveBtn: root.querySelector("[data-project-save]"),
    payBtn: root.querySelector("[data-project-pay]"),
  };

  const money = (n) =>
    "$" +
    Number(n || 0).toLocaleString("en-US", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function films() {
    return Build ? Build.list() : [];
  }

  function showError(msg) {
    if (!els.error) return;
    els.error.hidden = !msg;
    els.error.textContent = msg || "";
  }

  function showBanner(msg) {
    if (!els.banner) return;
    els.banner.hidden = !msg;
    els.banner.textContent = msg || "";
  }

  function setStep(n) {
    state.step = Math.max(0, Math.min(4, n));
    els.panels.forEach((panel) => {
      const id = Number(panel.getAttribute("data-mission"));
      const on = id === state.step;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
    els.steps.forEach((li) => {
      const id = Number(li.getAttribute("data-step-indicator"));
      li.classList.toggle("is-active", id === state.step);
      li.classList.toggle("is-done", id < state.step);
    });
    const pct = ((state.step + 1) / 5) * 100;
    if (els.xp) els.xp.style.width = pct + "%";
    if (els.xpLabel) els.xpLabel.textContent = `Stage ${state.step + 1} of 5`;

    if (state.step === 0) renderBuildFilms();
    if (state.step === 2) syncSetupSurface();
    if (state.step === 4) refreshQuote();
    showError("");
    window.KisalaTrack?.("project_step", { label: String(state.step) });
  }

  function syncSetupSurface() {
    const needBike = state.surface === "motorcycle" || state.surface === "both";
    const needHelmet = state.surface === "helmet" || state.surface === "both";
    if (els.setupMoto) els.setupMoto.hidden = !needBike;
    if (els.setupHelmet) els.setupHelmet.hidden = !needHelmet;
    if (els.setupLede) {
      if (state.surface === "both") {
        els.setupLede.textContent =
          "Add your bike and helmet details so we can size the combo install.";
      } else if (needBike) {
        els.setupLede.textContent = "Pick coverage and your bike.";
      } else {
        els.setupLede.textContent = "Add a few notes about the helmet.";
      }
    }
  }

  function renderRail() {
    const list = films();
    if (!els.filmCard) return;
    if (!list.length) {
      els.filmCard.hidden = true;
      return;
    }
    els.filmCard.hidden = false;
    if (els.filmName) {
      els.filmName.textContent =
        list.length === 1 ? list[0].name : `${list.length} colours`;
    }
    if (els.filmMeta) {
      els.filmMeta.textContent =
        list.length === 1
          ? [list[0].brand, list[0].finish].filter(Boolean).join(" · ")
          : list
              .slice(0, 3)
              .map((f) => f.name)
              .join(", ") + (list.length > 3 ? "…" : "");
    }
    const next0 = root.querySelector('[data-mission="0"] [data-project-next]');
    if (next0) next0.disabled = list.length === 0;
  }

  function renderBuildFilms() {
    renderRail();
    if (!els.buildFilms) return;
    const list = films();
    if (!list.length) {
      els.buildFilms.innerHTML =
        '<p class="gallery-empty">No colours yet. Browse the catalog and tap <strong>Add to build</strong>.</p>';
      return;
    }

    const showPlacement = true;
    els.buildFilms.innerHTML = list
      .map((f) => {
        const thumbs = (f.images || [])
          .map(
            (src, i) =>
              `<button type="button" class="kf-build-photo" data-remove-photo="${escapeHtml(
                f.handle
              )}" data-photo-index="${i}" aria-label="Remove photo">
                <img src="${escapeHtml(src)}" alt="">
              </button>`
          )
          .join("");
        return `<article class="kf-build-film" data-build-handle="${escapeHtml(f.handle)}">
          <div class="kf-build-film-top">
            ${
              f.image_url
                ? `<img class="kf-build-film-swatch" src="${escapeHtml(
                    f.image_url
                  )}" alt="" width="72" height="72">`
                : `<span class="kf-build-film-swatch kf-build-film-swatch--empty"></span>`
            }
            <div class="kf-build-film-copy">
              <strong>${escapeHtml(f.name)}</strong>
              <p class="meta">${escapeHtml(
                [f.brand, f.finish].filter(Boolean).join(" · ")
              )}</p>
            </div>
            <button type="button" class="kf-build-film-remove" data-remove-film="${escapeHtml(
              f.handle
            )}" aria-label="Remove ${escapeHtml(f.name)}">Remove</button>
          </div>
          ${
            showPlacement
              ? `<label class="kf-mission-field">
                  <span>Where does this colour go?</span>
                  <select data-film-placement="${escapeHtml(f.handle)}">
                    <option value="" ${!f.placement ? "selected" : ""}>Not sure yet</option>
                    <option value="motorcycle" ${
                      f.placement === "motorcycle" ? "selected" : ""
                    }>Motorcycle</option>
                    <option value="helmet" ${
                      f.placement === "helmet" ? "selected" : ""
                    }>Helmet</option>
                    <option value="both" ${
                      f.placement === "both" ? "selected" : ""
                    }>Bike and helmet</option>
                  </select>
                </label>`
              : ""
          }
          <label class="kf-mission-field">
            <span>Notes for this colour</span>
            <textarea data-film-notes="${escapeHtml(
              f.handle
            )}" rows="2" placeholder="Tank top, side panels, chin bar…">${escapeHtml(
              f.notes || ""
            )}</textarea>
          </label>
          <div class="kf-build-photos">
            ${thumbs}
            ${
              (f.images || []).length < (Build?.MAX_IMAGES || 3)
                ? `<label class="kf-build-photo-add">
                    <span>Add photo</span>
                    <input type="file" accept="image/*" data-film-photo="${escapeHtml(
                      f.handle
                    )}" hidden>
                  </label>`
                : ""
            }
          </div>
        </article>`;
      })
      .join("");
  }

  function payload() {
    const list = films();
    return {
      surface: state.surface,
      coverage:
        state.surface === "helmet" ? "full" : state.coverage || "full",
      filmHandle: list[0]?.handle,
      films: list.map((f) => ({
        handle: f.handle,
        notes: f.notes || "",
        placement: f.placement || "",
        imageCount: (f.images || []).length,
      })),
      bikeDifficulty: Number(els.bikeDifficulty?.value || 3) || 3,
      bodyClass: els.bikeBody?.value || "unknown",
      bikeYear: els.bikeYear?.value || "",
      bikeMake: els.bikeMake?.value || "",
      bikeModel: els.bikeModel?.value || "",
      bikeLabel: els.bikeLabel?.value || "",
      helmetNotes: els.helmetNotes?.value || "",
      customerName: els.name?.value?.trim() || "",
      customerEmail: els.email?.value?.trim() || "",
      customerPhone: els.phone?.value?.trim() || "",
      firebaseUid: state.firebaseUid || undefined,
      projectId: state.projectId,
    };
  }

  function validateStep() {
    if (state.step === 0 && !films().length) {
      showError("Add at least one colour to your build.");
      return false;
    }
    if (state.step === 1 && !state.surface) {
      showError("Pick motorcycle, helmet, or both.");
      return false;
    }
    if (state.step === 2) {
      const needBike = state.surface === "motorcycle" || state.surface === "both";
      if (needBike) {
        if (!els.bikeYear?.value || !els.bikeMake?.value || !els.bikeModel?.value) {
          showError("Select year, make, and model.");
          return false;
        }
      }
    }
    if (state.step === 3) {
      if (!els.name?.value?.trim() || !els.email?.value?.trim()) {
        showError("Name and email are required.");
        return false;
      }
      if (!String(els.email.value).includes("@")) {
        showError("Enter a valid email.");
        return false;
      }
    }
    return true;
  }

  function surfaceCopy(surface) {
    if (surface === "helmet") return "Helmet wrap";
    if (surface === "both") return "Bike + helmet combo";
    return "Motorcycle wrap";
  }

  async function refreshQuote() {
    if (!els.quoteBoard || !state.surface || !films().length) return;
    els.quoteBoard.innerHTML = `<p class="meta">Pricing your build…</p>`;
    try {
      const res = await fetch("/api/quote/project", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.quote) {
        throw new Error(data.error || "Could not price this build yet.");
      }
      state.quote = data.quote;
      const q = data.quote;
      const list = films();
      const colourLine =
        list.length === 1
          ? escapeHtml(list[0].name)
          : `${list.length} colours`;
      let lines = `
        <ul class="kf-quote-lines">
          <li><span>Build</span><strong>${escapeHtml(surfaceCopy(q.surface))}</strong></li>
          <li><span>Coverage</span><strong>${escapeHtml(
            q.coverage === "accent" ? "Accent package" : "Full wrap"
          )}</strong></li>
          <li><span>Colours</span><strong>${colourLine}</strong></li>`;
      if (q.motorcycleLabourUsd > 0) {
        lines += `<li><span>Motorcycle install</span><strong>${money(
          q.motorcycleLabourUsd
        )}</strong></li>`;
      }
      if (q.helmetLabourUsd > 0) {
        lines += `<li><span>Helmet install</span><strong>${money(
          q.helmetLabourUsd
        )}</strong></li>`;
      }
      lines += `<li><span>Vinyl film</span><strong>${money(q.vinylSellUsd)}</strong></li>`;
      if (q.discountUsd > 0) {
        lines += `<li><span>Combo savings</span><strong>−${money(
          q.discountUsd
        )}</strong></li>`;
      }
      lines += `<li class="kf-quote-total"><span>Total</span><strong>${money(
        q.totalUsd
      )}</strong></li></ul>
        <p class="meta">Appointment timing is confirmed after payment.</p>`;
      els.quoteBoard.innerHTML = lines;
    } catch (err) {
      state.quote = null;
      els.quoteBoard.innerHTML = `<p class="kf-project-error">${escapeHtml(
        err.message || "Quote failed."
      )}</p>
        <p class="meta">You can still save the build — we’ll confirm the total with you.</p>`;
    }
  }

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeLocal(projects) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      /* private mode */
    }
  }

  async function saveProject() {
    showError("");
    const list = films();
    const snap = {
      id: state.projectId,
      status: "draft",
      title:
        (list.length === 1 ? list[0].name : `${list.length} colours`) +
        (state.surface ? ` · ${state.surface}` : ""),
      ...payload(),
      filmsDetail: list,
      quote: state.quote,
      updatedAt: Date.now(),
    };
    const all = readLocal();
    // Keep a single active draft per browser by projectId, and also a stable "active" pointer
    // so revisiting /project can resume instead of spawning endless drafts.
    all[state.projectId] = snap;
    all.__active = state.projectId;
    writeLocal(all);

    if (window.KisalaAuth && state.firebaseUid) {
      try {
        await window.KisalaAuth.pushProject(state.firebaseUid, state.projectId, snap);
      } catch (err) {
        console.warn("cloud project save", err);
      }
    }
    showBanner(
      "Build saved on this device" +
        (state.firebaseUid ? " and your account." : ".")
    );
    window.KisalaTrack?.("project_saved", { label: state.projectId });
  }

  async function payProject() {
    showError("");
    if (!state.quote) {
      showError("Wait for the total to finish, or save the build and we’ll follow up.");
      return;
    }
    const btn = els.payBtn;
    const original = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Opening checkout…";
    }
    await saveProject();
    try {
      const res = await fetch("/api/checkout/project", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout unavailable right now.");
      }
      window.KisalaTrack?.("project_checkout_start", { label: data.orderId || "" });
      window.location.href = data.url;
    } catch (err) {
      showError(err.message || "Could not start checkout.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = original || "Continue to payment";
      }
      window.KisalaTrack?.("project_checkout_error", {});
    }
  }

  // Events
  root.querySelectorAll("[data-project-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!validateStep()) return;
      setStep(state.step + 1);
    });
  });
  root.querySelectorAll("[data-project-back]").forEach((btn) => {
    btn.addEventListener("click", () => setStep(state.step - 1));
  });

  els.buildFilms?.addEventListener("click", (e) => {
    const removeFilm = e.target.closest("[data-remove-film]");
    if (removeFilm && Build) {
      Build.remove(removeFilm.getAttribute("data-remove-film"));
      renderBuildFilms();
      return;
    }
    const removePhoto = e.target.closest("[data-remove-photo]");
    if (removePhoto && Build) {
      Build.removeImage(
        removePhoto.getAttribute("data-remove-photo"),
        removePhoto.getAttribute("data-photo-index")
      );
      renderBuildFilms();
    }
  });

  els.buildFilms?.addEventListener("input", (e) => {
    const notes = e.target.closest("[data-film-notes]");
    if (notes && Build) {
      Build.update(notes.getAttribute("data-film-notes"), { notes: notes.value });
      return;
    }
    const placement = e.target.closest("[data-film-placement]");
    if (placement && Build) {
      Build.update(placement.getAttribute("data-film-placement"), {
        placement: placement.value,
      });
    }
  });

  els.buildFilms?.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-film-photo]");
    if (!input || !Build || !input.files?.[0]) return;
    const handle = input.getAttribute("data-film-photo");
    try {
      await Build.addImage(handle, input.files[0]);
      showError("");
      renderBuildFilms();
    } catch (err) {
      showError(err.message || "Could not add that photo.");
    }
  });

  els.surfaceBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.surface = btn.getAttribute("data-surface");
      els.surfaceBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      const next = root.querySelector('[data-mission="1"] [data-project-next]');
      if (next) next.disabled = false;
    });
  });

  els.coverageBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.coverage = btn.getAttribute("data-coverage") || "full";
      els.coverageBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    });
  });

  const updateBikeNote = () => {
    if (!els.bikeNote) return;
    const label = root.querySelector("[data-bike-labor-label]")?.value;
    const bike = els.bikeLabel?.value;
    if (!bike) {
      els.bikeNote.textContent = "";
      return;
    }
    els.bikeNote.textContent = label
      ? `${bike} · ${label}`
      : bike;
  };
  ["change", "input"].forEach((ev) => {
    els.bikeYear?.addEventListener(ev, updateBikeNote);
    els.bikeMake?.addEventListener(ev, updateBikeNote);
    els.bikeModel?.addEventListener(ev, updateBikeNote);
  });
  els.bikeModel?.addEventListener("change", () => setTimeout(updateBikeNote, 0));

  els.saveBtn?.addEventListener("click", () => saveProject());
  els.payBtn?.addEventListener("click", () => payProject());

  if (params.get("cancelled") === "1") {
    showBanner("Checkout cancelled — your build is still here. Save it or try payment again.");
  }

  async function hydrateFromParam() {
    const filmParam = params.get("film") || params.get("h") || params.get("add") || "";
    if (!filmParam || !Build) return;
    try {
      let film = null;
      if (window.KisalaVinylCatalog) {
        const data = await window.KisalaVinylCatalog.loadFilm(filmParam);
        film = data.film;
      }
      if (film) {
        Build.add({
          handle: film.handle,
          name: film.name,
          brand: film.brand,
          finish: film.finish,
          sku: film.sku,
          image_url: film.image_url,
        });
        showBanner(`Added ${film.name} to your build.`);
      } else {
        Build.add({ handle: filmParam, name: filmParam });
      }
    } catch {
      Build.add({ handle: filmParam, name: filmParam });
    }
  }

  function resumeActiveDraft() {
    const all = readLocal();
    const activeId = all.__active;
    const snap = activeId ? all[activeId] : null;
    if (!snap || !snap.id) return;
    // Only resume empty cart from draft films if cart is empty
    if (Build && !Build.count() && Array.isArray(snap.filmsDetail)) {
      snap.filmsDetail.forEach((f) => Build.add(f));
    }
    state.projectId = snap.id;
    if (snap.surface) {
      state.surface = snap.surface;
      els.surfaceBtns.forEach((b) => {
        const on = b.getAttribute("data-surface") === snap.surface;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      const next = root.querySelector('[data-mission="1"] [data-project-next]');
      if (next && snap.surface) next.disabled = false;
    }
    if (snap.coverage) state.coverage = snap.coverage;
    if (els.helmetNotes && snap.helmetNotes) els.helmetNotes.value = snap.helmetNotes;
    if (els.name && snap.customerName) els.name.value = snap.customerName;
    if (els.email && snap.customerEmail) els.email.value = snap.customerEmail;
    if (els.phone && snap.customerPhone) els.phone.value = snap.customerPhone;
  }

  window.addEventListener("kisala-build-change", () => {
    renderRail();
    if (state.step === 0) renderBuildFilms();
  });

  hydrateFromParam().then(() => {
    resumeActiveDraft();
    renderBuildFilms();
    if (films().length && params.get("film")) {
      // Stay on colours so they can add notes, unless they came ready to continue
      setStep(0);
    }
  });

  if (window.KisalaAuth) {
    window.KisalaAuth.onAuth((user) => {
      state.firebaseUid = user?.uid || null;
      if (els.authStatus) {
        els.authStatus.innerHTML = user
          ? `Signed in as ${escapeHtml(user.email || "rider")} — builds sync to your account.`
          : `Not signed in — builds still save on this device. <a href="/login">Login</a> to sync.`;
      }
      if (user) window.KisalaAuth.ensureCustomerDoc(user);
    });
  }

  setStep(0);
})();
