/**
 * K Films — v4 page behaviour.
 *
 * One file for the redesign's chrome and motion: header state, the menu
 * overlay, the first-visit intro, scroll reveals, the word-by-word manifesto,
 * the pinned chapters, image parallax, the builds track and the scroll
 * progress line. Every scroll effect reads from one requestAnimationFrame
 * pass, and all of it stands down under prefers-reduced-motion.
 *
 * The hidden starting states in kf.css only apply under html.js, which the
 * inline head script sets, so with scripts off every page reads in full.
 */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = window.matchMedia("(min-width: 900px)");

  /* ---- Intro (first visit only) ----------------------------------------- */
  const intro = document.querySelector("[data-intro]");
  if (intro && root.classList.contains("show-intro")) {
    const finish = () => {
      intro.classList.add("is-done");
      try { localStorage.setItem("kf-intro-seen", "1"); } catch (e) { /* private mode */ }
      setTimeout(() => root.classList.remove("show-intro"), 900);
    };
    const timer = setTimeout(finish, 2300);
    intro.addEventListener("click", () => { clearTimeout(timer); finish(); });
  }

  window.addEventListener("load", () => document.body.classList.add("is-loaded"));
  // A cached page can fire load before this runs.
  if (document.readyState === "complete") document.body.classList.add("is-loaded");

  /* ---- Menu overlay ------------------------------------------------------ */
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("site-menu");
  const main = document.getElementById("main");
  const footer = document.querySelector(".site-footer");

  if (toggle && menu) {
    const label = toggle.querySelector(".menu-toggle-text");
    const focusables = () =>
      [toggle, ...menu.querySelectorAll("a[href], button:not([disabled])")];

    const setOpen = (open) => {
      root.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (label) label.textContent = open ? "Close" : "Menu";
      menu.setAttribute("aria-hidden", String(!open));
      [main, footer].forEach((el) => el && (el.inert = open));
      if (open) menu.querySelector("a")?.focus({ preventScroll: true });
    };

    toggle.addEventListener("click", () => setOpen(!root.classList.contains("menu-open")));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });

    document.addEventListener("keydown", (e) => {
      if (!root.classList.contains("menu-open")) return;
      if (e.key === "Escape") { setOpen(false); toggle.focus(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Mark the current page in the overlay.
    const here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    menu.querySelectorAll(".menu-nav a").forEach((a) => {
      const path = new URL(a.href).pathname.replace(/\/$/, "") || "/";
      if (path === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ---- FAQ accordions ---------------------------------------------------- */
  // The markup keeps button.faq-q then p.faq-a: scripts/build-jsonld.mjs reads
  // exactly that shape for the FAQPage graph, so the aria wiring is added here.
  document.querySelectorAll(".faq-item").forEach((item, i) => {
    const btn = item.querySelector(".faq-q");
    const answer = item.querySelector(".faq-a");
    if (!btn || !answer) return;
    answer.id = answer.id || `faq-a-${i}`;
    btn.setAttribute("aria-controls", answer.id);
    btn.setAttribute("aria-expanded", String(item.classList.contains("open")));
    btn.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      const mark = btn.querySelector(".mark");
      if (mark) mark.textContent = open ? "–" : "+";
    });
  });

  // FormSubmit redirects back with ?sent=1.
  if (new URLSearchParams(location.search).has("sent")) {
    document.querySelectorAll(".form-note").forEach((note) => note.classList.add("show"));
  }

  /* ---- Reveals ----------------------------------------------------------- */
  const revealables = document.querySelectorAll(".rv, .wipe, [data-mask]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach((el) => el.classList.add("is-in"));
  } else {
    // A fully clipped .wipe never registers as intersecting, so it is watched
    // through its parent instead.
    const targets = new Map();
    revealables.forEach((el) => {
      const watched = el.classList.contains("wipe") ? el.parentElement : el;
      targets.set(watched, [...(targets.get(watched) || []), el]);
    });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        targets.get(entry.target).forEach((el) => el.classList.add("is-in"));
        io.unobserve(entry.target);
      }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach((_, watched) => io.observe(watched));
  }

  /* ---- Manifesto words --------------------------------------------------- */
  // Split every text node into word spans, keeping inline markup like <em>.
  const wordBlocks = [...document.querySelectorAll("[data-words]")].map((block) => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(part); return; }
        const span = document.createElement("span");
        span.className = "w";
        span.textContent = part;
        frag.append(span);
      });
      node.replaceWith(frag);
    });
    if (!reduceMotion) block.classList.add("words-ready");
    return { block, words: [...block.querySelectorAll(".w")] };
  });

  /* ---- Chapters ---------------------------------------------------------- */
  const chapters = document.querySelector("[data-chapters]");
  const chapterSlides = chapters ? [...chapters.querySelectorAll(".chapter")] : [];
  const pinChapters = () => {
    if (!chapters) return;
    const pinned = wide.matches && !reduceMotion;
    chapters.classList.toggle("is-pinned", pinned);
    if (!pinned) chapterSlides.forEach((s) => s.classList.remove("is-active"));
  };
  pinChapters();
  wide.addEventListener("change", pinChapters);

  /* ---- Builds track ------------------------------------------------------ */
  document.querySelectorAll("[data-track]").forEach((wrap) => {
    const track = wrap.querySelector(".track");
    const prev = wrap.querySelector("[data-track-prev]");
    const next = wrap.querySelector("[data-track-next]");
    if (!track) return;
    const step = () => (track.firstElementChild?.getBoundingClientRect().width || 600) + 24;
    const sync = () => {
      if (prev) prev.disabled = track.scrollLeft < 8;
      if (next) next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    prev?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    next?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    track.addEventListener("scroll", sync, { passive: true });
    sync();
  });

  /* ---- The scroll pass --------------------------------------------------- */
  const header = document.querySelector(".site-header");
  const progress = document.querySelector("[data-progress]");
  const parallax = reduceMotion ? [] : [...document.querySelectorAll("[data-parallax]")];
  let lastY = window.scrollY;
  let ticking = false;

  const frame = () => {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    if (header && !root.classList.contains("menu-open")) {
      header.classList.toggle("is-solid", y > 40);
      // Tuck the header away while reading down, bring it back on any scroll up.
      header.classList.toggle("is-hidden", y > vh * 0.9 && y > lastY + 2);
      if (y < lastY - 2) header.classList.remove("is-hidden");
    }
    lastY = y;

    if (progress) {
      const max = document.documentElement.scrollHeight - vh;
      progress.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
    }

    wordBlocks.forEach(({ block, words }) => {
      const r = block.getBoundingClientRect();
      const p = (vh * 0.82 - r.top) / (r.height + vh * 0.3);
      const lit = Math.round(Math.min(Math.max(p, 0), 1) * words.length);
      words.forEach((w, i) => w.classList.toggle("on", i < lit));
    });

    if (chapters && chapters.classList.contains("is-pinned")) {
      const r = chapters.getBoundingClientRect();
      const span = r.height - vh;
      const p = Math.min(Math.max(-r.top / span, 0), 0.9999);
      const active = Math.floor(p * chapterSlides.length);
      chapterSlides.forEach((s, i) => s.classList.toggle("is-active", i === active));
      chapters.style.setProperty("--cp", p.toFixed(4));
    }

    parallax.forEach((img) => {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const p = (r.top + r.height / 2 - vh / 2) / (vh + r.height); // -0.5 … 0.5
      img.style.setProperty("--py", `${(-p * 12 - 6).toFixed(2)}%`);
    });
  };

  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  frame();
})();
