(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* —— Live clock —— */
  const clocks = document.querySelectorAll("[data-live-clock]");
  if (clocks.length) {
    const tick = () => {
      const t = new Date().toLocaleTimeString("en-US", { hour12: false });
      clocks.forEach((el) => {
        el.textContent = t;
      });
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* —— Series / film tape data (fallback CSS crate; 3D scene uses /data/films.json) —— */
  const SERIES = [
    {
      id: "lost-tapes-v1",
      code: "LT-001",
      label: "LOST TAPES",
      short: "LOST TAPES",
      title: "L0ST TAPES V1",
      time: "12:04",
      tone: "lime",
      format: "1080P / RAW",
      blurb: "Raw nights, old cameras, experiments — a life vlog shot on the camcorder in Los Angeles.",
      vimeo: "1066971784",
      thumb: "/images/thumb-lost-tapes.jpg",
    },
    {
      id: "andy-q50",
      code: "AM-002",
      label: "ANDY Q50",
      short: "ANDY Q50",
      title: "ANDY Q50",
      time: "02:15",
      tone: "red",
      format: "1080P / DIGI",
      blurb: "An automotive magazine cut — Andy and the Infiniti Q50, framed for the crate.",
      vimeo: "1174158034?h=c80e23ac22",
      thumb: "/images/thumb-andy-q50.jpg",
    },
    {
      id: "own-machine",
      code: "AM-001",
      label: "OWN MACHINE",
      short: "OWN MACHINE",
      title: "OWN MACHINE",
      time: "08:41",
      tone: "red",
      format: "HI8 / DIGI",
      blurb: "An automotive video magazine issue from Tokyo — a build, a driver, and the streets that made it.",
      /* PLACEHOLDER: no Vimeo yet */
      vimeo: null,
      thumb: "/images/thumb-f4i-reveal.jpg",
    },
    {
      id: "night-run",
      code: "TR-012",
      label: "NIGHT RUN",
      short: "NIGHT RUN",
      title: "NIGHT RUN",
      time: "06:18",
      tone: "orange",
      format: "HELMET CAM",
      blurb: "Cinematic travel through Lisbon after dark — coast roads, exits missed on purpose.",
      /* PLACEHOLDER: no Vimeo yet */
      vimeo: null,
      thumb: "/images/thumb-night-pov.jpg",
    },
    {
      id: "shop-talk",
      code: "BR-007",
      label: "SHOP TALK",
      short: "SHOP TALK",
      title: "SHOP TALK",
      time: "03:52",
      tone: "blue",
      format: "STEREO",
      blurb: "A cinematic brand edit from London built around a conversation with the makers.",
      /* PLACEHOLDER: no Vimeo yet */
      vimeo: null,
      thumb: "/images/thumb-customer-interview.jpg",
    },
    {
      id: "between-places",
      code: "TR-003",
      label: "BETWEEN PLACES",
      short: "BETWEEN",
      title: "BETWEEN PLACES",
      time: "09:27",
      tone: "cream",
      format: "HOME VIDEO",
      blurb: "Intimate cinematic travel from Nairobi — people, light, and the road between places.",
      /* PLACEHOLDER: no Vimeo yet */
      vimeo: null,
      thumb: "/images/story-elombe-workshop.jpg",
    },
  ];

  window.KISALA_SERIES = SERIES;

  const VIMEO_PLAYER = "https://player.vimeo.com/video/";

  function vimeoEmbedUrl(id, { background = false } = {}) {
    /* Support plain ids and privacy-hash forms: "123" or "123?h=abc" */
    const raw = String(id || "");
    const join = raw.includes("?") ? "&" : "?";
    if (background) {
      return `${VIMEO_PLAYER}${raw}${join}background=1&autoplay=1&muted=1&loop=1&autopause=0&badge=0&player_id=0&app_id=58479`;
    }
    return `${VIMEO_PLAYER}${raw}${join}badge=0&autopause=0&autoplay=1&player_id=0&app_id=58479`;
  }

  /* —— Lightbox —— */
  function ensureLightbox() {
    let box = document.querySelector("[data-film-lightbox]");
    if (box) return box;

    box = document.createElement("dialog");
    box.className = "film-lightbox";
    box.setAttribute("data-film-lightbox", "");
    box.setAttribute("aria-label", "Film player");
    box.innerHTML = `
      <div class="film-lightbox-inner">
        <button type="button" class="film-lightbox-close" data-lightbox-close aria-label="Close film">CLOSE ✕</button>
        <div class="film-lightbox-frame" data-lightbox-frame></div>
        <p class="film-lightbox-title" data-lightbox-title></p>
      </div>
    `;
    document.body.appendChild(box);

    const close = () => closeLightbox();
    box.querySelector("[data-lightbox-close]")?.addEventListener("click", close);
    box.addEventListener("click", (e) => {
      if (e.target === box) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && box.classList.contains("is-open")) close();
    });

    return box;
  }

  function openLightbox({ vimeo, title }) {
    if (!vimeo) return;
    const box = ensureLightbox();
    const frame = box.querySelector("[data-lightbox-frame]");
    const titleEl = box.querySelector("[data-lightbox-title]");
    if (frame) {
      frame.innerHTML = `<iframe src="${vimeoEmbedUrl(vimeo)}" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${title || "Kisala Films"}"></iframe>`;
    }
    if (titleEl) titleEl.textContent = title || "";
    if (typeof box.showModal === "function") {
      try {
        box.showModal();
      } catch (_) {
        box.setAttribute("open", "");
      }
    } else {
      box.setAttribute("open", "");
    }
    box.classList.add("is-open");
    document.body.classList.add("lightbox-lock");
  }

  function closeLightbox() {
    const box = document.querySelector("[data-film-lightbox]");
    if (!box) return;
    const frame = box.querySelector("[data-lightbox-frame]");
    if (frame) frame.innerHTML = "";
    box.classList.remove("is-open");
    document.body.classList.remove("lightbox-lock");
    if (typeof box.close === "function" && box.open) {
      try {
        box.close();
      } catch (_) {
        box.removeAttribute("open");
      }
    } else {
      box.removeAttribute("open");
    }
  }

  window.KisalaLightbox = { open: openLightbox, close: closeLightbox };

  function initTapeSlider(root) {
    if (!root) return;

    const track = root.querySelector("[data-tape-track]");
    const indexEl = root.querySelector("[data-tape-index]");
    const detailEl = root.querySelector("[data-tape-detail]");
    const prevBtn = root.querySelector("[data-tape-prev]");
    const nextBtn = root.querySelector("[data-tape-next]");
    if (!track) return;

    let active = 0;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let swiping = false;
    let axis = null;
    let suppressClick = false;

    /* Build once — class toggles animate */
    track.innerHTML = SERIES.map((tape, i) => {
      const playAttrs = tape.vimeo
        ? `href="#" data-lightbox-open data-vimeo="${tape.vimeo}" data-title="${tape.label}: ${tape.title}"`
        : `href="/watch.html"`;

      return `
        <article class="tape ${tape.tone}" data-tape-card data-index="${i}">
          <div class="tape-top"><span>KF—${tape.code}</span><b>${tape.short}</b><span>${tape.format}</span></div>
          <div class="reels" aria-hidden="true">
            <i></i>
            <div class="tape-thumb${tape.thumb ? "" : " is-empty"}">
              ${tape.thumb ? `<img src="${tape.thumb}" alt="" loading="lazy" width="320" height="180">` : ""}
            </div>
            <i></i>
          </div>
          <div class="tape-label">
            <small>KISALA FILMS SERIES</small>
            <strong>${tape.title}</strong>
            <span>${tape.time} / COLOR</span>
          </div>
          <a class="tape-link" ${playAttrs} aria-label="Play ${tape.label}: ${tape.title}"></a>
        </article>
      `;
    }).join("");

    if (indexEl) {
      indexEl.innerHTML = SERIES.map(
        (tape, i) =>
          `<button type="button" data-tape-goto="${i}" aria-label="${tape.label}"><span>0${i + 1}</span>${tape.short}</button>`
      ).join("");
    }

    const cards = () => [...track.querySelectorAll("[data-tape-card]")];

    const clearDrag = () => {
      track.classList.remove("is-dragging");
      track.style.setProperty("--drag", "0");
    };

    const updateUI = () => {
      const n = SERIES.length;
      cards().forEach((card) => {
        const i = Number(card.getAttribute("data-index"));
        card.classList.remove("is-active", "is-prev", "is-next", "is-hidden");
        if (i === active) card.classList.add("is-active");
        else if (i === (active - 1 + n) % n) card.classList.add("is-prev");
        else if (i === (active + 1) % n) card.classList.add("is-next");
        else card.classList.add("is-hidden");
      });

      if (indexEl) {
        indexEl.querySelectorAll("[data-tape-goto]").forEach((btn) => {
          const i = Number(btn.getAttribute("data-tape-goto"));
          const on = i === active;
          btn.classList.toggle("active", on);
          btn.setAttribute("aria-pressed", String(on));
        });
      }

      if (detailEl) {
        const tape = SERIES[active];
        const note = tape.vimeo
          ? ""
          : `<br><span class="placeholder-note">PLACEHOLDER: film not uploaded yet — lightbox wires when a Vimeo ID is set.</span>`;
        const cta = tape.vimeo
          ? `<a class="cta-primary" href="#" data-lightbox-open data-vimeo="${tape.vimeo}" data-title="${tape.label}: ${tape.title}">PLAY THIS TAPE <span>↗</span></a>`
          : `<a class="cta-primary" href="/watch.html">BROWSE WATCH <span>↘</span></a>`;
        detailEl.innerHTML = `
          <p><strong>${tape.label}</strong> — ${tape.blurb}${note}</p>
          ${cta}
        `;
      }
    };

    const setActive = (next) => {
      clearDrag();
      active = (next + SERIES.length) % SERIES.length;
      updateUI();
    };

    root.addEventListener("click", (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const light = e.target.closest("[data-lightbox-open]");
      if (light) {
        e.preventDefault();
        openLightbox({
          vimeo: light.getAttribute("data-vimeo"),
          title: light.getAttribute("data-title"),
        });
        return;
      }
      const goto = e.target.closest("[data-tape-goto]");
      if (goto) {
        setActive(Number(goto.getAttribute("data-tape-goto")));
        return;
      }
      if (e.target.closest("[data-tape-prev]")) setActive(active - 1);
      if (e.target.closest("[data-tape-next]")) setActive(active + 1);
    });

    root.addEventListener("keydown", (e) => {
      if (!root.contains(document.activeElement) && document.activeElement !== root) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActive(active - 1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActive(active + 1);
      }
    });

    const onStart = (x, y) => {
      swiping = true;
      axis = null;
      startX = x;
      startY = y;
      deltaX = 0;
    };

    const onMove = (x, y, event) => {
      if (!swiping) return;
      const dx = x - startX;
      const dy = y - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") track.classList.add("is-dragging");
      }
      if (axis !== "x") return;
      if (event && event.cancelable) event.preventDefault();
      deltaX = dx;
      if (!prefersReduced) {
        track.style.setProperty("--drag", String(Math.max(-180, Math.min(180, dx))));
      }
    };

    const onEnd = () => {
      if (!swiping) return;
      swiping = false;
      const wasX = axis === "x";
      axis = null;
      const dx = deltaX;
      deltaX = 0;

      if (!wasX) {
        clearDrag();
        return;
      }

      const threshold = Math.min(72, Math.max(48, track.clientWidth * 0.14));
      if (Math.abs(dx) > threshold) {
        suppressClick = true;
        setActive(active + (dx < 0 ? 1 : -1));
        window.setTimeout(() => {
          suppressClick = false;
        }, 320);
      } else {
        clearDrag();
        updateUI();
      }
    };

    track.addEventListener(
      "touchstart",
      (e) => onStart(e.changedTouches[0].clientX, e.changedTouches[0].clientY),
      { passive: true }
    );
    track.addEventListener(
      "touchmove",
      (e) => onMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e),
      { passive: false }
    );
    track.addEventListener("touchend", onEnd);
    track.addEventListener("touchcancel", onEnd);

    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      if (e.target.closest("a, button")) return;
      track.setPointerCapture?.(e.pointerId);
      onStart(e.clientX, e.clientY);
    });
    track.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      onMove(e.clientX, e.clientY, e);
    });
    track.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") return;
      onEnd();
    });
    track.addEventListener("pointercancel", (e) => {
      if (e.pointerType === "touch") return;
      onEnd();
    });

    if (prevBtn) prevBtn.setAttribute("aria-label", "Previous tape");
    if (nextBtn) nextBtn.setAttribute("aria-label", "Next tape");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", "Series tape crate");

    updateUI();

    if (prefersReduced) {
      document.querySelectorAll(".reels i").forEach((el) => {
        el.style.animation = "none";
      });
    }
  }

  document.querySelectorAll("[data-tape-slider]").forEach(initTapeSlider);

  /* Global lightbox triggers (latest film CTAs, watch cards, etc.) */
  document.addEventListener("click", (e) => {
    const light = e.target.closest("[data-lightbox-open]");
    if (!light || light.closest("[data-tape-slider]")) return;
    e.preventDefault();
    openLightbox({
      vimeo: light.getAttribute("data-vimeo"),
      title: light.getAttribute("data-title"),
    });
  });

  /* Inline Vimeo previews (e.g. featured film thumbnail) — muted, looping */
  let vimeoApiPromise = null;
  function loadVimeoApi() {
    if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
    if (vimeoApiPromise) return vimeoApiPromise;
    vimeoApiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="player.vimeo.com/api/player.js"]');
      const onReady = () => {
        if (window.Vimeo?.Player) resolve(window.Vimeo);
        else reject(new Error("Vimeo Player API missing"));
      };
      if (existing) {
        if (window.Vimeo?.Player) onReady();
        else existing.addEventListener("load", onReady, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://player.vimeo.com/api/player.js";
      script.async = true;
      script.onload = onReady;
      script.onerror = reject;
      document.body.appendChild(script);
    });
    return vimeoApiPromise;
  }

  function forceLoopPreview(iframe) {
    if (!iframe) return;
    loadVimeoApi()
      .then((Vimeo) => {
        const player = new Vimeo.Player(iframe);
        player.setMuted(true).catch(() => {});
        player.setVolume(0).catch(() => {});
        player.setLoop(true).catch(() => {});
        const kick = () => player.play().catch(() => {});
        player.on("loaded", kick);
        player.on("ended", () => {
          player.setCurrentTime(0).then(kick).catch(kick);
        });
        kick();
      })
      .catch(() => {});
  }

  if (!prefersReduced) {
    document.querySelectorAll("[data-vimeo-preview]").forEach((el) => {
      const id = el.getAttribute("data-vimeo-preview");
      const mount = el.querySelector("[data-preview-media]");
      if (!id || !mount) return;
      mount.innerHTML = `<iframe src="${vimeoEmbedUrl(id, { background: true })}" allow="autoplay; fullscreen; picture-in-picture" title="Preview" tabindex="-1"></iframe>`;
      el.classList.add("has-preview");
      forceLoopPreview(mount.querySelector("iframe"));
    });
  }

  /* Hero / page-hero Vimeo backgrounds — skip when reduced motion */
  if (!prefersReduced) {
    document.querySelectorAll("[data-hero-vimeo]").forEach((hero) => {
      const id = hero.getAttribute("data-hero-vimeo");
      const mount = hero.querySelector("[data-hero-media]");
      if (!id || !mount) return;
      const title = hero.getAttribute("data-hero-title") || "Video background";
      mount.innerHTML = `<iframe src="${vimeoEmbedUrl(id, { background: true })}" allow="autoplay; fullscreen; picture-in-picture" title="${title}" tabindex="-1"></iframe>`;
      hero.classList.add("has-video");
      forceLoopPreview(mount.querySelector("iframe"));
    });
  }

  document.addEventListener("visibilitychange", () => {
    const paused = document.hidden;
    document.querySelectorAll(".ticker div, .rec b, .header-meta i, .reels i").forEach((el) => {
      el.style.animationPlayState = paused ? "paused" : "running";
    });
  });

  /* —— Scroll reveal —— */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length) {
    if (prefersReduced || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
      );
      revealEls.forEach((el) => io.observe(el));
    }
  }
})();
