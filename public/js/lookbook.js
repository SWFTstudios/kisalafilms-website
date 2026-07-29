(() => {
  const API_URL = "/api/films";
  const grid = document.querySelector("[data-lookbook-grid]");
  const tableBody = document.querySelector("[data-inventory-body]");
  const meta = document.querySelector("[data-lookbook-meta]");
  const search = document.querySelector("[data-lookbook-search]");
  const filterHost = document.querySelector("[data-lookbook-filters]");
  const stockHost = document.querySelector("[data-lookbook-stock]");
  if (!grid) return;

  /** @type {Array<Record<string, unknown>>} */
  let rows = [];
  let finishesFromApi = [];
  let finish = "all";
  let stock = "all"; // all | in | out
  let query = "";

  const availLabel = (inStock) => (inStock ? "In stock" : "Out of stock");
  const availClass = (inStock) => (inStock ? "kf-avail--in" : "kf-avail--out");

  const filtered = () =>
    rows.filter((r) => {
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

  const renderFilters = () => {
    if (filterHost) {
      const finishes = (
        finishesFromApi.length
          ? finishesFromApi
          : Array.from(new Set(rows.map((r) => r.finish).filter(Boolean)))
      ).slice().sort((a, b) => String(a).localeCompare(String(b)));
      filterHost.innerHTML = "";
      const tabRow = document.createElement("div");
      tabRow.className = "filter-tabs";
      const makeBtn = (key, label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        if (key === finish) btn.classList.add("on");
        btn.addEventListener("click", () => {
          finish = key;
          renderFilters();
          render();
        });
        return btn;
      };
      tabRow.appendChild(makeBtn("all", "All finishes"));
      finishes.forEach((f) => tabRow.appendChild(makeBtn(String(f), String(f))));
      filterHost.appendChild(tabRow);
    }

    if (stockHost) {
      stockHost.innerHTML = "";
      const tabRow = document.createElement("div");
      tabRow.className = "filter-tabs";
      [
        ["all", "All stock"],
        ["in", "In stock"],
        ["out", "Out of stock"],
      ].forEach(([key, label]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        if (key === stock) btn.classList.add("on");
        btn.addEventListener("click", () => {
          stock = key;
          renderFilters();
          render();
        });
        tabRow.appendChild(btn);
      });
      stockHost.appendChild(tabRow);
    }
  };

  const render = () => {
    const list = filtered();
    const inView = list.filter((r) => r.in_stock).length;
    if (meta) {
      meta.textContent = `${list.length} colours · ${inView} in stock · Cloudflare D1 CMS`;
    }

    grid.innerHTML = "";
    list.forEach((r) => {
      const inStock = !!r.in_stock;
      const name = r.name || "Untitled";
      const sku = r.sku || "";
      const handle = r.handle || "";
      const href = handle
        ? `/lookbook/film.html?h=${encodeURIComponent(String(handle))}`
        : "/lookbook.html";

      const card = document.createElement("a");
      card.className = "kf-lookbook-card";
      if (!inStock) card.classList.add("is-oos");
      card.href = href;
      card.setAttribute("data-track", "cta_click");
      card.setAttribute("data-track-label", `lookbook-${handle || sku || "film"}`);

      const media = document.createElement("div");
      media.className = "kf-lookbook-card-media";
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
        <h3>${escapeHtml(name)}</h3>
        <p class="meta">${escapeHtml([r.brand, r.finish, sku].filter(Boolean).join(" · "))}</p>
        <div class="kf-lookbook-card-foot">
          <span class="kf-avail ${availClass(inStock)}">${availLabel(inStock)}</span>
        </div>
      `;
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

  fetch(API_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    })
    .then((data) => {
      rows = Array.isArray(data.films) ? data.films : [];
      finishesFromApi = Array.isArray(data.finishes) ? data.finishes : [];
      renderFilters();
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load film CMS (D1 API)";
      grid.innerHTML = `<p class="gallery-empty">Lookbook needs Wrangler + D1. Run <code>npm run dev</code>, apply migrations, then <code>python3 scripts/import-films-d1.py --local --skip-metro-fetch</code>.</p>`;
    });
})();
