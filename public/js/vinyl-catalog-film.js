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
        <h1>Colour not found</h1>
        <p class="p-lg">${escapeHtml(msg)}</p>
        <div class="btn-row">
          <a class="btn btn-ghost" href="/vinyl-catalog">Back to catalog</a>
        </div>
      </div>
    `;
    document.title = "Colour not found | Kisala Films";
  };

  if (!handle) {
    notFound("Pick a colour from the catalog to open its page.");
    return;
  }

  window.KisalaVinylCatalog.loadFilm(handle)
    .then((data) => {
      const film = data.film;
      if (!film) {
        notFound("That colour isn’t in the catalog.");
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
          `<div class="kf-film-block"><p class="p">More notes for this colour coming soon.</p></div>`
        );
      }

      const priceBlock = sellLabel
        ? `<p class="kf-roll-price-lg">From <strong>${escapeHtml(sellLabel)}</strong> / roll</p>`
        : `<p class="p">Roll price is confirmed when you review your build.</p>`;

      const inBuild = !!window.KisalaVinylBuild?.has(film.handle);

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
            <p class="kf-build-toast" data-build-toast hidden role="status"></p>
            <div class="btn-row">
              <button type="button" class="btn btn-primary" data-add-to-build data-track="cta_click" data-track-label="film-add-to-build">
                ${inBuild ? "Added to build" : "Add to build"}
              </button>
              <a class="btn btn-ghost" href="/project" data-track="cta_click" data-track-label="film-to-project">View build</a>
              <a class="btn btn-ghost" href="/vinyl-catalog">All colours</a>
              <a class="btn btn-ghost" href="${escapeHtml(
                metroHref
              )}" rel="noopener" target="_blank">Supplier page</a>
            </div>
          </div>
        </div>
      `;

      const addBtn = root.querySelector("[data-add-to-build]");
      const toast = root.querySelector("[data-build-toast]");
      addBtn?.addEventListener("click", () => {
        if (!window.KisalaVinylBuild) return;
        window.KisalaVinylBuild.add({
          handle: film.handle,
          name: film.name,
          brand: film.brand,
          finish: film.finish,
          sku: film.sku,
          image_url: film.image_url,
          color_family: film.color_family,
        });
        addBtn.textContent = "Added to build";
        if (toast) {
          toast.hidden = false;
          toast.innerHTML = `In your build. <a href="/project">Open build</a> to add notes and photos, or keep browsing.`;
        }
        window.KisalaTrack?.("vinyl_add_to_build", { label: film.handle });
      });

      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    })
    .catch((err) => {
      console.error(err);
      if (err && err.code === 404) {
        notFound("That colour isn’t in the catalog.");
        return;
      }
      notFound("Could not load the colour catalog. Refresh and try again.");
    });
})();
