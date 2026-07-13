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
  if (reveals.length && "IntersectionObserver" in window) {
    const rio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            rio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((el) => rio.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  document.querySelectorAll("form[data-stub]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = form.querySelector(".form-note");
      if (note) note.classList.add("show");
      form.reset();
    });
  });

  const filters = document.querySelector("[data-filter-tabs]");
  if (filters) {
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
