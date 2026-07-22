(() => {
  const toggle = document.querySelector("[data-nav-toggle]");
  const menu = document.querySelector("[data-mobile-menu]");
  const closes = document.querySelectorAll("[data-nav-close]");

  const setOpen = (open) => {
    if (!menu) return;
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-lock", open);
  };

  if (toggle) {
    toggle.addEventListener("click", () => {
      setOpen(!menu?.classList.contains("is-open"));
    });
  }

  closes.forEach((el) => el.addEventListener("click", () => setOpen(false)));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  menu?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });

  const path = window.location.pathname.replace(/\/$/, "") || "/";
  document.querySelectorAll(".nav-desktop a[href], [data-mobile-menu] a[href]").forEach((a) => {
    try {
      const href = new URL(a.href).pathname.replace(/\/$/, "") || "/";
      if (href === path || (path !== "/" && href !== "/" && path.startsWith(href))) {
        a.classList.add("is-active");
      }
    } catch (_) {
      /* ignore */
    }
  });
})();
