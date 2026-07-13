(() => {
  const drawer = document.getElementById("nav-drawer");
  const toggle = document.querySelector("[data-nav-toggle]");
  if (toggle && drawer) {
    toggle.addEventListener("click", () => {
      const open = drawer.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

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

  const progressRoot = document.querySelector("[data-progress]");
  if (progressRoot) {
    const fills = progressRoot.querySelectorAll(".progress-fill");
    const run = () => {
      fills.forEach((el) => {
        const w = el.getAttribute("data-width") || "0";
        el.style.width = `${w}%`;
      });
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              run();
              io.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      io.observe(progressRoot);
    } else {
      run();
    }
  }

  const reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    if ("IntersectionObserver" in window) {
      const rio = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              rio.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
      reveals.forEach((el) => rio.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("is-in"));
    }
  }

  const form = document.getElementById("home-inquiry");
  const note = document.getElementById("form-note");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (note) note.classList.add("show");
      form.reset();
    });
  }

  const newsletter = document.getElementById("newsletter");
  if (newsletter) {
    newsletter.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  }
})();
