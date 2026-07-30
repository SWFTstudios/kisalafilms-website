(() => {
  const tabs = document.querySelectorAll("[data-gallery-tab]");
  const panels = document.querySelectorAll("[data-gallery-panel]");

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
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
})();
