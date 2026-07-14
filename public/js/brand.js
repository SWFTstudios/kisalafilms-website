(() => {
  const THEME_KEY = "kf-theme";

  const getPreferred = () => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "day" || stored === "night") return stored;
    } catch (_) {
      /* private mode */
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night";
  };

  const applyTheme = (theme) => {
    const next = theme === "day" ? "day" : "night";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (_) {
      /* ignore */
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const toDay = next === "night";
      btn.setAttribute("aria-label", toDay ? "Switch to day mode" : "Switch to night mode");
      btn.setAttribute("aria-pressed", String(next === "day"));
    });
  };

  applyTheme(
    document.documentElement.getAttribute("data-theme") || getPreferred()
  );

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "night";
      applyTheme(current === "day" ? "night" : "day");
    });
  });

  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(max-width: 899px), (pointer: coarse)").matches;

  if (!reveals.length || reduceMotion || coarsePointer || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
    const rio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            rio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((el) => rio.observe(el));
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has("sent") || params.has("subscribed")) {
    document.querySelectorAll(".form-note").forEach((note) => note.classList.add("show"));
  }
})();
