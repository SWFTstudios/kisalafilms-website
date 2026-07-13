(() => {
  const panel = document.getElementById("nav-drawer");
  const backdrop = document.querySelector("[data-nav-backdrop]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const closes = document.querySelectorAll("[data-nav-close]");

  const setOpen = (open) => {
    if (!panel) return;
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (backdrop) backdrop.classList.toggle("is-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-lock", open);
  };

  if (toggle) {
    toggle.addEventListener("click", () => {
      setOpen(!panel?.classList.contains("is-open"));
    });
  }
  closes.forEach((el) => el.addEventListener("click", () => setOpen(false)));
  backdrop?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  document.querySelectorAll(".nav-acc").forEach((acc) => {
    const btn = acc.querySelector(".nav-acc-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const willOpen = !acc.classList.contains("open");
      document.querySelectorAll(".nav-acc").forEach((other) => {
        if (other !== acc) {
          other.classList.remove("open");
          other.querySelector(".nav-acc-btn")?.setAttribute("aria-expanded", "false");
        }
      });
      acc.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });
  });

  document.querySelectorAll(".nav-dd").forEach((dd) => {
    const btn = dd.querySelector(".nav-dd-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const open = !dd.classList.contains("open");
      document.querySelectorAll(".nav-dd").forEach((o) => o.classList.remove("open"));
      dd.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dd")) {
      document.querySelectorAll(".nav-dd").forEach((dd) => {
        dd.classList.remove("open");
        dd.querySelector(".nav-dd-btn")?.setAttribute("aria-expanded", "false");
      });
    }
  });

  const path = window.location.pathname.replace(/\/$/, "") || "/";
  document.querySelectorAll(".nav-panel a[href], .nav-dd-menu a[href], .nav-desktop > a[href]").forEach((a) => {
    try {
      const href = new URL(a.href).pathname.replace(/\/$/, "") || "/";
      if (href === path || (path !== "/" && href !== "/" && path.startsWith(href))) {
        a.classList.add("is-active");
      }
    } catch (_) { /* ignore */ }
  });
})();
