/**
 * Searchable Metro Restyling vinyl color picker.
 * Data: /data/vinyl-colors.json
 *
 * Markup hooks (inside a form):
 *   [data-vinyl-search]   text input
 *   [data-vinyl-results]  results container
 *   [data-vinyl-selected] selected summary (optional)
 *   [data-vinyl-clear]    clear button (optional)
 *   hidden: data-vinyl-label|handle|url|vendor|type|finish
 *   optional finish <select id="finish" name="finish"> soft-set on pick
 */
(() => {
  const INPUT = document.querySelector("[data-vinyl-search]");
  if (!INPUT) return;

  const FORM = INPUT.closest("form");
  if (!FORM) return;

  const RESULTS = FORM.querySelector("[data-vinyl-results]");
  const SELECTED = FORM.querySelector("[data-vinyl-selected]");
  const CLEAR_BTN = FORM.querySelector("[data-vinyl-clear]");
  const FINISH_SELECT = FORM.querySelector("#finish") || FORM.querySelector("[name=finish]");

  const META = {
    label: FORM.querySelector("[data-vinyl-label]"),
    handle: FORM.querySelector("[data-vinyl-handle]"),
    url: FORM.querySelector("[data-vinyl-url]"),
    vendor: FORM.querySelector("[data-vinyl-vendor]"),
    type: FORM.querySelector("[data-vinyl-type]"),
    finish: FORM.querySelector("[data-vinyl-finish]"),
  };

  const MAX_RESULTS = 12;
  /** Finish select options that map 1:1 from parsed finish keywords */
  const FINISH_MAP = {
    Gloss: "Gloss",
    "Super Gloss": "Gloss",
    Satin: "Satin",
    Matte: "Matte",
    "Ultra Matte": "Matte",
    Metallic: "Metallic",
  };

  let colors = [];
  let loaded = false;
  let loading = null;
  let activeIndex = -1;
  let currentHits = [];

  function clearMeta() {
    Object.values(META).forEach((el) => {
      if (el) el.value = "";
    });
    if (SELECTED) {
      SELECTED.hidden = true;
      SELECTED.innerHTML = "";
    }
    if (CLEAR_BTN) CLEAR_BTN.hidden = true;
  }

  function writeMeta(color) {
    if (!color) {
      clearMeta();
      return;
    }
    if (META.label) META.label.value = color.n || "";
    if (META.handle) META.handle.value = color.h || "";
    if (META.url) META.url.value = color.u || "";
    if (META.vendor) META.vendor.value = color.v || "";
    if (META.type) META.type.value = color.t || "";
    if (META.finish) META.finish.value = color.f || "";

    if (FINISH_SELECT && color.f && FINISH_MAP[color.f]) {
      const mapped = FINISH_MAP[color.f];
      const hasOption = Array.from(FINISH_SELECT.options).some((o) => o.value === mapped);
      if (hasOption) FINISH_SELECT.value = mapped;
    }

    if (SELECTED) {
      SELECTED.hidden = false;
      const thumb = color.i
        ? `<img class="vinyl-picked-thumb" src="${escapeAttr(color.i)}" alt="" width="40" height="40" loading="lazy">`
        : "";
      const view = color.u
        ? `<a class="vinyl-picked-link" href="${escapeAttr(color.u)}" target="_blank" rel="noopener">View on Metro</a>`
        : "";
      SELECTED.innerHTML = `${thumb}<div class="vinyl-picked-copy"><strong>${escapeHtml(color.n)}</strong>${view}</div>`;
    }
    if (CLEAR_BTN) CLEAR_BTN.hidden = false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function hideResults() {
    if (!RESULTS) return;
    RESULTS.hidden = true;
    RESULTS.innerHTML = "";
    activeIndex = -1;
    currentHits = [];
  }

  function renderResults(hits, query) {
    if (!RESULTS) return;
    currentHits = hits;
    activeIndex = hits.length ? 0 : -1;

    if (!query.trim()) {
      hideResults();
      return;
    }

    if (!hits.length) {
      RESULTS.hidden = false;
      RESULTS.innerHTML = `<p class="vinyl-empty">No colors match “${escapeHtml(query)}”. Try another name or brand.</p>`;
      return;
    }

    RESULTS.hidden = false;
    RESULTS.innerHTML = hits
      .map((c, i) => {
        const thumb = c.i
          ? `<img class="vinyl-result-thumb" src="${escapeAttr(c.i)}" alt="" width="36" height="36" loading="lazy">`
          : `<span class="vinyl-result-thumb vinyl-result-thumb--empty" aria-hidden="true"></span>`;
        const meta = [c.v, c.f, c.t].filter(Boolean).join(" · ");
        const view = c.u
          ? `<a class="vinyl-result-view" href="${escapeAttr(c.u)}" target="_blank" rel="noopener" data-vinyl-view>View</a>`
          : "";
        return `<button type="button" class="vinyl-result${i === 0 ? " is-active" : ""}" role="option" data-vinyl-index="${i}" aria-selected="${i === 0 ? "true" : "false"}">
          ${thumb}
          <span class="vinyl-result-text">
            <span class="vinyl-result-name">${escapeHtml(c.n)}</span>
            <span class="vinyl-result-meta">${escapeHtml(meta)}</span>
          </span>
          ${view}
        </button>`;
      })
      .join("");
  }

  function setActive(index) {
    if (!RESULTS || !currentHits.length) return;
    const buttons = RESULTS.querySelectorAll("[data-vinyl-index]");
    if (!buttons.length) return;
    activeIndex = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((btn, i) => {
      const on = i === activeIndex;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (on) btn.scrollIntoView({ block: "nearest" });
    });
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const c of colors) {
      const hay = `${c.n} ${c.v} ${c.f} ${c.t}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 0;
      if (c.n.toLowerCase().startsWith(q)) score += 40;
      if (c.n.toLowerCase().includes(q)) score += 20;
      if ((c.v || "").toLowerCase().includes(q)) score += 10;
      scored.push({ c, score });
    }
    scored.sort((a, b) => b.score - a.score || a.c.n.localeCompare(b.c.n));
    return scored.slice(0, MAX_RESULTS).map((s) => s.c);
  }

  function pick(color) {
    if (!color) return;
    INPUT.value = color.n;
    writeMeta(color);
    hideResults();
  }

  async function loadData() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        const res = await fetch("/data/vinyl-colors.json", { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        colors = data.colors || [];
        loaded = true;
      } catch (err) {
        console.warn("Vinyl catalog failed to load", err);
        colors = [];
        if (RESULTS) {
          RESULTS.hidden = false;
          RESULTS.innerHTML =
            '<p class="vinyl-empty">Couldn’t load color list. Use finish + notes, or try again later.</p>';
        }
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  INPUT.setAttribute("autocomplete", "off");
  INPUT.setAttribute("role", "combobox");
  INPUT.setAttribute("aria-autocomplete", "list");
  INPUT.setAttribute("aria-expanded", "false");
  if (RESULTS) {
    RESULTS.setAttribute("role", "listbox");
    if (!RESULTS.id) RESULTS.id = "vinyl-color-results";
    INPUT.setAttribute("aria-controls", RESULTS.id);
  }

  INPUT.addEventListener("focus", async () => {
    await loadData();
    if (INPUT.value.trim()) {
      renderResults(search(INPUT.value), INPUT.value);
      INPUT.setAttribute("aria-expanded", "true");
    }
  });

  INPUT.addEventListener("input", async () => {
    await loadData();
    // Typing a new query clears a previous pick unless it still matches exactly
    if (META.label && META.label.value && INPUT.value !== META.label.value) {
      clearMeta();
    }
    const hits = search(INPUT.value);
    renderResults(hits, INPUT.value);
    INPUT.setAttribute("aria-expanded", hits.length || INPUT.value.trim() ? "true" : "false");
  });

  INPUT.addEventListener("keydown", (e) => {
    if (!RESULTS || RESULTS.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && currentHits[activeIndex]) {
        e.preventDefault();
        pick(currentHits[activeIndex]);
        INPUT.setAttribute("aria-expanded", "false");
      }
    } else if (e.key === "Escape") {
      hideResults();
      INPUT.setAttribute("aria-expanded", "false");
    }
  });

  if (RESULTS) {
    RESULTS.addEventListener("mousedown", (e) => {
      const view = e.target.closest("[data-vinyl-view]");
      if (view) {
        // Allow the View link without selecting / closing awkwardly
        e.stopPropagation();
        return;
      }
      const btn = e.target.closest("[data-vinyl-index]");
      if (!btn) return;
      e.preventDefault();
      const idx = Number(btn.getAttribute("data-vinyl-index"));
      pick(currentHits[idx]);
      INPUT.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", (e) => {
    if (!FORM.contains(e.target)) {
      hideResults();
      INPUT.setAttribute("aria-expanded", "false");
    }
  });

  if (CLEAR_BTN) {
    CLEAR_BTN.addEventListener("click", () => {
      INPUT.value = "";
      clearMeta();
      hideResults();
      INPUT.focus();
    });
  }

  clearMeta();
  // Prefetch so first keystroke is snappy
  loadData();
})();
