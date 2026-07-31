/**
 * Vinyl colour grid — JSON from /data/vinyl-colors.json.
 * Search + sort + stock/brand/colour/finish filters, all client-side.
 */
(() => {
  const grid = document.querySelector("[data-catalog-grid]");
  const meta = document.querySelector("[data-catalog-meta]");
  const search = document.querySelector("[data-catalog-search]");
  const sortSelect = document.querySelector("[data-catalog-sort]");
  const stockSelect = document.querySelector("[data-catalog-stock]");
  const brandSelect = document.querySelector("[data-catalog-brand]");
  const familySelect = document.querySelector("[data-catalog-family]");
  const finishSelect = document.querySelector("[data-catalog-finish]");
  if (!grid) return;

  let rows = [];
  let query = "";
  let sort = "name";
  let stock = "all";
  let brand = "all";
  let family = "all";
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

  function filtered() {
    const list = rows.filter((r) => {
      if (stock === "in" && !r.in_stock) return false;
      if (stock === "out" && r.in_stock) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (family !== "all" && r.color_family !== family) return false;
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
    if (meta) meta.textContent = list.length + " colours";
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
  familySelect?.addEventListener("change", () => {
    family = familySelect.value || "all";
    render();
  });
  finishSelect?.addEventListener("change", () => {
    finish = finishSelect.value || "all";
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
      const families = Array.isArray(data.colorFamilies)
        ? data.colorFamilies
        : Array.from(new Set(rows.map((r) => r.color_family).filter(Boolean)));
      const finishes = Array.isArray(data.finishes)
        ? data.finishes
        : Array.from(new Set(rows.map((r) => r.finish).filter(Boolean)));

      brand = fillSelect(brandSelect, brands, "All brands", brand);
      family = fillSelect(familySelect, families, "All colours", family);
      finish = fillSelect(finishSelect, finishes, "All finishes", finish);
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load colours";
      grid.innerHTML = '<p class="gallery-empty">Could not load the colour catalogue.</p>';
    });
})();
