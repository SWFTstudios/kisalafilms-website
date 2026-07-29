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
})();
