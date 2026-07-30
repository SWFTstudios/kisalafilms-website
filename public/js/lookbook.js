(() => {
  const API_URL = "/api/films";
  const grid = document.querySelector("[data-lookbook-grid]");
  const tableBody = document.querySelector("[data-inventory-body]");
  const meta = document.querySelector("[data-lookbook-meta]");
  const search = document.querySelector("[data-lookbook-search]");
  const sortSelect = document.querySelector("[data-lookbook-sort]");
  const stockSelect = document.querySelector("[data-lookbook-stock]");
  const finishSelect = document.querySelector("[data-lookbook-finish]");
  if (!grid) return;

  /** @type {Array<Record<string, unknown>>} */
  let rows = [];
  let finishesFromApi = [];
  let finish = "all";
  let stock = "all"; // all | in | out
  let sort = "name";
  let query = "";

  const availLabel = (inStock) => (inStock ? "In stock" : "Out of stock");
  const availClass = (inStock) => (inStock ? "kf-avail--in" : "kf-avail--out");

  const SORTS = {
    name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
    "name-desc": (a, b) => String(b.name || "").localeCompare(String(a.name || "")),
    brand: (a, b) =>
      String(a.brand || "").localeCompare(String(b.brand || "")) ||
      String(a.name || "").localeCompare(String(b.name || "")),
    finish: (a, b) =>
      String(a.finish || "~").localeCompare(String(b.finish || "~")) ||
      String(a.name || "").localeCompare(String(b.name || "")),
    stock: (a, b) =>
      Number(!!b.in_stock) - Number(!!a.in_stock) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  };

  const filtered = () => {
    const list = rows.filter((r) => {
      const inStock = !!r.in_stock;
      if (stock === "in" && !inStock) return false;
      if (stock === "out" && inStock) return false;
      const fOk =
        finish === "all" ||
        String(r.finish || "").toLowerCase() === finish.toLowerCase();
      if (!fOk) return false;
      if (!query) return true;
      const hay = [r.name, r.brand, r.finish, r.sku, r.handle, r.color_family]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
    return list.sort(SORTS[sort] || SORTS.name);
  };

  const populateFinishSelect = () => {
    if (!finishSelect) return;
    const finishes = (
      finishesFromApi.length
        ? finishesFromApi
        : Array.from(new Set(rows.map((r) => r.finish).filter(Boolean)))
    )
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b)));

    const previous = finish;
    finishSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All finishes";
    finishSelect.appendChild(allOpt);
    finishes.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = String(f);
      opt.textContent = String(f);
      finishSelect.appendChild(opt);
    });
    finishSelect.value = finishes.some((f) => String(f) === previous) ? previous : "all";
    finish = finishSelect.value;
  };

  const render = () => {
    const list = filtered();
    const inView = list.filter((r) => r.in_stock).length;
    if (meta) {
      meta.textContent = `${list.length} colours · ${inView} in stock`;
    }

    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML =
        '<p class="gallery-empty">No wrap films match those filters. Try clearing search or switching stock / finish.</p>';
    }

    list.forEach((r) => {
      const inStock = !!r.in_stock;
      const name = r.name || "Untitled";
      const sku = r.sku || "";
      const handle = r.handle || "";
      const href = handle
        ? `/lookbook/film.html?h=${encodeURIComponent(String(handle))}`
        : "/lookbook.html";

      const card = document.createElement("article");
      card.className = "kf-lookbook-card";
      if (!inStock) card.classList.add("is-oos");
      if (handle) card.setAttribute("data-film-handle", String(handle));

      const media = document.createElement("a");
      media.className = "kf-lookbook-card-media";
      media.href = href;
      media.setAttribute("data-track", "cta_click");
      media.setAttribute("data-track-label", `lookbook-${handle || sku || "film"}`);
      media.setAttribute("aria-label", `View ${name}`);
      if (r.image_url) {
        const img = document.createElement("img");
        img.src = String(r.image_url);
        img.alt = String(name);
        img.loading = "lazy";
        img.width = 600;
        img.height = 600;
        media.appendChild(img);
      }
      card.appendChild(media);

      const body = document.createElement("div");
      body.className = "kf-lookbook-card-body";
      body.innerHTML = `
        <h3><a href="${href}">${escapeHtml(name)}</a></h3>
        <p class="meta">${escapeHtml([r.brand, r.finish, sku].filter(Boolean).join(" · "))}</p>
        <div class="kf-lookbook-card-foot">
          <span class="kf-avail ${availClass(inStock)}">${availLabel(inStock)}</span>
          <button type="button" class="kf-lookbook-try-btn" data-try-film-btn>Try</button>
        </div>
      `;
      body.querySelector("[data-try-film-btn]")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.KisalaTryWrap?.selectFilm(r);
        window.KisalaTrack?.("try_wrap_select", {
          label: String(name),
          handle: String(handle || ""),
        });
      });
      card.appendChild(body);
      grid.appendChild(card);
    });

    if (tableBody) {
      tableBody.innerHTML = "";
      list.forEach((r) => {
        const inStock = !!r.in_stock;
        const handle = r.handle || "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(r.sku || "—")}</td>
          <td><a href="${handle ? `/lookbook/film.html?h=${encodeURIComponent(String(handle))}` : "/lookbook.html"}">${escapeHtml(r.name || "Untitled")}</a></td>
          <td>${escapeHtml(r.brand || "—")}</td>
          <td>${escapeHtml(r.finish || "—")}</td>
          <td><span class="kf-avail ${availClass(inStock)}">${availLabel(inStock)}</span></td>
        `;
        tableBody.appendChild(tr);
      });
    }

    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  finishSelect?.addEventListener("change", () => {
    finish = finishSelect.value || "all";
    render();
  });

  fetch(API_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    })
    .then((data) => {
      rows = Array.isArray(data.films) ? data.films : [];
      finishesFromApi = Array.isArray(data.finishes) ? data.finishes : [];
      populateFinishSelect();
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load film CMS (D1 API)";
      grid.innerHTML = `<p class="gallery-empty">Lookbook needs Wrangler + D1. Run <code>npm run dev</code>, apply migrations, then <code>python3 scripts/import-films-d1.py --local --skip-metro-fetch</code>.</p>`;
    });
})();
