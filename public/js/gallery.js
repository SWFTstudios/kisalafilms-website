/**
 * Gallery page: one-time intro animation + photo/video lightbox.
 * Filtering itself is handled by the shared [data-filter-tabs] logic in site.js;
 * this module reacts to it for the empty-state note and lightbox ordering.
 */
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Intro overlay ---------------------------------------------------- */
  (function intro() {
    const overlay = document.querySelector("[data-gallery-intro]");
    if (!overlay) return;

    let seen = false;
    try {
      seen = sessionStorage.getItem("kfilms-intro") === "1";
    } catch (_) {
      /* private mode — treat as unseen */
    }

    const finish = () => {
      overlay.remove();
      document.body.classList.remove("intro-lock");
      try {
        sessionStorage.setItem("kfilms-intro", "1");
      } catch (_) {
        /* ignore */
      }
    };

    if (reduceMotion || seen) {
      overlay.remove();
      return;
    }

    document.body.classList.add("intro-lock");
    overlay.addEventListener("animationend", (e) => {
      if (e.animationName === "introOut") finish();
    });
    // Safety net if animationend never fires
    setTimeout(finish, 3200);
  })();

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

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
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
})();
