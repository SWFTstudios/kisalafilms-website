/**
 * Vinyl colour grid — JSON from /data/vinyl-colors.json.
 * Sticky sub-nav: search + filter popovers. Colour families are multi-select (OR).
 */
(() => {
  const grid = document.querySelector("[data-catalog-grid]");
  const meta = document.querySelector("[data-catalog-meta]");
  const search = document.querySelector("[data-catalog-search]");
  const familyChips = document.querySelector("[data-catalog-families]");
  const familyClear = document.querySelector("[data-catalog-family-clear]");
  const backdrop = document.querySelector("[data-filter-backdrop]");
  const triggers = Array.from(document.querySelectorAll("[data-filter-trigger]"));
  const panels = Array.from(document.querySelectorAll("[data-filter-panel]"));
  if (!grid) return;

  /** Spectrum first (ROYGBIV + pink), then neutrals, then effects. */
  const FAMILY_ORDER = [
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "white",
    "black",
    "grey",
    "brown",
    "chrome",
    "carbon",
    "shift",
    "clear",
    "other",
  ];

  const FAMILY_HEX = {
    red: "#d2201a",
    orange: "#e8701a",
    yellow: "#e8c31a",
    green: "#2f9e52",
    blue: "#2b6ef6",
    purple: "#7d3fc9",
    pink: "#e0479b",
    white: "#f4f4f2",
    black: "#0b0b0b",
    grey: "#8a8f94",
    brown: "#7a5334",
    chrome: "#cfd5da",
    carbon: "#1e1e1e",
    shift: "#7b2ff7",
    clear: "#8fa3ad",
    other: "#5a5f63",
  };

  const SORT_OPTIONS = [
    { value: "name", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
    { value: "brand", label: "Brand" },
    { value: "finish", label: "Finish" },
    { value: "stock", label: "In stock first" },
  ];

  const STOCK_OPTIONS = [
    { value: "all", label: "All stock" },
    { value: "in", label: "In stock" },
    { value: "out", label: "Out of stock" },
  ];

  let rows = [];
  let query = "";
  let sort = "name";
  let stock = "all";
  let brand = "all";
  /** @type {Set<string>} */
  let familiesSelected = new Set();
  let finish = "all";
  /** @type {string|null} */
  let openPanel = null;
  /** @type {HTMLElement|null} */
  let lastTrigger = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayName(title) {
    const raw = String(title || "").trim();
    if (!raw) return "Untitled";
    return raw.split("|")[0].trim() || raw;
  }

  function mapColor(c) {
    const handle = String(c.h || "").trim();
    if (!handle) return null;
    return {
      handle,
      name: displayName(c.n),
      brand: c.v || "",
      finish: c.f || "",
      color_family: c.c || "",
      image_url: c.i || "",
      in_stock: !!c.a,
    };
  }

  const SORTS = {
    name: (a, b) => a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle),
    "name-desc": (a, b) => b.name.localeCompare(a.name) || a.handle.localeCompare(b.handle),
    brand: (a, b) =>
      a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
    finish: (a, b) =>
      a.finish.localeCompare(b.finish) || a.name.localeCompare(b.name),
    stock: (a, b) =>
      Number(!!b.in_stock) - Number(!!a.in_stock) || a.name.localeCompare(b.name),
  };

  function normalizeFamilies(raw, fallbackIds) {
    const fromJson = Array.isArray(raw)
      ? raw
          .map((f) => {
            if (f && typeof f === "object") {
              const id = String(f.id || "").trim();
              if (!id) return null;
              return {
                id,
                label: String(f.label || id),
                hex: String(f.hex || FAMILY_HEX[id] || "#888"),
              };
            }
            const id = String(f || "").trim();
            return id ? { id, label: id, hex: FAMILY_HEX[id] || "#888" } : null;
          })
          .filter(Boolean)
      : [];

    const byId = new Map(fromJson.map((f) => [f.id, f]));
    fallbackIds.forEach((id) => {
      if (!byId.has(id)) {
        byId.set(id, { id, label: id, hex: FAMILY_HEX[id] || "#888" });
      }
    });

    const ordered = [];
    FAMILY_ORDER.forEach((id) => {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    });
    [...byId.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((f) => ordered.push(f));
    return ordered;
  }

  function optionList(key) {
    return document.querySelector("[data-catalog-" + key + "-options]");
  }

  function fillOptions(key, options, current) {
    const host = optionList(key);
    if (!host) return current;
    const list = options.slice();
    const values = list.map((o) => String(o.value));
    const next = values.includes(String(current)) ? current : list[0]?.value;
    host.innerHTML = "";
    list.forEach((o) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kf-vinyl-filter-option";
      btn.setAttribute("data-filter-value", String(o.value));
      btn.setAttribute("aria-pressed", String(o.value) === String(next) ? "true" : "false");
      if (String(o.value) === String(next)) btn.classList.add("is-on");
      btn.textContent = o.label;
      host.appendChild(btn);
    });
    return next;
  }

  function syncOptionPressed(key, current) {
    const host = optionList(key);
    if (!host) return;
    host.querySelectorAll("[data-filter-value]").forEach((btn) => {
      const on = btn.getAttribute("data-filter-value") === String(current);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderFamilyChips(families) {
    if (!familyChips) return;
    familyChips.innerHTML = "";
    families.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kf-vinyl-color-chip";
      btn.setAttribute("data-family-id", f.id);
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML =
        '<span class="kf-vinyl-color-swatch" style="background:' +
        escapeHtml(f.hex || FAMILY_HEX[f.id] || "#888") +
        '" aria-hidden="true"></span>' +
        '<span class="kf-vinyl-color-chip-label">' +
        escapeHtml(f.label) +
        "</span>";
      familyChips.appendChild(btn);
    });
    syncFamilyChipState();
  }

  function syncFamilyChipState() {
    if (!familyChips) return;
    familyChips.querySelectorAll("[data-family-id]").forEach((btn) => {
      const id = btn.getAttribute("data-family-id");
      const on = familiesSelected.has(id);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (familyClear) familyClear.hidden = familiesSelected.size === 0;
  }

  function labelFor(key, value, options) {
    const hit = options.find((o) => String(o.value) === String(value));
    return hit ? hit.label : String(value);
  }

  function updateTriggerLabels() {
    const sortLabel = document.querySelector('[data-filter-label="sort"]');
    const stockLabel = document.querySelector('[data-filter-label="stock"]');
    const brandLabel = document.querySelector('[data-filter-label="brand"]');
    const finishLabel = document.querySelector('[data-filter-label="finish"]');
    const colourLabel = document.querySelector('[data-filter-label="colour"]');

    if (sortLabel) {
      sortLabel.textContent =
        sort === "name" ? "Sort" : "Sort · " + labelFor("sort", sort, SORT_OPTIONS);
    }
    if (stockLabel) {
      stockLabel.textContent =
        stock === "all" ? "Stock" : "Stock · " + labelFor("stock", stock, STOCK_OPTIONS);
    }
    if (brandLabel) {
      brandLabel.textContent = brand === "all" ? "Brand" : "Brand · " + brand;
    }
    if (finishLabel) {
      finishLabel.textContent = finish === "all" ? "Finish" : "Finish · " + finish;
    }
    if (colourLabel) {
      colourLabel.textContent =
        familiesSelected.size === 0
          ? "Colour"
          : "Colour · " + familiesSelected.size;
    }

    triggers.forEach((btn) => {
      const key = btn.getAttribute("data-filter-trigger");
      let active = false;
      if (key === "sort") active = sort !== "name";
      else if (key === "stock") active = stock !== "all";
      else if (key === "brand") active = brand !== "all";
      else if (key === "finish") active = finish !== "all";
      else if (key === "colour") active = familiesSelected.size > 0;
      btn.classList.toggle("is-active", active);
    });
  }

  function closePanel(opts) {
    if (!openPanel) return;
    panels.forEach((p) => {
      p.hidden = true;
    });
    triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    if (backdrop) backdrop.hidden = true;
    document.documentElement.classList.remove("kf-vinyl-filter-open");
    openPanel = null;
    if (!opts || opts.focus !== false) {
      if (lastTrigger) lastTrigger.focus();
    }
    lastTrigger = null;
  }

  function openFilterPanel(key, triggerEl) {
    if (openPanel === key) {
      closePanel();
      return;
    }
    closePanel({ focus: false });
    const panel = panels.find((p) => p.getAttribute("data-filter-panel") === key);
    if (!panel) return;
    openPanel = key;
    lastTrigger = triggerEl || null;
    panel.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.documentElement.classList.add("kf-vinyl-filter-open");
    triggers.forEach((t) => {
      t.setAttribute(
        "aria-expanded",
        t.getAttribute("data-filter-trigger") === key ? "true" : "false"
      );
    });
    const focusable = panel.querySelector(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    focusable?.focus();
  }

  function filtered() {
    const list = rows.filter((r) => {
      if (stock === "in" && !r.in_stock) return false;
      if (stock === "out" && r.in_stock) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (familiesSelected.size > 0 && !familiesSelected.has(r.color_family)) return false;
      if (finish !== "all" && r.finish !== finish) return false;
      if (!query) return true;
      return [r.name, r.brand, r.finish, r.color_family, r.handle]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    return list.sort(SORTS[sort] || SORTS.name);
  }

  function render() {
    const list = filtered();
    updateTriggerLabels();
    if (meta) {
      const pick =
        familiesSelected.size > 0
          ? " · " +
            familiesSelected.size +
            " colour" +
            (familiesSelected.size === 1 ? "" : "s") +
            " selected"
          : "";
      meta.textContent = list.length + " colours" + pick;
    }
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML =
        '<p class="gallery-empty">No colours match those filters. Clear search or reset filters.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach((r) => {
      const a = document.createElement("a");
      a.className = "kf-lookbook-card" + (r.in_stock ? "" : " is-oos");
      a.href = "/vinyl-catalog/film?h=" + encodeURIComponent(r.handle);
      a.innerHTML =
        '<div class="kf-lookbook-card-media">' +
        (r.image_url
          ? '<img src="' +
            escapeHtml(r.image_url) +
            '" alt="' +
            escapeHtml(r.name) +
            '" loading="lazy" width="600" height="600">'
          : "") +
        '</div><div class="kf-lookbook-card-body"><h3>' +
        escapeHtml(r.name) +
        '</h3><p class="meta">' +
        escapeHtml([r.brand, r.finish].filter(Boolean).join(" · ")) +
        "</p></div>";
      frag.appendChild(a);
    });
    grid.appendChild(frag);
  }

  search?.addEventListener("input", () => {
    query = (search.value || "").trim().toLowerCase();
    render();
  });

  triggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter-trigger");
      if (!key) return;
      openFilterPanel(key, btn);
    });
  });

  backdrop?.addEventListener("click", () => closePanel());

  document.querySelectorAll("[data-filter-close]").forEach((btn) => {
    btn.addEventListener("click", () => closePanel());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPanel) {
      e.preventDefault();
      closePanel();
    }
  });

  function bindOptionClicks(key, apply) {
    const host = optionList(key);
    host?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter-value]");
      if (!btn || !host.contains(btn)) return;
      const value = btn.getAttribute("data-filter-value");
      apply(value);
      syncOptionPressed(key, value);
      render();
      if (key !== "colour") closePanel();
    });
  }

  bindOptionClicks("sort", (v) => {
    sort = v || "name";
  });
  bindOptionClicks("stock", (v) => {
    stock = v || "all";
  });
  bindOptionClicks("brand", (v) => {
    brand = v || "all";
  });
  bindOptionClicks("finish", (v) => {
    finish = v || "all";
  });

  familyChips?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-family-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-family-id");
    if (!id) return;
    if (familiesSelected.has(id)) familiesSelected.delete(id);
    else familiesSelected.add(id);
    syncFamilyChipState();
    render();
  });

  familyClear?.addEventListener("click", () => {
    familiesSelected.clear();
    syncFamilyChipState();
    render();
  });

  fillOptions("sort", SORT_OPTIONS, sort);
  fillOptions("stock", STOCK_OPTIONS, stock);

  if (meta) meta.textContent = "Loading…";
  fetch("/data/vinyl-colors.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      rows = (Array.isArray(data.colors) ? data.colors : [])
        .map(mapColor)
        .filter(Boolean);

      const brands = Array.isArray(data.vendors)
        ? data.vendors
        : Array.from(new Set(rows.map((r) => r.brand).filter(Boolean)));
      const finishes = Array.isArray(data.finishes)
        ? data.finishes
        : Array.from(new Set(rows.map((r) => r.finish).filter(Boolean)));
      const familyIds = Array.from(
        new Set(rows.map((r) => r.color_family).filter(Boolean))
      );
      const families = normalizeFamilies(data.colorFamilies, familyIds);

      const brandOpts = [{ value: "all", label: "All brands" }].concat(
        brands
          .slice()
          .sort((a, b) => String(a).localeCompare(String(b)))
          .map((v) => ({ value: String(v), label: String(v) }))
      );
      const finishOpts = [{ value: "all", label: "All finishes" }].concat(
        finishes
          .slice()
          .sort((a, b) => String(a).localeCompare(String(b)))
          .map((v) => ({ value: String(v), label: String(v) }))
      );

      brand = fillOptions("brand", brandOpts, brand);
      finish = fillOptions("finish", finishOpts, finish);
      renderFamilyChips(families);
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load colours";
      grid.innerHTML = '<p class="gallery-empty">Could not load the colour catalogue.</p>';
    });
})();
