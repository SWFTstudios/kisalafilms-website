(() => {
  /* ---- FAQ accordions ---------------------------------------------------- */
  // The markup keeps `class="faq-q"` first on the button and the answer in a
  // sibling `<p class="faq-a">` — scripts/build-jsonld.mjs scrapes exactly that
  // shape to build the FAQPage entries, so the aria wiring is added here at
  // runtime rather than baked into the markup.
  document.querySelectorAll("[data-faq] .faq-item").forEach((item, i) => {
    const btn = item.querySelector(".faq-q");
    const answer = item.querySelector(".faq-a");
    if (!btn) return;

    if (answer && !answer.id) {
      answer.id = answer.id || `faq-a-${i}-${Math.random().toString(36).slice(2, 7)}`;
    }
    btn.setAttribute("aria-expanded", String(item.classList.contains("open")));
    if (answer) btn.setAttribute("aria-controls", answer.id);

    btn.addEventListener("click", () => {
      const list = item.parentElement;
      list.querySelectorAll(".faq-item").forEach((el) => {
        if (el !== item) {
          el.classList.remove("open");
          el.querySelector(".faq-q")?.setAttribute("aria-expanded", "false");
          const m = el.querySelector(".mark");
          if (m) m.textContent = "+";
        }
      });
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      const mark = item.querySelector(".mark");
      if (mark) mark.textContent = open ? "–" : "+";
    });
  });

  /* ---- Scroll reveals ---------------------------------------------------- */
  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reveals.length || reduceMotion || !("IntersectionObserver" in window)) {
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
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );
    reveals.forEach((el) => rio.observe(el));
  }

  // Show success notes when FormSubmit redirects back with ?sent=1 or ?subscribed=1
  const params = new URLSearchParams(window.location.search);
  if (params.has("sent") || params.has("subscribed")) {
    document.querySelectorAll(".form-note").forEach((note) => note.classList.add("show"));
  }

  /* ---- Filter tabs ------------------------------------------------------- */
  document.querySelectorAll("[data-filter-tabs]").forEach((filters) => {
    const scope = filters.getAttribute("data-filter-scope");
    const cards = scope
      ? document.querySelectorAll(`${scope} [data-filter-item]`)
      : document.querySelectorAll("[data-filter-item]");
    const empty = document.querySelector("[data-filter-empty]");

    filters.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        filters.querySelectorAll("button").forEach((b) => {
          b.classList.remove("on");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("on");
        btn.setAttribute("aria-pressed", "true");

        const key = btn.getAttribute("data-filter") || "all";
        let shown = 0;
        cards.forEach((card) => {
          const tags = (card.getAttribute("data-filter-item") || "").split(/\s+/);
          const show = key === "all" || tags.includes(key);
          card.hidden = !show;
          if (show) shown += 1;
        });
        if (empty) empty.hidden = shown > 0;
      });
    });
  });

  /* ---- Swipe strip pagination -------------------------------------------- */
  // The strip is a plain scroll container: the dots are an addition for touch,
  // not the mechanism, so the section still works with this script absent.
  document.querySelectorAll("[data-strip]").forEach((strip) => {
    const dots = document.querySelector("[data-strip-dots]");
    const items = [...strip.children];
    if (!dots || items.length < 2) return;

    const isScrollable = () => strip.scrollWidth > strip.clientWidth + 4;

    items.forEach((item, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to item ${i + 1} of ${items.length}`);
      dot.addEventListener("click", () => {
        strip.scrollTo({
          left: item.offsetLeft - strip.offsetLeft,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      });
      dots.append(dot);
    });

    const sync = () => {
      dots.hidden = !isScrollable();
      if (dots.hidden) return;
      const middle = strip.scrollLeft + strip.clientWidth / 2;
      let active = 0;
      items.forEach((item, i) => {
        const left = item.offsetLeft - strip.offsetLeft;
        if (left <= middle) active = i;
      });
      [...dots.children].forEach((dot, i) =>
        dot.setAttribute("aria-current", String(i === active))
      );
    };

    sync();
    strip.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
  });
})();
