/**
 * Gallery: category tabs + title/tag search + sort.
 * Works with masonry figures that carry data-filter-item, data-title, data-tags, data-date.
 */
(() => {
  const grid = document.querySelector("[data-gallery-grid]");
  if (!grid) return;

  const tabs = document.querySelector("[data-filter-tabs]");
  const titleInput = document.querySelector("[data-gallery-search-title]");
  const tagInput = document.querySelector("[data-gallery-search-tags]");
  const sortSelect = document.querySelector("[data-gallery-sort]");
  const emptyNote = document.querySelector("[data-gallery-empty]");
  const countEl = document.querySelector("[data-gallery-count]");

  const items = Array.from(grid.querySelectorAll(".masonry-item"));
  let category = "all";

  function normalize(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function apply() {
    const titleQ = normalize(titleInput?.value);
    const tagQ = normalize(tagInput?.value);
    const sort = sortSelect?.value || "newest";

    const ranked = items.map((el, index) => {
      const cats = normalize(el.getAttribute("data-filter-item")).split(/\s+/).filter(Boolean);
      const title = normalize(el.getAttribute("data-title") || el.getAttribute("data-caption"));
      const tags = normalize(el.getAttribute("data-tags"));
      const date = el.getAttribute("data-date") || "";
      const catOk = category === "all" || cats.includes(category);
      const titleOk = !titleQ || title.includes(titleQ);
      const tagOk = !tagQ || tags.includes(tagQ) || cats.some((c) => c.includes(tagQ));
      return { el, index, title, date, show: catOk && titleOk && tagOk };
    });

    ranked.sort((a, b) => {
      if (sort === "title-asc") return a.title.localeCompare(b.title);
      if (sort === "title-desc") return b.title.localeCompare(a.title);
      if (sort === "oldest") return a.date.localeCompare(b.date) || a.index - b.index;
      // newest
      return b.date.localeCompare(a.date) || a.index - b.index;
    });

    ranked.forEach((row) => {
      row.el.hidden = !row.show;
      if (row.show) grid.appendChild(row.el);
    });

    const visible = ranked.filter((r) => r.show).length;
    if (emptyNote) emptyNote.hidden = visible > 0;
    if (countEl) {
      countEl.textContent =
        visible === 1 ? "1 piece" : `${visible} pieces`;
    }
  }

  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      tabs.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      category = btn.getAttribute("data-filter") || "all";
      apply();
    });
  }

  titleInput?.addEventListener("input", apply);
  tagInput?.addEventListener("input", apply);
  sortSelect?.addEventListener("change", apply);

  apply();
})();
