/* Kisala Films — 3D scene bootstrap.
   Feature-detects WebGL + reduced-motion, then lazy-loads the globe / tape
   modules. Falls back to the static CSS crate / grid when 3D is unavailable. */

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch (_) {
    return false;
  }
}

function showToast(msg) {
  let t = document.querySelector("[data-toast]");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("data-toast", "");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => t.classList.remove("show"), 2600);
}

function playFilm(film) {
  const title = `${film.label}: ${film.title}`;
  if (film.vimeo && window.KisalaLightbox) {
    window.KisalaLightbox.open({ vimeo: film.vimeo, title });
  } else {
    showToast(`${film.title} — TAPE NOT UPLOADED YET`);
  }
}

async function loadFilms() {
  const res = await fetch("/data/films.json", { cache: "no-cache" });
  const data = await res.json();
  const catMap = Object.fromEntries((data.categories || []).map((c) => [c.id, c.label]));
  const films = (data.films || []).map((f) => ({ ...f, categoryLabel: catMap[f.category] || "" }));
  return { films, categories: data.categories || [] };
}

/* —— Home: globe + hero tape —— */
async function initHome(root, films) {
  const globeEl = root.querySelector("[data-globe-scene]");
  const tapeEl = root.querySelector("[data-tape-scene]");
  const detailEl = root.querySelector("[data-globe-detail]");
  if (!globeEl) return;

  const [{ createGlobe }, { createTapeStage }] = await Promise.all([
    import("/js/globe.js"),
    import("/js/tape3d.js"),
  ]);

  root.classList.add("is-live");
  const tape = tapeEl ? createTapeStage({ container: tapeEl, onPlay: playFilm }) : null;

  function renderDetail(film) {
    if (!detailEl) return;
    const note = film.vimeo
      ? `<button type="button" class="cta-primary" data-play>PLAY THIS TAPE <span>&#8599;</span></button>`
      : `<span class="placeholder-note">TAPE NOT UPLOADED YET — LIGHTBOX WIRES WHEN A VIMEO ID IS SET.</span>`;
    detailEl.innerHTML = `
      <span class="globe-detail-cat">${film.categoryLabel || ""}</span>
      <h3>${film.title}</h3>
      <p class="globe-detail-loc">&#9679; ${film.city || ""}${film.country ? ", " + film.country : ""} &middot; ${film.code}</p>
      <p class="globe-detail-blurb">${film.blurb || ""}</p>
      <div class="globe-detail-cta">${note}</div>
    `;
    detailEl.dataset.filmId = film.id || "";
    detailEl.classList.remove("is-fresh");
    void detailEl.offsetWidth;
    detailEl.classList.add("is-fresh");
    const btn = detailEl.querySelector("[data-play]");
    if (btn) btn.addEventListener("click", () => playFilm(film));
  }

  function selectFilm(film) {
    if (!film) return;
    if (tape) tape.setTape(film);
    renderDetail(film);
    globe.focusFilm(film);
  }

  const globe = createGlobe({
    container: globeEl,
    films,
    onSelect: selectFilm,
  });

  const featured = films.find((f) => f.vimeo) || films[0];
  if (featured) {
    if (tape) tape.setTape(featured);
    renderDetail(featured);
  }
}

/* —— About: journey globe (pins = journal entries) —— */
const MEDIA_LABEL = { video: "VIDEO", audio: "AUDIO", mixed: "MIXED MEDIA" };
const ABOUT_TONES = ["cream", "lime", "orange", "red", "blue"];

async function loadJournal() {
  const res = await fetch("/data/journal.json", { cache: "no-cache" });
  const data = await res.json();
  return (data.entries || []).map((e, i) => ({
    id: e.slug,
    slug: e.slug,
    lat: e.lat,
    lng: e.lng,
    tone: ABOUT_TONES[i % ABOUT_TONES.length],
    title: e.title,
    place: e.place || "",
    date: e.date || "",
    media: e.media || "mixed",
    blurb: ((e.blocks || []).find((b) => b.type === "text") || {}).value || "",
  }));
}

