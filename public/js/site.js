(() => {
  const drawer = document.getElementById("nav-drawer");
  const toggle = document.querySelector("[data-nav-toggle]");
  if (toggle && drawer) {
    toggle.addEventListener("click", () => {
      const open = drawer.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll("[data-segment]").forEach((group) => {
    group.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll("button").forEach((b) => b.classList.remove("sgbOn"));
        btn.classList.add("sgbOn");
      });
    });
  });

  document.querySelectorAll("[data-faq]").forEach((item) => {
    item.addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll("[data-faq]").forEach((el) => {
        el.classList.remove("open");
        const mark = el.querySelector("[data-faq-mark]");
        if (mark) mark.textContent = "+";
      });
      if (!wasOpen) {
        item.classList.add("open");
        const mark = item.querySelector("[data-faq-mark]");
        if (mark) mark.textContent = "–";
      }
    });
  });

  const grid = document.getElementById("films-grid");
  const tabs = document.getElementById("films-tabs");
  if (grid && tabs) {
    const films = [
      { title: "Panigale V4 — Full Build", category: "Transformations", still: "reveal edit" },
      { title: "Night Run — R1 Reveal", category: "Transformations", still: "night edit" },
      { title: "Matte Ghost — ZX-10R", category: "Transformations", still: "matte wrap" },
      { title: "Ember — MT-09", category: "Transformations", still: "orange wrap" },
      { title: "Inside the K Films garage", category: "BTS", still: "shop vlog" },
      { title: "Tank lines, no seams", category: "BTS", still: "knife work" },
      { title: "6 days in 60 seconds", category: "BTS", still: "timelapse" },
      { title: "Marcus — Newark", category: "Rider Stories", still: "documentary frame" },
      { title: "Yara — Jersey City", category: "Rider Stories", still: "documentary frame" },
    ];
    let active = "All";

    const render = () => {
      const items = active === "All" ? films : films.filter((f) => f.category === active);
      grid.innerHTML = items
        .map(
          (f) => `
        <article class="fcard">
          <div class="ph m169">16:9 thumb — ${f.still}</div>
          <span class="chip">${f.category}</span>
          <h3 class="h3">${f.title}</h3>
        </article>`
        )
        .join("");
      tabs.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("tabOn", btn.dataset.tab === active);
      });
    };

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      active = btn.dataset.tab;
      render();
    });

    render();
  }
})();
