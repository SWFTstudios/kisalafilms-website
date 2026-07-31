(() => {
  const API_URL = "/api/films";
  const grid = document.querySelector("[data-catalog-grid]");
  const tableBody = document.querySelector("[data-inventory-body]");
  const meta = document.querySelector("[data-catalog-meta]");
  const search = document.querySelector("[data-catalog-search]");
  const sortSelect = document.querySelector("[data-catalog-sort]");
  const stockSelect = document.querySelector("[data-catalog-stock]");
  const finishSelect = document.querySelector("[data-catalog-finish]");
  const brandSelect = document.querySelector("[data-catalog-brand]");
  const familySelect = document.querySelector("[data-catalog-family]");
  const typeTabs = document.querySelectorAll("[data-catalog-type]");
  const founderBanner = document.querySelector("[data-founder-banner]");
  if (!grid) return;

  let rows = [];
  let finishesFromApi = [];
  let brandsFromApi = [];
  let familiesFromApi = [];
  let productType = "all";
  let finish = "all";
  let brand = "all";
  let family = "all";
  let stock = "all";
  let sort = "name";
  let query = "";
  let founderPricingActive = false;

  const availLabel = (inStock) => (inStock ? "In stock" : "Out of stock");
  const availClass = (inStock) => (inStock ? "kf-avail--in" : "kf-avail--out");
  const formatRoll = (r) => {
    const n = r.sell_price_usd ?? r.roll_price_usd ?? r.price_usd;
    if (n === null || n === undefined || n === "") return "—";
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return "$" + num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  };
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
    price: (a, b) =>
      (Number(a.sell_price_usd ?? a.roll_price_usd ?? a.price_usd ?? 1e12) || 1e12) -
        (Number(b.sell_price_usd ?? b.roll_price_usd ?? b.price_usd ?? 1e12) || 1e12) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  };
  const filtered = () => {
    const list = rows.filter((r) => {
      if (stock === "in" && !r.in_stock) return false;
      if (stock === "out" && r.in_stock) return false;
      if (
        productType !== "all" &&
        String(r.product_type || "").toLowerCase() !== productType.toLowerCase()
      )
        return false;
      if (finish !== "all" && String(r.finish || "").toLowerCase() !== finish.toLowerCase())
        return false;
      if (brand !== "all" && String(r.brand || "").toLowerCase() !== brand.toLowerCase())
        return false;
      if (
        family !== "all" &&
        String(r.color_family || "").toLowerCase() !== family.toLowerCase()
      )
        return false;
      if (!query) return true;
      return [r.name, r.brand, r.finish, r.sku, r.handle, r.color_family, r.product_type]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    return list.sort(SORTS[sort] || SORTS.name);
  };
  const fillSelect = (select, values, allLabel, current) => {
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
  };
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  const render = () => {
    const list = filtered();
    if (meta)
      meta.textContent =
        list.length + " films · " + list.filter((r) => r.in_stock).length + " in stock";
    grid.innerHTML = "";
    if (!list.length)
      grid.innerHTML =
        '<p class="gallery-empty">No films match those filters. Try another category or clear search.</p>';
    list.forEach((r) => {
      const handle = r.handle || "";
      const href = handle
        ? "/vinyl-catalog/film.html?h=" + encodeURIComponent(String(handle))
        : "/vinyl-catalog.html";
      const roll = formatRoll(r);
      const card = document.createElement("a");
      card.className = "kf-lookbook-card" + (r.in_stock ? "" : " is-oos");
      card.href = href;
      const media = document.createElement("div");
      media.className = "kf-lookbook-card-media";
      if (r.image_url) {
        const img = document.createElement("img");
        img.src = String(r.image_url);
        img.alt = String(r.name || "");
        img.loading = "lazy";
        img.width = 600;
        img.height = 600;
        media.appendChild(img);
      }
      card.appendChild(media);
      const body = document.createElement("div");
      body.className = "kf-lookbook-card-body";
      const priceLine =
        roll !== "—"
          ? '<span class="kf-roll-price">Roll · ' + escapeHtml(roll) + "</span>"
          : "";
      body.innerHTML =
        "<h3>" +
        escapeHtml(r.name || "Untitled") +
        '</h3><p class="meta">' +
        escapeHtml([r.brand, r.finish, r.sku].filter(Boolean).join(" · ")) +
        '</p><div class="kf-lookbook-card-foot"><span class="kf-avail ' +
        availClass(!!r.in_stock) +
        '">' +
        availLabel(!!r.in_stock) +
        "</span>" +
        priceLine +
        "</div>";
      card.appendChild(body);
      grid.appendChild(card);
    });
    if (tableBody) {
      tableBody.innerHTML = "";
      list.forEach((r) => {
        const handle = r.handle || "";
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          escapeHtml(r.sku || "—") +
          '</td><td><a href="' +
          (handle
            ? "/vinyl-catalog/film.html?h=" + encodeURIComponent(String(handle))
            : "/vinyl-catalog.html") +
          '">' +
          escapeHtml(r.name || "Untitled") +
          "</a></td><td>" +
          escapeHtml(r.brand || "—") +
          "</td><td>" +
          escapeHtml(r.finish || "—") +
          "</td><td>" +
          escapeHtml(formatRoll(r)) +
          '</td><td><span class="kf-avail ' +
          availClass(!!r.in_stock) +
          '">' +
          availLabel(!!r.in_stock) +
          "</span></td>";
        tableBody.appendChild(tr);
      });
    }
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };
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
  brandSelect?.addEventListener("change", () => {
    brand = brandSelect.value || "all";
    render();
  });
  familySelect?.addEventListener("change", () => {
    family = familySelect.value || "all";
    render();
  });
  typeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      productType = tab.getAttribute("data-catalog-type") || "all";
      typeTabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      render();
    });
  });
  fetch(API_URL)
    .then((res) => {
      if (!res.ok) throw new Error("API " + res.status);
      return res.json();
    })
    .then((data) => {
      rows = Array.isArray(data.films) ? data.films : [];
      finishesFromApi = Array.isArray(data.finishes) ? data.finishes : [];
      brandsFromApi = Array.isArray(data.brands) ? data.brands : [];
      familiesFromApi = Array.isArray(data.colorFamilies) ? data.colorFamilies : [];
      founderPricingActive = !!data.founderPricingActive;
      if (founderBanner) {
        founderBanner.hidden = false;
        founderBanner.textContent =
          "Vinyl priced at Metro roll cost + 40%. Motorcycle & helmet wraps use set labour by difficulty. Start a project from any film." +
          (founderPricingActive
            ? " Founder window: " +
              (data.founderSlotsRemaining ?? "?") +
              " of " +
              (data.founderLimit || 5) +
              " at-cost slots still show supplier cost for reference."
            : "");
      }
      if (sortSelect && !sortSelect.querySelector('option[value="price"]')) {
        const opt = document.createElement("option");
        opt.value = "price";
        opt.textContent = "Roll price";
        sortSelect.appendChild(opt);
      }
      finish = fillSelect(
        finishSelect,
        finishesFromApi.length
          ? finishesFromApi
          : Array.from(new Set(rows.map((r) => r.finish).filter(Boolean))),
        "All finishes",
        finish
      );
      brand = fillSelect(
        brandSelect,
        brandsFromApi.length
          ? brandsFromApi
          : Array.from(new Set(rows.map((r) => r.brand).filter(Boolean))),
        "All brands",
        brand
      );
      family = fillSelect(
        familySelect,
        familiesFromApi.length
          ? familiesFromApi
          : Array.from(new Set(rows.map((r) => r.color_family).filter(Boolean))),
        "All colours",
        family
      );
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load film CMS (D1 API)";
      grid.innerHTML =
        '<p class="gallery-empty">Vinyl catalog needs Wrangler + D1. Run <code>npm run dev</code>, apply migrations, then import films.</p>';
    });
})();