async function initAbout(root) {
  const globeEl = root.querySelector("[data-globe-scene]");
  const detailEl = root.querySelector("[data-globe-detail]");
  const listEl = root.querySelector("[data-globe-list]");
  if (!globeEl) return;

  const entries = await loadJournal();
  if (!entries.length) return;

  /* Always fill the fallback list so it works with or without WebGL. */
  if (listEl) {
    listEl.innerHTML = entries
      .map(
        (e) =>
          `<li><a href="/journal.html?e=${e.slug}"><b>${e.title}</b><span>${e.place}${
            e.date ? " &middot; " + e.date : ""
          }</span></a></li>`
      )
      .join("");
  }

  const { createGlobe } = await import("/js/globe.js");
  root.classList.add("is-live");

  function renderDetail(film) {
    if (!detailEl) return;
    detailEl.innerHTML = `
      <span class="globe-detail-cat">${MEDIA_LABEL[film.media] || "ENTRY"}</span>
      <h3>${film.title}</h3>
      <p class="globe-detail-loc">&#9679; ${film.place}${film.date ? " &middot; " + film.date : ""}</p>
      <p class="globe-detail-blurb">${film.blurb || ""}</p>
      <div class="globe-detail-cta"><a class="cta-primary" href="/journal.html?e=${film.slug}">OPEN ENTRY <span>&#8599;</span></a></div>
    `;
    detailEl.dataset.filmId = film.id || film.slug || "";
    detailEl.classList.remove("is-fresh");
    void detailEl.offsetWidth;
    detailEl.classList.add("is-fresh");
  }

  const globe = createGlobe({
    container: globeEl,
    films: entries,
    onSelect: (film) => {
      if (!film) return;
      renderDetail(film);
      globe.focusFilm(film);
    },
  });

  renderDetail(entries[0]);

  /* Publish for timeline.js so scrolling the tape log spins the globe. */
  window.KisalaAboutGlobe = globe;
  window.dispatchEvent(new CustomEvent("kisala:about-globe-ready", { detail: globe }));
}

/* —— Watch: dual-layer backdrop for tape wall —— */
function createWallBackdrop(root, films) {
  const bg = root.querySelector("[data-tape-wall-bg]");
  if (!bg) {
    return { set: () => {} };
  }

  let front = bg.querySelector(".tape-wall-bg__layer.is-front");
  let back = bg.querySelector(".tape-wall-bg__layer.is-back");
  if (!front || !back) {
    return { set: () => {} };
  }

  const cache = new Map();
  let currentUrl = "";
  let swapping = false;

  function preload(url) {
    if (!url || cache.has(url)) return cache.get(url) || Promise.resolve();
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = url;
    });
    cache.set(url, p);
    return p;
  }

  films.forEach((f) => {
    if (f.thumb) preload(f.thumb);
  });

  async function set(url) {
    if (!url || url === currentUrl) return;
    await preload(url);
    if (url === currentUrl) return;

    if (swapping) {
      front.style.backgroundImage = `url("${url}")`;
      currentUrl = url;
      return;
    }

    swapping = true;
    back.style.backgroundImage = `url("${url}")`;
    // Force layout so the incoming layer paints before the opacity swap
    void back.offsetWidth;
    front.classList.remove("is-front");
    front.classList.add("is-back");
    back.classList.remove("is-back");
    back.classList.add("is-front");
    const prev = front;
    front = back;
    back = prev;
    currentUrl = url;

    const done = () => {
      swapping = false;
      front.removeEventListener("transitionend", done);
    };
    front.addEventListener("transitionend", done);
    window.setTimeout(done, 600);
  }

  return { set };
}

