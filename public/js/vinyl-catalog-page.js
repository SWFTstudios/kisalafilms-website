/**
 * Vinyl colour grid — JSON from /data/vinyl-colors.json.
 * Search + sort + filters. Colour families are multi-select (OR).
 */
(() => {
  const grid = document.querySelector("[data-catalog-grid]");
  const meta = document.querySelector("[data-catalog-meta]");
  const search = document.querySelector("[data-catalog-search]");
  const sortSelect = document.querySelector("[data-catalog-sort]");
  const stockSelect = document.querySelector("[data-catalog-stock]");
  const brandSelect = document.querySelector("[data-catalog-brand]");
  const familyChips = document.querySelector("[data-catalog-families]");
  const familyClear = document.querySelector("[data-catalog-family-clear]");
  const finishSelect = document.querySelector("[data-catalog-finish]");
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

  let rows = [];
  let query = "";
  let sort = "name";
  let stock = "all";
  let brand = "all";
  /** @type {Set<string>} */
  let familiesSelected = new Set();
  let finish = "all";

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

  function fillSelect(select, values, allLabel, current) {
    if (!select) return current;
    const list = values.slice().sort((a, b) => String(a).localeCompare(String(b)));
    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = allLabel;
    select.appendChild(allOpt);
    list.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(v);
      select.appendChild(opt);
    });
    const next = list.some((v) => String(v) === current) ? current : "all";
    select.value = next;
    return next;
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
    if (meta) {
      const pick =
        familiesSelected.size > 0
          ? " · " + familiesSelected.size + " colour" + (familiesSelected.size === 1 ? "" : "s") + " selected"
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
  sortSelect?.addEventListener("change", () => {
    sort = sortSelect.value || "name";
    render();
  });
  stockSelect?.addEventListener("change", () => {
    stock = stockSelect.value || "all";
    render();
  });
  brandSelect?.addEventListener("change", () => {
    brand = brandSelect.value || "all";
    render();
  });
  finishSelect?.addEventListener("change", () => {
    finish = finishSelect.value || "all";
    render();
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

      brand = fillSelect(brandSelect, brands, "All brands", brand);
      finish = fillSelect(finishSelect, finishes, "All finishes", finish);
      renderFamilyChips(families);
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load colours";
      grid.innerHTML = '<p class="gallery-empty">Could not load the colour catalogue.</p>';
    });
})();
