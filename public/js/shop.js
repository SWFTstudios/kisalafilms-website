(() => {
  const grid = document.querySelector("[data-shop-apparel]");
  const viewer = document.querySelector("[data-shop-viewer]");
  if (!grid) return;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function renderCard(product) {
    const kind = product.kind === "hoodie" ? "HOODIE" : "TEE";
    const price = `$${Number(product.price).toFixed(0)}`;
    return `
      <article class="product-card product-card--apparel" data-product-id="${escapeHtml(product.id)}">
        <button type="button" class="product-figure product-figure--media" data-product-open aria-label="View ${escapeHtml(product.title)} photos">
          <img src="${escapeHtml(product.images.hero)}" alt="${escapeHtml(product.title)} — ${escapeHtml(product.color)}" loading="lazy" width="768" height="512">
          <span class="product-tag">WLG DROP</span>
          <span class="product-kind">${kind}</span>
        </button>
        <div class="product-body">
          <div class="product-color-row">
            <span class="product-swatch" style="--swatch:${escapeHtml(product.colorHex)}" aria-hidden="true"></span>
            <span class="product-color-name">${escapeHtml(product.color)}</span>
          </div>
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.blurb)}</p>
          <blockquote class="product-quote">${escapeHtml(product.quote)}</blockquote>
          <div class="product-price">
            <span>${price}</span>
            <a class="btn btn-primary" href="#notify">NOTIFY ME</a>
          </div>
        </div>
      </article>
    `;
  }

  function setViewer(product, activeKey = "hero") {
    if (!viewer || !product) return;
    const shots = [
      { key: "hero", src: product.images.hero, label: "Hero" },
      { key: "detail01", src: product.images.detail01, label: "Print" },
      { key: "detail02", src: product.images.detail02, label: "Build" },
    ];
    const active = shots.find((s) => s.key === activeKey) || shots[0];
    viewer.hidden = false;
    viewer.innerHTML = `
      <div class="shop-viewer-panel">
        <div class="shop-viewer-main">
          <img src="${escapeHtml(active.src)}" alt="${escapeHtml(product.title)} — ${escapeHtml(active.label)}" width="1536" height="1024">
        </div>
        <div class="shop-viewer-meta">
          <span class="eyebrow">WLG QUOTES</span>
          <h3>${escapeHtml(product.title)}</h3>
          <p class="shop-viewer-color">
            <span class="product-swatch" style="--swatch:${escapeHtml(product.colorHex)}" aria-hidden="true"></span>
            ${escapeHtml(product.color)} · $${Number(product.price).toFixed(0)}
          </p>
          <blockquote>${escapeHtml(product.quote)}</blockquote>
          <div class="shop-viewer-thumbs" role="tablist" aria-label="Product shots">
            ${shots
              .map(
                (s) => `
              <button type="button" class="shop-viewer-thumb${s.key === active.key ? " is-active" : ""}" data-shot="${s.key}" aria-pressed="${s.key === active.key}">
                <img src="${escapeHtml(s.src)}" alt="" loading="lazy" width="240" height="160">
                <span>${escapeHtml(s.label)}</span>
              </button>`
              )
              .join("")}
          </div>
          <a class="btn btn-primary" href="#notify">NOTIFY ME FOR THIS DROP</a>
        </div>
      </div>
    `;
    viewer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function boot() {
    try {
      const res = await fetch("/data/products.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`products ${res.status}`);
      const data = await res.json();
      const products = data.products || [];
      grid.innerHTML = products.map(renderCard).join("");

      let activeId = products[0]?.id || null;
      const byId = Object.fromEntries(products.map((p) => [p.id, p]));
      if (activeId) setViewer(byId[activeId], "hero");

      grid.addEventListener("click", (event) => {
        const open = event.target.closest("[data-product-open]");
        if (!open) return;
        const card = open.closest("[data-product-id]");
        const id = card?.getAttribute("data-product-id");
        if (!id || !byId[id]) return;
        activeId = id;
        grid.querySelectorAll(".product-card--apparel").forEach((el) => {
          el.classList.toggle("is-active", el.getAttribute("data-product-id") === id);
        });
        setViewer(byId[id], "hero");
      });

      viewer?.addEventListener("click", (event) => {
        const thumb = event.target.closest("[data-shot]");
        if (!thumb || !activeId) return;
        setViewer(byId[activeId], thumb.getAttribute("data-shot"));
      });
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<p class="body-copy">Apparel catalog failed to load. Refresh and try again.</p>`;
    }
  }

  boot();
})();
