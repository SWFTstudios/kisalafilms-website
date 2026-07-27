(() => {
  document.querySelectorAll("[data-faq] .faq-item").forEach((item) => {
    const btn = item.querySelector(".faq-q");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const list = item.parentElement;
      list.querySelectorAll(".faq-item").forEach((el) => {
        if (el !== item) {
          el.classList.remove("open");
          const m = el.querySelector(".mark");
          if (m) m.textContent = "+";
        }
      });
      const open = item.classList.toggle("open");
      const mark = item.querySelector(".mark");
      if (mark) mark.textContent = open ? "–" : "+";
    });
  });

  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(max-width: 899px), (pointer: coarse)").matches;
  // Skip scroll-linked transforms on phones — they fight touch momentum
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
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );
    reveals.forEach((el) => rio.observe(el));
  }

  // Show success notes when FormSubmit redirects back with ?sent=1 or ?subscribed=1
  const params = new URLSearchParams(window.location.search);
  if (params.has("sent") || params.has("subscribed")) {
    document.querySelectorAll(".form-note").forEach((note) => note.classList.add("show"));
  }

  const filters = document.querySelector("[data-filter-tabs]");  if (filters) {
    const cards = document.querySelectorAll("[data-filter-item]");
    filters.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        filters.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const key = btn.getAttribute("data-filter") || "all";
        cards.forEach((card) => {
          const tags = (card.getAttribute("data-filter-item") || "").split(/\s+/);
          const show = key === "all" || tags.includes(key);
          card.hidden = !show;
        });
      });
    });
  }
})();
