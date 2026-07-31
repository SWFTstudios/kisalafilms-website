/**
 * Game-like vinyl project onboarding — catalog film → surface → setup →
 * details → save or Stripe checkout. Quote is previewed client-side then
 * recomputed on the Worker before payment.
 */
(() => {
  const root = document.querySelector("[data-project-root]");
  if (!root) return;

  const STORAGE_KEY = "kisala-vinyl-projects";
  const params = new URLSearchParams(window.location.search);

  const state = {
    step: 0,
    film: null,
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
    filmThumb: root.querySelector("[data-project-film-thumb]"),
    filmName: root.querySelector("[data-project-film-name]"),
    filmMeta: root.querySelector("[data-project-film-meta]"),
    filmHandle: root.querySelector("[data-project-film-handle]"),
    filmPreview: root.querySelector("[data-project-film-preview]"),
    loadFilm: root.querySelector("[data-project-load-film]"),
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

    if (state.step === 2) syncSetupSurface();
    if (state.step === 4) refreshQuote();
    showError("");
    window.KisalaTrack?.("project_step", { label: String(state.step) });
  }

  function syncSetupSurface() {
    const moto = state.surface === "motorcycle";
    if (els.setupMoto) els.setupMoto.hidden = !moto;
    if (els.setupHelmet) els.setupHelmet.hidden = moto;
    if (els.setupLede) {
      els.setupLede.textContent = moto
        ? "Pick coverage and your bike — labour is a set price by fairing difficulty."
        : "Add helmet notes — labour is a set price by film difficulty.";
    }
  }

  function renderFilmCard() {
    const film = state.film;
    if (!film || !els.filmCard) return;
    els.filmCard.hidden = false;
    if (els.filmThumb) {
      if (film.image_url) {
        els.filmThumb.hidden = false;
        els.filmThumb.src = film.image_url;
        els.filmThumb.alt = film.name || "";
      } else {
        els.filmThumb.hidden = true;
      }
    }
    if (els.filmName) els.filmName.textContent = film.name || film.handle;
    if (els.filmMeta) {
      els.filmMeta.textContent = [film.brand, film.finish, film.sku]
        .filter(Boolean)
        .join(" · ");
    }
    if (els.filmHandle) els.filmHandle.value = film.handle || "";
    if (els.filmPreview) {
      const sell = film.sell_price_usd;
      const sellLabel =
        sell != null && Number.isFinite(Number(sell))
          ? money(sell) + " / roll (cost + 40%)"
          : "Price syncing";
      els.filmPreview.hidden = false;
      els.filmPreview.innerHTML = `
        <div class="kf-mission-preview-inner">
          ${
            film.image_url
              ? `<img src="${escapeHtml(film.image_url)}" alt="" width="96" height="96">`
              : ""
          }
          <div>
            <strong>${escapeHtml(film.name || "")}</strong>
            <p class="meta">${escapeHtml(
              [film.brand, film.finish].filter(Boolean).join(" · ")
            )}</p>
            <p class="kf-roll-price">${escapeHtml(sellLabel)}</p>
          </div>
        </div>`;
    }
    const next0 = root.querySelector('[data-mission="0"] [data-project-next]');
    if (next0) next0.disabled = !film;
  }

  async function loadFilm(handle) {
    const h = String(handle || "").trim();
    if (!h) {
      showError("Enter a film handle or pick one from the catalog.");
      return;
    }
    showError("");
    try {
      let film = null;
      if (window.KisalaVinylCatalog) {
        const data = await window.KisalaVinylCatalog.loadFilm(h);
        film = data.film;
      } else {
        const res = await fetch(`/api/films/${encodeURIComponent(h)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.film) {
          throw new Error(data.error || "Film not found in the catalog.");
        }
        film = data.film;
      }
      state.film = film;
      renderFilmCard();
      window.KisalaTrack?.("project_film_loaded", { label: h });
    } catch (err) {
      showError(err.message || "Could not load that film.");
      state.film = null;
      renderFilmCard();
    }
  }

  function payload() {
    return {
      surface: state.surface,
      coverage: state.surface === "helmet" ? "full" : state.coverage,
      filmHandle: state.film?.handle,
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
    if (state.step === 0 && !state.film) {
      showError("Load a film before continuing.");
      return false;
    }
    if (state.step === 1 && !state.surface) {
      showError("Pick motorcycle or helmet.");
      return false;
    }
    if (state.step === 2) {
      if (state.surface === "motorcycle") {
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

  async function refreshQuote() {
    if (!els.quoteBoard || !state.film || !state.surface) return;
    els.quoteBoard.innerHTML = `<p class="meta">Pricing your build…</p>`;
    try {
      const res = await fetch("/api/quote/project", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.quote) {
        throw new Error(data.error || "Could not price this project.");
      }
      state.quote = data.quote;
      const q = data.quote;
      els.quoteBoard.innerHTML = `
        <ul class="kf-quote-lines">
          <li><span>Surface</span><strong>${escapeHtml(
            q.surface === "helmet" ? "Helmet wrap" : "Motorcycle wrap"
          )}</strong></li>
          <li><span>Coverage</span><strong>${escapeHtml(
            q.coverage === "accent" ? "Accent package" : "Full wrap"
          )}</strong></li>
          <li><span>Difficulty</span><strong>${escapeHtml(q.difficultyLabel)}</strong></li>
          <li><span>Labour (set)</span><strong>${money(q.labourUsd)}</strong></li>
          <li><span>Vinyl · ${q.rolls}× ${q.rollWidthFt}×${q.rollLengthFt}ft</span><strong>${money(
            q.vinylSellUsd
          )}</strong></li>
          <li class="kf-quote-total"><span>Total</span><strong>${money(q.totalUsd)}</strong></li>
        </ul>
        <p class="meta">Vinyl = Metro roll cost × ${Math.round(
          (q.vinylMarkup - 1) * 100
        )}% markup. Appointment scheduling is confirmed after payment.</p>`;
    } catch (err) {
      state.quote = null;
      els.quoteBoard.innerHTML = `<p class="kf-project-error">${escapeHtml(
        err.message || "Quote failed."
      )}</p>`;
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
    const snap = {
      id: state.projectId,
      status: "draft",
      title:
        (state.film?.name || "Vinyl project") +
        (state.surface ? ` · ${state.surface}` : ""),
      ...payload(),
      film: state.film,
      quote: state.quote,
      updatedAt: Date.now(),
    };
    const all = readLocal();
    all[state.projectId] = snap;
    writeLocal(all);

    if (window.KisalaAuth && state.firebaseUid) {
      try {
        await window.KisalaAuth.pushProject(state.firebaseUid, state.projectId, snap);
      } catch (err) {
        console.warn("cloud project save", err);
      }
    }
    showBanner("Project saved. You can leave and resume from this browser" +
      (state.firebaseUid ? " (and your account)." : "."));
    window.KisalaTrack?.("project_saved", { label: state.projectId });
  }

  async function payProject() {
    showError("");
    if (!state.quote) {
      showError("Wait for the quote to finish, then try again.");
      return;
    }
    const btn = els.payBtn;
    const original = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Opening Stripe…";
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
        throw new Error(data.error || "Checkout unavailable.");
      }
      window.KisalaTrack?.("project_checkout_start", { label: data.orderId || "" });
      window.location.href = data.url;
    } catch (err) {
      showError(err.message || "Could not start checkout.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = original || "Order with Stripe";
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
  els.loadFilm?.addEventListener("click", () => loadFilm(els.filmHandle?.value));
  els.filmHandle?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadFilm(els.filmHandle.value);
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
    const d = els.bikeDifficulty?.value;
    const label = root.querySelector("[data-bike-labor-label]")?.value;
    if (!d) {
      els.bikeNote.textContent = "";
      return;
    }
    els.bikeNote.textContent = `Difficulty ${d}/5${label ? ` · ${label}` : ""} — set labour locks from this band.`;
  };
  ["change", "input"].forEach((ev) => {
    els.bikeYear?.addEventListener(ev, updateBikeNote);
    els.bikeMake?.addEventListener(ev, updateBikeNote);
    els.bikeModel?.addEventListener(ev, updateBikeNote);
  });
  // bike-search writes hidden fields after model change
  els.bikeModel?.addEventListener("change", () => setTimeout(updateBikeNote, 0));

  els.saveBtn?.addEventListener("click", () => saveProject());
  els.payBtn?.addEventListener("click", () => payProject());

  if (params.get("cancelled") === "1") {
    showBanner("Checkout cancelled — your project is still here. Save it or try Stripe again.");
  }

  const filmParam = params.get("film") || params.get("h") || "";
  if (filmParam) {
    loadFilm(filmParam).then(() => {
      if (state.film) setStep(1);
    });
  }

  if (window.KisalaAuth) {
    window.KisalaAuth.onAuth((user) => {
      state.firebaseUid = user?.uid || null;
      if (els.authStatus) {
        els.authStatus.innerHTML = user
          ? `Signed in as ${escapeHtml(user.email || "rider")} — projects sync to Firebase.`
          : `Not signed in — projects still save locally. <a href="/login">Login</a> to sync.`;
      }
      if (user) window.KisalaAuth.ensureCustomerDoc(user);
    });
  }

  setStep(0);
})();
