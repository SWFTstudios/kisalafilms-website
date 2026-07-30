(() => {
  const tabs = document.querySelectorAll("[data-gallery-tab]");
  const panels = document.querySelectorAll("[data-gallery-panel]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const activate = (key) => {
    tabs.forEach((tab) => {
      const on = tab.getAttribute("data-gallery-tab") === key;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    panels.forEach((panel) => {
      const on = panel.getAttribute("data-gallery-panel") === key;
      panel.hidden = !on;
    });
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.getAttribute("data-gallery-tab")));
  });

  // Reveal hero video only after it can play; otherwise keep the poster image.
  const video = document.querySelector(".kf-hero-video");
  if (video) {
    const show = () => video.classList.add("is-ready");
    const hide = () => {
      video.classList.remove("is-ready");
      video.removeAttribute("autoplay");
    };
    if (video.readyState >= 2) show();
    video.addEventListener("canplay", show);
    video.addEventListener("error", hide);
    video.querySelector("source")?.addEventListener("error", hide);
  }

  // In The Shop — muted looping Vimeo in the intro media frame.
  const intro = document.querySelector("[data-intro-vimeo]");
  const mount = intro?.querySelector("[data-intro-embed]");
  if (intro && mount && !reduceMotion) {
    const id = intro.getAttribute("data-intro-vimeo");
    const title = intro.getAttribute("data-intro-title") || "In The Shop — 02' Honda F4i";
    const src =
      `https://player.vimeo.com/video/${id}` +
      `&autoplay=1&muted=1&loop=1&background=1&title=0&byline=0&portrait=0`;
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = title;
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.loading = "lazy";
    iframe.tabIndex = -1;
    mount.appendChild(iframe);
    iframe.addEventListener("load", () => mount.classList.add("is-ready"), { once: true });
    // Failsafe if load never fires
    window.setTimeout(() => mount.classList.add("is-ready"), 2500);
  }

  /* Film Video split — Vimeo muted loop by default; swap to local MP4 if it can play. */
  const filmTile = document.querySelector(".kf-split-tile--video");
  if (filmTile && !reduceMotion) {
    const splitVideo = filmTile.querySelector(".kf-split-video");
    const embedHost = filmTile.querySelector("[data-split-embed]");
    const vimeoId = filmTile.getAttribute("data-split-vimeo");

    const mountVimeo = () => {
      if (!embedHost || !vimeoId || embedHost.querySelector("iframe")) return;
      const title = filmTile.getAttribute("data-split-title") || "Film Video";
      const src =
        `https://player.vimeo.com/video/${vimeoId}` +
        `&autoplay=1&muted=1&loop=1&background=1&title=0&byline=0&portrait=0`;
      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.title = title;
      iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
      iframe.setAttribute("allowfullscreen", "");
      iframe.loading = "lazy";
      iframe.tabIndex = -1;
      embedHost.appendChild(iframe);
      iframe.addEventListener("load", () => embedHost.classList.add("is-ready"), { once: true });
      window.setTimeout(() => embedHost.classList.add("is-ready"), 2500);
    };

    mountVimeo();

    if (splitVideo) {
      const showLocal = () => {
        splitVideo.classList.add("is-ready");
        if (embedHost) embedHost.classList.remove("is-ready");
      };
      if (splitVideo.readyState >= 2) showLocal();
      else splitVideo.addEventListener("canplay", showLocal, { once: true });
      const failLocal = () => {
        splitVideo.classList.remove("is-ready");
        splitVideo.removeAttribute("autoplay");
      };
      splitVideo.addEventListener("error", failLocal);
      splitVideo.querySelector("source")?.addEventListener("error", failLocal);
    }
  }

  /* Film Wraps split — smooth crossfade slideshow. */
  const slideRoot = document.querySelector("[data-split-slides]");
  if (slideRoot && !reduceMotion) {
    const slides = Array.from(slideRoot.querySelectorAll("img"));
    if (slides.length > 1) {
      let index = Math.max(0, slides.findIndex((img) => img.classList.contains("is-active")));
      const intervalMs = 4200;
      let timer = null;
      let paused = false;

      const go = (next) => {
        slides[index].classList.remove("is-active");
        index = (next + slides.length) % slides.length;
        slides[index].classList.add("is-active");
      };

      const tick = () => {
        if (!paused) go(index + 1);
      };

      const start = () => {
        if (timer) return;
        timer = window.setInterval(tick, intervalMs);
      };

      const stop = () => {
        if (!timer) return;
        window.clearInterval(timer);
        timer = null;
      };

      const tile = slideRoot.closest(".kf-split-tile");
      tile?.addEventListener("mouseenter", () => {
        paused = true;
      });
      tile?.addEventListener("mouseleave", () => {
        paused = false;
      });

      // Pause when off-screen to save work.
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) start();
              else stop();
            });
          },
          { threshold: 0.2 }
        );
        io.observe(slideRoot);
      } else {
        start();
      }
    }
  }
})();
