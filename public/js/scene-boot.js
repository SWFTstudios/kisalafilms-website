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
    const btn = detailEl.querySelector("[data-play]");
    if (btn) btn.addEventListener("click", () => playFilm(film));
  }

  function selectFilm(film) {
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
  }

  const globe = createGlobe({
    container: globeEl,
    films: entries,
    onSelect: (film) => {
      renderDetail(film);
      globe.focusFilm(film);
    },
  });

  renderDetail(entries[0]);

  /* Publish for timeline.js so scrolling the tape log spins the globe. */
  window.KisalaAboutGlobe = globe;
  window.dispatchEvent(new CustomEvent("kisala:about-globe-ready", { detail: globe }));
}

/* —— Watch: 3D tape wall —— */
async function initWall(root, films, categories) {
  const wallEl = root.querySelector("[data-tape-wall]");
  if (!wallEl) return;

  const { createTapeWall } = await import("/js/tape3d.js");
  root.classList.add("is-live");

  const wall = createTapeWall({ container: wallEl, films, onPlay: playFilm });

  root.querySelectorAll("[data-wall-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-wall-filter");
      wall.filter(cat);
      root.querySelectorAll("[data-wall-filter]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
}

async function boot() {
  const home = document.querySelector("[data-home-scene]");
  const wall = document.querySelector("[data-watch-scene]");
  const about = document.querySelector("[data-about-scene]");
  if (!home && !wall && !about) return;

  if (!webglSupported() || prefersReduced) {
    document.body.classList.add("no-3d");
    // Still populate the About fallback list from journal data.
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
    if (home || wall) {
      const { films, categories } = await loadFilms();
      if (home) await initHome(home, films);
      if (wall) await initWall(wall, films, categories);
    }
    if (about) await initAbout(about);
  } catch (err) {
    console.error("[Kisala 3D] boot failed, using fallback", err);
    document.body.classList.add("no-3d");
  }
}

boot();
