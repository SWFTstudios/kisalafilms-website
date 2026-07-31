/**
 * Simple colour grid — load vinyl-colors.json, show cards. That’s it.
 */
(() => {
  const grid = document.querySelector("[data-catalog-grid]");
  const meta = document.querySelector("[data-catalog-meta]");
  const search = document.querySelector("[data-catalog-search]");
  if (!grid) return;

  let rows = [];
  let query = "";

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
      image_url: c.i || "",
      in_stock: !!c.a,
    };
  }

  function filtered() {
    const q = query;
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.brand, r.finish, r.handle].join(" ").toLowerCase().includes(q)
    );
  }

  function render() {
    const list = filtered();
    if (meta) meta.textContent = list.length + " colours";
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = '<p class="gallery-empty">No colours match. Clear search.</p>';
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

  if (meta) meta.textContent = "Loading…";
  fetch("/data/vinyl-colors.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      rows = (Array.isArray(data.colors) ? data.colors : [])
        .map(mapColor)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
      render();
    })
    .catch((err) => {
      console.error(err);
      if (meta) meta.textContent = "Could not load colours";
      grid.innerHTML = '<p class="gallery-empty">Could not load the colour catalogue.</p>';
    });
})();
