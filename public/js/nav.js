(() => {
  const panel = document.getElementById("nav-drawer");
  const backdrop = document.querySelector("[data-nav-backdrop]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const closes = document.querySelectorAll("[data-nav-close]");

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  const setOpen = (open) => {
    if (!panel) return;
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (backdrop) backdrop.classList.toggle("is-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-lock", open);

    if (open) {
      // Move focus into the drawer so a keyboard user is not left behind the
      // backdrop, and remember where to put it back.
      panel.querySelector(FOCUSABLE)?.focus();
    } else if (toggle && panel.contains(document.activeElement)) {
      toggle.focus();
    }
  };

  const isOpen = () => Boolean(panel?.classList.contains("is-open"));

  if (toggle) {
    toggle.addEventListener("click", () => setOpen(!isOpen()));
  }
  closes.forEach((el) => el.addEventListener("click", () => setOpen(false)));
  backdrop?.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      document.querySelectorAll(".nav-dd.open").forEach((dd) => {
        dd.classList.remove("open");
        dd.querySelector(".nav-dd-btn")?.setAttribute("aria-expanded", "false");
      });
      return;
    }

    // Keep Tab inside the drawer while it covers the page.
    if (e.key !== "Tab" || !isOpen()) return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null
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

  /* ---- Header opacity past the fold ------------------------------------ */
  // motion.js does the same thing on the pages that still load it; both write
  // the same class, so running twice is harmless.
  const header = document.querySelector(".site-header");
  if (header) {
    const sync = () => header.classList.toggle("is-solid", window.scrollY > 24);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }

  /* ---- Sticky mobile quote bar ----------------------------------------- */
  // Revealed once the hero CTA has scrolled away, hidden again at the footer
  // so it never sits on top of the footer's own links, and suppressed while a
  // form field has focus so it cannot cover the keyboard target.
  const sticky = document.querySelector("[data-sticky-cta]");
  if (sticky) {
    const footer = document.querySelector(".site-footer");
    sticky.hidden = false;

    const sync = () => {
      const passedHero = window.scrollY > window.innerHeight * 0.6;
      const atFooter = footer
        ? footer.getBoundingClientRect().top < window.innerHeight
        : false;
      sticky.classList.toggle("is-in", passedHero && !atFooter);
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });

    const typing = (on) => (e) => {
      if (e.target.closest("input, textarea, select")) {
        document.body.classList.toggle("kf-typing", on);
      }
    };
    document.addEventListener("focusin", typing(true));
    document.addEventListener("focusout", typing(false));
  }

  /* ---- Active nav item -------------------------------------------------- */
  // Workers Static Assets serves these pages extensionless, so /gallery.html
  // in an href arrives as /gallery in the address bar. Normalise both sides.
  const normalise = (pathname) =>
    pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/$/, "") || "/";

  const path = normalise(window.location.pathname);
  const links = Array.from(
    document.querySelectorAll(
      ".nav-panel a[href], .nav-dd-menu a[href], .nav-desktop > a[href], .nav-cluster > a[href]"
    )
  ).map((el) => {
    let href = null;
    try {
      href = normalise(new URL(el.href).pathname);
    } catch (_) { /* off-site or malformed */ }
    return { el, href };
  });

  // Prefer an exact match. Only fall back to marking the section parent when
  // nothing matches exactly, otherwise every /services.html#anchor entry in the
  // dropdown lights up at once on a /services/* page.
  const exact = links.filter((l) => l.href === path);
  const matches = exact.length
    ? exact
    : links.filter((l) => l.href && path !== "/" && l.href !== "/" && path.startsWith(l.href + "/"));

  matches.forEach(({ el }) => {
    el.classList.add("is-active");
    if (el.matches(".nav-cluster > a")) el.setAttribute("aria-current", "page");
  });
})();
