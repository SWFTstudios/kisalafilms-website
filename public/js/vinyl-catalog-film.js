/**
 * Film detail — JSON-first from /data/vinyl-colors.json.
 */
(() => {
  const root = document.querySelector("[data-film-root]");
  if (!root || !window.KisalaVinylCatalog) return;

  const params = new URLSearchParams(window.location.search);
  const handle = (params.get("h") || params.get("handle") || "").trim();

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const notFound = (msg) => {
    root.innerHTML = `
      <div class="kf-film-empty">
        <h1>Film not found</h1>
        <p class="p-lg">${escapeHtml(msg)}</p>
        <div class="btn-row">
          <a class="btn btn-ghost" href="/vinyl-catalog">Back to catalog</a>
        </div>
      </div>
    `;
    document.title = "Film not found | Kisala Films";
  };

  if (!handle) {
    notFound(
      "Add a film handle to the URL, e.g. /vinyl-catalog/film?h=3m-2080-gloss-black-vinyl-wrap-g12"
    );
    return;
  }

  window.KisalaVinylCatalog.loadFilm(handle)
    .then((data) => {
      const film = data.film;
      if (!film) {
        notFound(`No film matches handle “${handle}”.`);
        return;
      }

      const name = film.name || "Untitled";
      const brand = film.brand || "";
      const finish = film.finish || "";
      const sku = film.sku || "";
      const inStock = !!film.in_stock;
      const image = film.image_url || "";
      const description = film.description || "";
      const installNotes = film.install_notes || "";
      const recommended = film.recommended_for || "";
      const notes = film.notes || "";
      const sell = film.sell_price_usd;
      const sellLabel =
        sell !== null && sell !== undefined && Number.isFinite(Number(sell))
          ? `$${Number(sell).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : "";

      document.title = `${name} | Kisala Films`;
      const descEl = document.querySelector('meta[name="description"]');
      if (descEl) {
        descEl.setAttribute(
          "content",
          `${name} — ${[brand, finish].filter(Boolean).join(" · ")}. Vinyl catalog · Kisala Films.`
        );
      }

      const projectHref = `/project?film=${encodeURIComponent(film.handle)}`;
      const wrapHref = `/wrap-studio?finish=${encodeURIComponent(finish)}&film=${encodeURIComponent(
        film.handle
      )}`;
      const metroHref =
        film.metro_url || `https://metrorestyling.com/products/${encodeURIComponent(film.handle)}`;

      const blocks = [];
      if (description) {
        blocks.push(
          `<div class="kf-film-block"><h2 class="h5">About this film</h2><p class="p">${escapeHtml(
            description
          )}</p></div>`
        );
      }
      if (installNotes) {
        blocks.push(
          `<div class="kf-film-block"><h2 class="h5">Install notes</h2><p class="p">${escapeHtml(
            installNotes
          )}</p></div>`
        );
      }
      if (recommended) {
        blocks.push(
          `<div class="kf-film-block"><h2 class="h5">Recommended for</h2><p class="p">${escapeHtml(
            recommended
          )}</p></div>`
        );
      }
      if (notes) {
        blocks.push(
          `<div class="kf-film-block"><h2 class="h5">Notes</h2><p class="p">${escapeHtml(
            notes
          )}</p></div>`
        );
      }
      if (!blocks.length) {
        blocks.push(
          `<div class="kf-film-block"><p class="p">Garage notes for this colour are empty. Add copy in <code>doc/spreadsheets/vinyl-products.csv</code> when you want them on the page.</p></div>`
        );
      }

      const priceBlock = sellLabel
        ? `<p class="kf-roll-price-lg">Roll · <strong>${escapeHtml(
            sellLabel
          )}</strong> <span class="kf-film-stock-src">Metro cost + 40%</span></p>`
        : `<p class="p">Roll price is quoted in project checkout when Metro prices are synced.</p>`;

      root.innerHTML = `
        <div class="kf-film-layout">
          <div class="kf-film-media">
            ${
              image
                ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(
                    name
                  )}" width="900" height="900" fetchpriority="high">`
                : ""
            }
          </div>
          <div class="kf-film-copy">
            <p class="eyebrow">${escapeHtml(film.product_type || "Vinyl film")}</p>
            <h1>${escapeHtml(name)}</h1>
            <p class="p-lg">${escapeHtml([brand, finish, sku].filter(Boolean).join(" · "))}</p>
            <p><span class="kf-avail ${inStock ? "kf-avail--in" : "kf-avail--out"}">${
              inStock ? "In stock" : "Out of stock"
            }</span></p>
            ${priceBlock}
            ${blocks.join("")}
            <div class="btn-row">
              <a class="btn btn-primary" href="${escapeHtml(
                projectHref
              )}" data-track="cta_click" data-track-label="film-to-project">Start project</a>
              <a class="btn btn-ghost" href="${escapeHtml(
                wrapHref
              )}" data-track="cta_click" data-track-label="film-to-wrap-studio">Wrap Studio quote</a>
              <a class="btn btn-ghost" href="/vinyl-catalog">All films</a>
              <a class="btn btn-ghost" href="${escapeHtml(
                metroHref
              )}" rel="noopener" target="_blank">Metro product</a>
            </div>
          </div>
        </div>
      `;

      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    })
    .catch((err) => {
      console.error(err);
      if (err && err.code === 404) {
        notFound(`No film matches handle “${handle}” in the Metro catalogue.`);
        return;
      }
      notFound("Could not load the vinyl catalogue. Refresh and try again.");
    });
})();
