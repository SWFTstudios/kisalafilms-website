/**
 * Wrap Studio: assign multiple catalogue films to bike parts.
 *
 * Flow: pick a film via search/browse (KisalaVinyl), then tap parts to paint
 * them with that film. Full-bike is exclusive with individual panels.
 *
 * Markup hooks:
 *   [data-part-colours]         root
 *   [data-part-colour-active]   banner for the film ready to assign
 *   [data-part-colour-grid]     part buttons
 *   [data-part-colours-field]   hidden newline map for FormSubmit
 *   [data-parts-summary]        human part list
 */
(() => {
  const ROOT = document.querySelector("[data-part-colours]");
  if (!ROOT) return;

  const FORM = ROOT.closest("form") || document.querySelector("[data-wrap-studio]");
  if (!FORM) return;

  const GRID = ROOT.querySelector("[data-part-colour-grid]");
  const ACTIVE = ROOT.querySelector("[data-part-colour-active]");
  const FIELD = ROOT.querySelector("[data-part-colours-field]") || FORM.querySelector("[data-part-colours-field]");
  const SUMMARY = ROOT.querySelector("[data-parts-summary]") || FORM.querySelector("[data-parts-summary]");
  const COVERAGE = FORM.querySelector('[name="coverage"]');

  const PARTS = [
    { id: "full_bike", label: "Full bike", hint: "Every painted panel", exclusive: true },
    { id: "tank", label: "Tank", hint: "Fuel tank" },
    { id: "upper_fairing", label: "Upper fairing", hint: "Nose / uppers" },
    { id: "lower_fairing", label: "Lower fairing", hint: "Belly / lowers" },
    { id: "side_fairings", label: "Side fairings", hint: "Mid / side panels" },
    { id: "front_fender", label: "Front fender" },
    { id: "rear_fender", label: "Rear fender / hugger" },
    { id: "side_covers", label: "Side covers" },
    { id: "tail_cowl", label: "Tail / seat cowl" },
    { id: "accents", label: "Accents", hint: "Stripes, pads, small bits" },
    { id: "mirrors", label: "Mirrors" },
    { id: "lights", label: "Lights", hint: "Head / tail tint or wrap" },
    { id: "calipers", label: "Brake calipers" },
  ];

  /** @type {Record<string, { id: string, n: string, v?: string, f?: string, u?: string, i?: string, h?: string }>} */
  const assignments = {};
  /** @type {{ id: string, n: string, v?: string, f?: string, u?: string, i?: string, h?: string } | null} */
  let activeFilm = null;

  const esc = (str) =>
    (window.KisalaVinyl?.escapeHtml || ((s) => String(s)))(String(str ?? ""));
  const escAttr = (str) =>
    (window.KisalaVinyl?.escapeAttr || ((s) => String(s)))(String(str ?? ""));

  function filmFromPick(color) {
    if (!color || !color.n) return null;
    return {
      id: String(color.id || color.h || color.n),
      n: String(color.n),
      v: color.v ? String(color.v) : "",
      f: color.f ? String(color.f) : "",
      u: color.u ? String(color.u) : "",
      i: color.i ? String(color.i) : "",
      h: color.h ? String(color.h) : "",
    };
  }

  function setActive(color) {
    activeFilm = filmFromPick(color);
    renderActive();
  }

  function clearActive() {
    activeFilm = null;
    renderActive();
  }

  function assign(partId, film) {
    if (!film) return;
    const part = PARTS.find((p) => p.id === partId);
    if (!part) return;

    // Same film on the same part toggles off — check before exclusive wipe.
    if (assignments[partId]?.id === film.id) {
      delete assignments[partId];
      syncFields();
      renderGrid();
      FORM.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (part.exclusive) {
      Object.keys(assignments).forEach((id) => delete assignments[id]);
    } else {
      delete assignments.full_bike;
    }

    assignments[partId] = film;

    syncFields();
    renderGrid();
    FORM.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearPart(partId) {
    delete assignments[partId];
    syncFields();
    renderGrid();
    FORM.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncCoverage() {
    if (!COVERAGE) return;
    const ids = Object.keys(assignments);
    if (!ids.length) return;

    let next = "";
    if (ids.includes("full_bike")) next = "Every painted panel";
    else if (ids.length === 1 && ids[0] === "tank") next = "Tank only";
    else if (ids.includes("tank") && ids.includes("tail_cowl") && ids.length === 2) {
      next = "Tank + tail";
    } else if (
      ids.every((id) =>
        ["upper_fairing", "lower_fairing", "side_fairings", "front_fender", "rear_fender"].includes(id)
      )
    ) {
      next = "Fairings only";
    } else if (ids.every((id) => ["accents", "mirrors", "lights", "calipers"].includes(id))) {
      next = "Accents and stripes";
    }

    if (next && Array.from(COVERAGE.options).some((o) => o.value === next)) {
      COVERAGE.value = next;
    }
  }

  function syncFields() {
    const lines = PARTS.filter((p) => assignments[p.id]).map((p) => {
      const film = assignments[p.id];
      const bits = [film.n];
      if (film.v) bits.push(film.v);
      if (film.f) bits.push(film.f);
      const meta = bits.join(" · ");
      return film.u ? `${p.label}: ${meta} | ${film.u}` : `${p.label}: ${meta}`;
    });

    if (FIELD) FIELD.value = lines.join("\n");
    if (SUMMARY) {
      SUMMARY.value = PARTS.filter((p) => assignments[p.id])
        .map((p) => p.label)
        .join(", ");
    }
    syncCoverage();
  }

  function renderActive() {
    if (!ACTIVE) return;
    if (!activeFilm) {
      ACTIVE.hidden = true;
      ACTIVE.innerHTML = "";
      return;
    }
    ACTIVE.hidden = false;
    const thumb = activeFilm.i
      ? `<img src="${escAttr(activeFilm.i)}" alt="" width="40" height="40" loading="lazy">`
      : `<span class="part-colour-active-swatch" aria-hidden="true"></span>`;
    ACTIVE.innerHTML = `
      ${thumb}
      <div class="part-colour-active-copy">
        <span class="part-colour-active-kicker">Ready to assign</span>
        <strong>${esc(activeFilm.n)}</strong>
        <span class="part-colour-active-hint">Tap parts below to paint them with this film. Tap again to remove.</span>
      </div>
    `;
  }

  function renderGrid() {
    if (!GRID) return;
    GRID.innerHTML = "";

    PARTS.forEach((part) => {
      const film = assignments[part.id];
      const lockedByFull = part.id !== "full_bike" && !!assignments.full_bike;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "part-colour-chip";
      if (film) btn.classList.add("has-film");
      if (lockedByFull) btn.classList.add("is-locked");
      btn.dataset.part = part.id;
      btn.setAttribute("aria-pressed", film ? "true" : "false");
      if (lockedByFull) btn.disabled = true;

      const thumb = film?.i
        ? `<img class="part-colour-chip-thumb" src="${escAttr(film.i)}" alt="" width="36" height="36" loading="lazy">`
        : `<span class="part-colour-chip-thumb part-colour-chip-thumb--empty" aria-hidden="true"></span>`;

      btn.innerHTML = `
        ${thumb}
        <span class="part-colour-chip-body">
          <span class="part-colour-chip-label">${esc(part.label)}</span>
          <span class="part-colour-chip-meta">${esc(film ? film.n : part.hint || "Tap to assign")}</span>
        </span>
      `;

      btn.addEventListener("click", () => {
        if (lockedByFull) return;
        if (activeFilm) {
          assign(part.id, activeFilm);
          return;
        }
        if (film) {
          // No active film — clear this part's assignment.
          clearPart(part.id);
          return;
        }
        // Nudge the rider toward picking a film first.
        ACTIVE.hidden = false;
        ACTIVE.innerHTML = `
          <div class="part-colour-active-copy">
            <span class="part-colour-active-kicker">Pick a film first</span>
            <strong>Search or browse a colour, then tap this part.</strong>
          </div>
        `;
      });

      GRID.appendChild(btn);
    });
  }

  FORM.addEventListener("kisala:vinyl-pick", (e) => {
    setActive(e.detail?.color || window.KisalaVinyl?.selectedColor?.());
  });

  FORM.addEventListener("kisala:vinyl-clear", () => {
    clearActive();
  });

  // Expose a tiny read API for the summary / tests.
  window.KisalaPartColours = {
    map: () => ({ ...assignments }),
    active: () => activeFilm,
    assign,
    clearPart,
  };

  renderActive();
  renderGrid();
  syncFields();
})();
