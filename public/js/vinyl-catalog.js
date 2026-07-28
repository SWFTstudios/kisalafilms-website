/**
 * Browse panel over the vinyl catalogue: colour-family and finish filters,
 * grid/list views, sorting, saved films and side-by-side comparison.
 *
 * Deliberately not a second catalogue. The data, the fetch and the selection
 * all belong to vinyl-search.js — this reads window.KisalaVinyl and hands picks
 * back through it, so the hidden fields on the build sheet stay in one place.
 *
 * Markup hooks live in wrap-studio.html under [data-vinyl-browse].
 */
(() => {
  const ROOT = document.querySelector("[data-vinyl-browse]");
  if (!ROOT || !window.KisalaVinyl) return;

  const PAGE_SIZE = 24;
  const MAX_COMPARE = 3;
  const SAVED_KEY = "kisala-saved-films";

  const panel = ROOT.querySelector("[data-browse-panel]");
  const toggle = ROOT.querySelector("[data-browse-toggle]");
  const familyRow = ROOT.querySelector("[data-family-filters]");
  const finishRow = ROOT.querySelector("[data-finish-filters]");
  const viewRow = ROOT.querySelector("[data-view-toggle]");
  const sortSelect = ROOT.querySelector("[data-browse-sort]");
  const queryInput = ROOT.querySelector("[data-browse-query]");
  const grid = ROOT.querySelector("[data-browse-grid]");
  const countOut = ROOT.querySelector("[data-browse-count]");
  const moreBtn = ROOT.querySelector("[data-browse-more]");
  const clearBtn = ROOT.querySelector("[data-browse-clear]");
  const savedWrap = ROOT.querySelector("[data-saved-wrap]");
  const savedList = ROOT.querySelector("[data-saved-list]");
  const savedCount = ROOT.querySelector("[data-saved-count]");
  const compareBtn = ROOT.querySelector("[data-compare-open]");
  const compareModal = document.querySelector("[data-compare-modal]");
  const compareStage = compareModal?.querySelector("[data-compare-stage]");
  const savedField = document.querySelector("[data-saved-films-field]");

  const esc = window.KisalaVinyl.escapeHtml;
  const escAttr = window.KisalaVinyl.escapeAttr;

  const state = {
    families: new Set(),
    finishes: new Set(),
    query: "",
    sort: "name",
    view: "grid",
    shown: PAGE_SIZE,
    open: false,
  };

  let saved = readSaved();
  let compare = [];
  let hits = [];

  /* ---- Saved films ------------------------------------------------------- */
  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((c) => c && c.id) : [];
    } catch (_) {
      return []; // private mode, or something else wrote the key
    }
  }

  function writeSaved() {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch (_) {
      /* private mode — the list still works for this session */
    }
    if (savedField) {
      // Newline-separated, one film per line. Metro's titles are full of pipes
      // ("… Vinyl Wrap | G356 | BLOWOUT STOCK"), so any inline delimiter would
      // collide with the data — and the count is published as an attribute
      // rather than left for a reader to parse back out of the value.
      savedField.value = saved.map((c) => c.n).join("\n");
      savedField.dataset.count = String(saved.length);
    }
    // Let the studio summary pick the count up through its own listeners.
    ROOT.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const isSaved = (color) => saved.some((c) => c.id === color.id);

  function toggleSaved(color) {
    if (isSaved(color)) {
      saved = saved.filter((c) => c.id !== color.id);
    } else {
      saved.push({ id: color.id, n: color.n, v: color.v, f: color.f, c: color.c, i: color.i, u: color.u });
      window.KisalaTrack?.("vinyl_save", { label: color.n, family: color.c });
    }
    writeSaved();
    renderSaved();
    syncCard(color.id);
  }

  /* ---- Filtering -------------------------------------------------------- */
  function matches(color) {
    if (state.families.size && !state.families.has(color.c)) return false;
    if (state.finishes.size && !state.finishes.has(color.f)) return false;
    if (state.query) {
      const hay = `${color.n} ${color.v} ${color.f}`.toLowerCase();
      if (!state.query.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  const SORTS = {
    name: (a, b) => a.n.localeCompare(b.n),
    vendor: (a, b) => (a.v || "").localeCompare(b.v || "") || a.n.localeCompare(b.n),
    finish: (a, b) => (a.f || "~").localeCompare(b.f || "~") || a.n.localeCompare(b.n),
    family: (a, b) => (a.c || "~").localeCompare(b.c || "~") || a.n.localeCompare(b.n),
  };

  function recompute() {
    hits = window.KisalaVinyl.all().filter(matches).sort(SORTS[state.sort] || SORTS.name);
    state.shown = PAGE_SIZE;
  }

  /* ---- Rendering -------------------------------------------------------- */
  function familyLabel(id) {
    return window.KisalaVinyl.families().find((f) => f.id === id)?.label || "";
  }

  function card(color) {
    const thumb = color.i
      ? `<img class="vinyl-card-thumb" src="${escAttr(color.i)}" alt="" width="120" height="120" loading="lazy">`
      : '<span class="vinyl-card-thumb vinyl-card-thumb--empty" aria-hidden="true"></span>';
    const meta = [color.v, color.f, familyLabel(color.c)].filter(Boolean).join(" · ");
    const on = isSaved(color);
    const inCompare = compare.some((c) => c.id === color.id);

    return `<article class="vinyl-card">
      ${thumb}
      <div class="vinyl-card-body">
        <h4 class="vinyl-card-name">${esc(color.n)}</h4>
        <p class="vinyl-card-meta">${esc(meta)}</p>
        <div class="vinyl-card-actions">
          <button type="button" class="vinyl-card-use" data-use="${color.id}">Use this film</button>
          <button type="button" class="vinyl-card-save${on ? " is-on" : ""}" data-save="${color.id}"
                  aria-pressed="${on ? "true" : "false"}"
                  aria-label="${on ? "Remove" : "Save"} ${escAttr(color.n)}">${on ? "★ Saved" : "☆ Save"}</button>
          <button type="button" class="vinyl-card-compare${inCompare ? " is-on" : ""}" data-compare="${color.id}"
                  aria-pressed="${inCompare ? "true" : "false"}">Compare</button>
        </div>
      </div>
      ${color.u ? `<a class="vinyl-card-link" href="${escAttr(color.u)}" target="_blank" rel="noopener">View on Metro</a>` : ""}
    </article>`;
  }

  /**
   * Repaints one card's buttons. Saving or comparing used to re-render the whole
   * grid, which threw away keyboard focus and could jump the scroll position
   * under the rider's thumb — for a change to a single card.
   */
  function syncCard(id) {
    if (!grid) return;
    const savedNow = saved.some((c) => String(c.id) === String(id));
    const comparedNow = compare.some((c) => String(c.id) === String(id));

    const saveBtn = grid.querySelector(`[data-save="${id}"]`);
    if (saveBtn) {
      saveBtn.classList.toggle("is-on", savedNow);
      saveBtn.setAttribute("aria-pressed", savedNow ? "true" : "false");
      saveBtn.textContent = savedNow ? "★ Saved" : "☆ Save";
      const name = byId(id)?.n || "";
      saveBtn.setAttribute("aria-label", `${savedNow ? "Remove" : "Save"} ${name}`);
    }

    const cmpBtn = grid.querySelector(`[data-compare="${id}"]`);
    if (cmpBtn) {
      cmpBtn.classList.toggle("is-on", comparedNow);
      cmpBtn.setAttribute("aria-pressed", comparedNow ? "true" : "false");
    }
  }

  function renderGrid() {
    if (!grid) return;

    if (!hits.length) {
      grid.innerHTML =
        '<p class="vinyl-empty">No films match those filters. Drop a colour or a finish and try again.</p>';
      grid.className = "vinyl-cards";
      if (moreBtn) moreBtn.hidden = true;
      if (countOut) countOut.textContent = "0 films";
      return;
    }

    const slice = hits.slice(0, state.shown);
    grid.className = `vinyl-cards vinyl-cards--${state.view}`;
    grid.innerHTML = slice.map(card).join("");

    if (countOut) {
      countOut.textContent =
        hits.length === slice.length
          ? `${hits.length} film${hits.length === 1 ? "" : "s"}`
          : `${slice.length} of ${hits.length} films`;
    }
    if (moreBtn) moreBtn.hidden = hits.length <= state.shown;
  }

  function renderSaved() {
    if (!savedWrap || !savedList) return;
    savedWrap.hidden = saved.length === 0 && compare.length < 2;
    if (savedCount) savedCount.textContent = String(saved.length);
    // Ticking two films to compare is enough on its own — requiring them to be
    // saved first left the comparison with no way in.
    if (compareBtn) compareBtn.hidden = saved.length < 2 && compare.length < 2;

    savedList.innerHTML = saved
      .map(
        (color) => `<li class="vinyl-saved-item">
          ${color.i ? `<img src="${escAttr(color.i)}" alt="" width="34" height="34" loading="lazy">` : ""}
          <span class="vinyl-saved-name">${esc(color.n)}</span>
          <button type="button" class="vinyl-saved-use" data-use="${color.id}">Use</button>
          <button type="button" class="vinyl-saved-drop" data-save="${color.id}" aria-label="Remove ${escAttr(color.n)}">&times;</button>
        </li>`
      )
      .join("");
  }

  function chip(id, label, hex, checkedSet) {
    const on = checkedSet.has(id);
    const dot = hex
      ? `<span class="swatch-chip-dot" style="background:${escAttr(hex)}" aria-hidden="true"></span>`
      : "";
    return `<button type="button" class="swatch-chip${on ? " on" : ""}" data-chip="${escAttr(id)}"
              aria-pressed="${on ? "true" : "false"}">${dot}<span>${esc(label)}</span></button>`;
  }

  let filtersBuilt = false;

  /** Builds the chip rows once. Toggling only ever updates classes after this,
      so a keyboard user does not lose focus when they select a colour. */
  function buildFilters() {
    if (filtersBuilt) return;
    if (familyRow) {
      familyRow.innerHTML = window.KisalaVinyl
        .families()
        .map((f) => chip(f.id, f.label, f.hex, state.families))
        .join("");
    }
    if (finishRow) {
      finishRow.innerHTML = window.KisalaVinyl
        .finishes()
        .map((f) => chip(f, f, null, state.finishes))
        .join("");
    }
    filtersBuilt = true;
  }

  function syncChips(row, chosen) {
    row?.querySelectorAll("[data-chip]").forEach((btn) => {
      const on = chosen.has(btn.getAttribute("data-chip"));
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderFilters() {
    buildFilters();
    syncChips(familyRow, state.families);
    syncChips(finishRow, state.finishes);
    if (clearBtn) {
      clearBtn.hidden = !state.families.size && !state.finishes.size && !state.query;
    }
  }

  /* ---- Compare ---------------------------------------------------------- */
  function toggleCompare(color) {
    const existing = compare.findIndex((c) => c.id === color.id);
    const touched = [color.id];

    if (existing >= 0) {
      compare.splice(existing, 1);
    } else {
      // Oldest drops out rather than blocking the pick — comparing is a glance,
      // not a form to fill in.
      if (compare.length >= MAX_COMPARE) touched.push(compare.shift().id);
      compare.push(color);
    }

    touched.forEach(syncCard);
    renderSaved();
    if (compareModal && !compareModal.hidden) renderCompare();
  }

  function renderCompare() {
    if (!compareStage) return;
    const list = compare.length >= 2 ? compare : saved.slice(0, MAX_COMPARE);

    if (list.length < 2) {
      compareStage.innerHTML =
        '<p class="vinyl-empty">Save or tick at least two films to put them side by side.</p>';
      return;
    }

    const rows = [
      ["Film", (c) => c.n],
      ["Brand", (c) => c.v || "—"],
      ["Finish", (c) => c.f || "—"],
      ["Colour family", (c) => familyLabel(c.c) || "—"],
    ];

    compareStage.innerHTML = `<div class="vinyl-compare-grid" style="--compare-cols:${list.length}">
      ${list
        .map(
          (c) => `<div class="vinyl-compare-col">
            ${c.i ? `<img src="${escAttr(c.i)}" alt="" width="220" height="220" loading="lazy">` : '<span class="vinyl-card-thumb vinyl-card-thumb--empty"></span>'}
            ${rows.map(([label, get]) => `<p class="vinyl-compare-row"><span>${esc(label)}</span><strong>${esc(get(c))}</strong></p>`).join("")}
            <button type="button" class="btn btn-ghost" data-use="${c.id}">Use this film</button>
          </div>`
        )
        .join("")}
    </div>
    <p class="vinyl-compare-note">Thumbnails come straight from Metro Restyling. Screens lie about colour — I'll get real swatches on your bike before anything is cut.</p>`;
  }

  function openCompare() {
    if (!compareModal) return;
    renderCompare();
    compareModal.hidden = false;
    document.body.classList.add("intro-lock");
    compareModal.querySelector("[data-compare-close]")?.focus();
    window.KisalaTrack?.("vinyl_compare", { label: (compare.length >= 2 ? compare : saved).map((c) => c.n).join(" vs ") });
  }

  function closeCompare() {
    if (!compareModal) return;
    compareModal.hidden = true;
    document.body.classList.remove("intro-lock");
  }

  /* ---- Wiring ----------------------------------------------------------- */
  const byId = (id) =>
    window.KisalaVinyl.all().find((c) => String(c.id) === String(id)) ||
    saved.find((c) => String(c.id) === String(id));

  function refresh() {
    recompute();
    renderFilters();
    renderGrid();
  }

  familyRow?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    const id = btn.getAttribute("data-chip");
    state.families.has(id) ? state.families.delete(id) : state.families.add(id);
    refresh();
  });

  finishRow?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;
    const id = btn.getAttribute("data-chip");
    state.finishes.has(id) ? state.finishes.delete(id) : state.finishes.add(id);
    refresh();
  });

  viewRow?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    state.view = btn.getAttribute("data-view") === "list" ? "list" : "grid";
    viewRow.querySelectorAll("[data-view]").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderGrid();
  });

  sortSelect?.addEventListener("change", () => {
    state.sort = sortSelect.value;
    refresh();
  });

  let queryTimer = null;
  queryInput?.addEventListener("input", () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => {
      state.query = queryInput.value.trim().toLowerCase();
      refresh();
    }, 150);
  });

  clearBtn?.addEventListener("click", () => {
    state.families.clear();
    state.finishes.clear();
    state.query = "";
    if (queryInput) queryInput.value = "";
    refresh();
  });

  moreBtn?.addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    renderGrid();
  });

  // One handler for the grid, the saved tray and the compare panel: they all
  // speak the same data-use / data-save / data-compare vocabulary.
  document.addEventListener("click", (e) => {
    const use = e.target.closest("[data-use]");
    if (use && (ROOT.contains(use) || compareModal?.contains(use))) {
      const color = byId(use.getAttribute("data-use"));
      if (color) {
        window.KisalaVinyl.pick(color);
        closeCompare();
        ROOT.querySelector("[data-vinyl-picked-note]")?.removeAttribute("hidden");
      }
      return;
    }

    const save = e.target.closest("[data-save]");
    if (save && ROOT.contains(save)) {
      const color = byId(save.getAttribute("data-save"));
      if (color) toggleSaved(color);
      return;
    }

    const cmp = e.target.closest("[data-compare]");
    if (cmp && ROOT.contains(cmp)) {
      const color = byId(cmp.getAttribute("data-compare"));
      if (color) toggleCompare(color);
    }
  });

  compareBtn?.addEventListener("click", openCompare);
  compareModal?.querySelector("[data-compare-close]")?.addEventListener("click", closeCompare);
  compareModal?.addEventListener("click", (e) => {
    if (e.target === compareModal) closeCompare();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && compareModal && !compareModal.hidden) closeCompare();
  });

  toggle?.addEventListener("click", async () => {
    state.open = !state.open;
    if (panel) panel.hidden = !state.open;
    toggle.setAttribute("aria-expanded", state.open ? "true" : "false");
    toggle.textContent = state.open ? "Hide the film catalogue" : "Browse all films";

    if (state.open) {
      // Deferred until the panel is actually asked for: the catalogue is half a
      // megabyte, and most riders type a colour instead of browsing.
      const ok = await window.KisalaVinyl.ready();
      if (!ok) {
        if (grid) {
          grid.innerHTML =
            '<p class="vinyl-empty">Couldn’t load the film list. Tell me the look you’re after in the notes and I’ll send swatches.</p>';
        }
        return;
      }
      refresh();
      window.KisalaTrack?.("vinyl_browse_open", { label: "wrap-studio" });
    }
  });

  writeSaved();
  renderSaved();
})();