/* —— Watch: 2D tape shelf (slider mobile / grid desktop) —— */
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initTapeShelf(root, films) {
  const track = root.querySelector("[data-tape-shelf-track]");
  if (!track || !films.length) return;

  const backdrop = createWallBackdrop(root, films);
  let activeFilter = "all";
  let activeId = films.find((f) => f.vimeo)?.id || films[0].id;

  function cardHtml(film) {
    const title = escapeHtml(film.title);
    const short = escapeHtml(film.short || film.label || film.title);
    const code = escapeHtml(film.code || "");
    const cat = escapeHtml(film.categoryLabel || film.category || "");
    const tone = escapeHtml(film.tone || "cream");
    const thumb = escapeHtml(film.thumb || "");
    const playAttrs = film.vimeo
      ? `href="#" data-lightbox-open data-vimeo="${escapeHtml(film.vimeo)}" data-title="${escapeHtml(film.label)}: ${title}"`
      : `href="#" data-shelf-placeholder aria-disabled="true"`;

    return `
      <article
        class="shelf-tape ${tone}"
        role="listitem"
        data-shelf-card
        data-film-id="${escapeHtml(film.id)}"
        data-category="${escapeHtml(film.category)}"
      >
        <div class="shelf-tape-shell" aria-hidden="true">
          <div class="shelf-tape-window">
            ${thumb ? `<img src="${thumb}" alt="" loading="lazy" width="320" height="180">` : ""}
          </div>
          <div class="shelf-tape-label">
            <small>${cat}</small>
            <strong>${short}</strong>
            <span>${code}</span>
          </div>
        </div>
        <a class="shelf-tape-link" ${playAttrs} aria-label="${film.vimeo ? "Play" : "Unavailable"} ${title}"></a>
      </article>
    `;
  }

  track.innerHTML = films.map(cardHtml).join("");

  function cards() {
    return [...track.querySelectorAll("[data-shelf-card]")];
  }

  function setActive(film) {
    if (!film) return;
    activeId = film.id;
    cards().forEach((card) => {
      card.classList.toggle("is-active", card.getAttribute("data-film-id") === activeId);
    });
    if (film.thumb) backdrop.set(film.thumb);
  }

  function applyFilter(categoryId) {
    activeFilter = categoryId || "all";
    const visible = [];
    cards().forEach((card) => {
      const match =
        activeFilter === "all" || card.getAttribute("data-category") === activeFilter;
      card.hidden = !match;
      card.classList.toggle("is-filtered-out", !match);
      if (match) visible.push(card);
    });

    const activeCard = visible.find((c) => c.getAttribute("data-film-id") === activeId);
    const nextCard = activeCard || visible[0];
    const nextFilm = nextCard
      ? films.find((f) => f.id === nextCard.getAttribute("data-film-id"))
      : null;
    if (nextFilm) setActive(nextFilm);

    track.scrollTo({ left: 0, behavior: "smooth" });
  }

  root.querySelectorAll("[data-wall-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-wall-filter") || "all";
      applyFilter(cat);
      root.querySelectorAll("[data-wall-filter]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  track.addEventListener("pointerover", (e) => {
    const card = e.target.closest("[data-shelf-card]");
    if (!card || card.hidden) return;
    const film = films.find((f) => f.id === card.getAttribute("data-film-id"));
    if (film) setActive(film);
  });

  track.addEventListener("focusin", (e) => {
    const card = e.target.closest("[data-shelf-card]");
    if (!card || card.hidden) return;
    const film = films.find((f) => f.id === card.getAttribute("data-film-id"));
    if (film) setActive(film);
  });

  track.addEventListener("click", (e) => {
    const placeholder = e.target.closest("[data-shelf-placeholder]");
    if (placeholder) {
      e.preventDefault();
      showToast("TAPE NOT UPLOADED YET");
      return;
    }
    const card = e.target.closest("[data-shelf-card]");
    if (!card || card.hidden) return;
    const film = films.find((f) => f.id === card.getAttribute("data-film-id"));
    if (film) setActive(film);
  });

  const prevBtn = root.querySelector("[data-shelf-prev]");
  const nextBtn = root.querySelector("[data-shelf-next]");
  const scrollByCard = (dir) => {
    const card = track.querySelector("[data-shelf-card]:not([hidden])");
    const amount = card ? card.getBoundingClientRect().width + 14 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * amount, behavior: "smooth" });
  };
  if (prevBtn) prevBtn.addEventListener("click", () => scrollByCard(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => scrollByCard(1));

  const featured = films.find((f) => f.id === activeId) || films[0];
  setActive(featured);
  applyFilter("all");
}

async function boot() {
  const home = document.querySelector("[data-home-scene]");
  const wall = document.querySelector("[data-watch-scene]");
  const about = document.querySelector("[data-about-scene]");
  if (!home && !wall && !about) return;

  /* Watch shelf is CSS/HTML — always boot it, even without WebGL. */
  if (wall) {
    try {
      const { films } = await loadFilms();
      initTapeShelf(wall, films);
    } catch (err) {
      console.error("[Kisala] watch shelf failed", err);
    }
  }

  if (!webglSupported() || prefersReduced) {
    document.body.classList.add("no-3d");
    if (about) {
      try {
        const entries = await loadJournal();
        const listEl = about.querySelector("[data-globe-list]");
        if (listEl && entries.length) {
          listEl.innerHTML = entries
            .map(
              (e) =>
                `<li><a href="/journal.html?e=${e.slug}"><b>${e.title}</b><span>${e.place}${
                  e.date ? " &middot; " + e.date : ""
                }</span></a></li>`
            )
            .join("");
        }
      } catch (_) {}
    }
    return;
  }

  try {
    if (home) {
      const { films } = await loadFilms();
      await initHome(home, films);
    }
    if (about) await initAbout(about);
  } catch (err) {
    console.error("[Kisala 3D] boot failed, using fallback", err);
    document.body.classList.add("no-3d");
  }
}

boot();
