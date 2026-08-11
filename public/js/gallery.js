/**
 * Gallery page: photo/video lightbox.
 * Filtering itself is handled by the shared [data-filter-tabs] logic in site.js;
 * this module reacts to it for the empty-state note and lightbox ordering.
 */
(() => {
  /* ---- Lightbox --------------------------------------------------------- */
  const modal = document.querySelector("[data-lightbox-modal]");
  const grid = document.querySelector("[data-gallery-grid]");
  if (!modal || !grid) return;

  const stage = modal.querySelector("[data-lb-stage]");
  const caption = modal.querySelector("[data-lb-caption]");
  const metaOut = modal.querySelector("[data-lb-meta]");
  const btnClose = modal.querySelector("[data-lb-close]");
  const btnPrev = modal.querySelector("[data-lb-prev]");
  const btnNext = modal.querySelector("[data-lb-next]");
  const emptyNote = document.querySelector("[data-gallery-empty]");
  const tabs = document.querySelector("[data-filter-tabs]");

  let current = -1;
  let lastFocus = null;

  const visibleItems = () =>
    Array.from(grid.querySelectorAll(".masonry-item")).filter((el) => !el.hidden);

  /**
   * Case-study rows, in the order a rider would ask about them. Every field is
   * optional: a tile shows only what is actually recorded about it, because an
   * absent row reads better than an invented one.
   */
  const META_ROWS = [
    ["bike", "Bike"],
    ["service", "Service"],
    ["film", "Film"],
    ["coverage", "Coverage"],
    ["turnaround", "Time in the garage"],
    ["city", "Where"],
    ["runtime", "Runtime"],
    ["filmed", "On camera"],
  ];

  function renderMeta(item) {
    if (!metaOut) return;
    metaOut.innerHTML = "";

    const rows = META_ROWS.map(([key, label]) => [label, (item.dataset[key] || "").trim()]).filter(
      ([, value]) => value
    );

    metaOut.hidden = rows.length === 0;
    if (!rows.length) return;

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "lb-meta-row";

      const dt = document.createElement("span");
      dt.className = "lb-meta-label";
      dt.textContent = label;

      const dd = document.createElement("strong");
      dd.className = "lb-meta-value";
      dd.textContent = value;

      row.append(dt, dd);
      metaOut.appendChild(row);
    });
  }

  function clearStage() {
    const video = stage.querySelector("video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    // Blanking the iframe first stops audio from a Vimeo/YouTube player that
    // would otherwise keep running while the node is torn down.
    const frame = stage.querySelector("iframe");
    if (frame) frame.src = "about:blank";
    stage.innerHTML = "";
  }

  function render(item) {
    clearStage();
    const type = item.getAttribute("data-type");
    const cap = item.getAttribute("data-caption") || "";

    if (type === "embed") {
      // Vimeo / YouTube — nothing is self-hosted, so the player comes to us.
      const frame = document.createElement("iframe");
      frame.className = "lb-media lb-embed";
      frame.src = item.getAttribute("data-embed") || "";
      frame.title = cap || "Film";
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("frameborder", "0");
      stage.appendChild(frame);
    } else if (type === "video") {
      const src = item.getAttribute("data-video");
      const poster = item.getAttribute("data-full") || "";
      const video = document.createElement("video");
      video.className = "lb-media";
      video.setAttribute("controls", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("autoplay", "");
      if (poster) video.setAttribute("poster", poster);
      if (src) {
        const source = document.createElement("source");
        source.src = src;
        source.type = "video/mp4";
        video.appendChild(source);
      }
      stage.appendChild(video);
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    } else {
      const src = item.getAttribute("data-full") || item.querySelector("img").src;
      const img = document.createElement("img");
      img.className = "lb-media";
      img.src = src;
      img.alt = cap;
      stage.appendChild(img);
    }
    caption.textContent = cap;
    renderMeta(item);
  }

  function open(index) {
    const items = visibleItems();
    if (!items.length) return;
    current = (index + items.length) % items.length;
    render(items[current]);
    modal.hidden = false;
    document.body.classList.add("lb-lock");
    lastFocus = document.activeElement;
    btnClose.focus();
    updateNav(items.length);
  }

  function updateNav(count) {
    const multi = count > 1;
    btnPrev.hidden = !multi;
    btnNext.hidden = !multi;
  }

  function close() {
    clearStage();
    modal.hidden = true;
    document.body.classList.remove("lb-lock");
    current = -1;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function step(dir) {
    const items = visibleItems();
    if (!items.length) return;
    current = (current + dir + items.length) % items.length;
    render(items[current]);
  }

  grid.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-lightbox]");
    if (!trigger) return;
    const item = trigger.closest(".masonry-item");
    if (!item) return;
    const items = visibleItems();
    const idx = items.indexOf(item);
    if (idx >= 0) open(idx);
  });

  btnClose.addEventListener("click", close);
  btnPrev.addEventListener("click", () => step(-1));
  btnNext.addEventListener("click", () => step(1));

  modal.addEventListener("click", (e) => {
    // Click on the backdrop (not the media, caption, or buttons) closes
    if (e.target === modal || e.target === stage) close();
  });

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, video[controls], iframe, [tabindex]:not([tabindex="-1"])';

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;

    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowLeft") {
      step(-1);
      return;
    }
    if (e.key === "ArrowRight") {
      step(1);
      return;
    }

    // The viewer covers the page, so Tab has to stay inside it — otherwise
    // focus walks off into a grid the user cannot see.
    if (e.key !== "Tab") return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.hidden && el.offsetParent !== null
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---- Empty-state note (reacts to site.js filtering) ------------------- */
  function syncEmpty() {
    if (!emptyNote) return;
    emptyNote.hidden = visibleItems().length > 0;
  }
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      if (e.target.closest("button")) {
        // Let site.js apply hidden first
        setTimeout(syncEmpty, 0);
      }
    });
  }
  syncEmpty();

  /* ---- OG aspect ratios for mosaic tiles --------------------------------
   * Photo tiles size to the still’s intrinsic ratio. Reel / portrait / wide
   * modifiers keep the authored frame (9:16, 2:3, 16:9) so vertical films
   * stay vertical even when the poster thumb is landscape.
   */
  function applyOgAspect(item) {
    if (
      item.classList.contains("masonry-item--reel") ||
      item.classList.contains("masonry-item--portrait") ||
      item.classList.contains("masonry-item--wide")
    ) {
      return;
    }
    const img = item.querySelector(".tile img");
    const tile = item.querySelector(".tile");
    if (!img || !tile || !img.naturalWidth || !img.naturalHeight) return;
    tile.style.setProperty("--ar", `${img.naturalWidth} / ${img.naturalHeight}`);
  }

  grid.querySelectorAll(".masonry-item").forEach((item) => {
    const img = item.querySelector(".tile img");
    if (!img) return;
    if (img.complete) applyOgAspect(item);
    else img.addEventListener("load", () => applyOgAspect(item), { once: true });
  });

  /* ---- Hide filters with nothing behind them -----------------------------
   * The markup lists every category the garage offers, including ones it has
   * not shot yet, so a first helmet build lights up its filter without anyone
   * editing this page. Until then the button would only lead to an empty grid,
   * so it is removed rather than shown and disabled — a category that isn't
   * there reads better than one that is there and does nothing.
   */
  if (tabs) {
    const all = Array.from(grid.querySelectorAll(".masonry-item"));
    tabs.querySelectorAll("button[data-filter]").forEach((btn) => {
      const key = btn.getAttribute("data-filter");
      if (key === "all") return;
      const has = all.some((item) =>
        (item.getAttribute("data-filter-item") || "").split(/\s+/).includes(key)
      );
      if (!has) btn.remove();
    });
  }
})();
