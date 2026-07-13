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
      { title: "F4i — Full Build Reveal", category: "Transformations", thumb: "/images/thumb-f4i-reveal.jpg", alt: "Own-bike wrap reveal of the CBR600F4i" },
      { title: "Night Run — Jersey City", category: "Transformations", thumb: "/images/thumb-night-pov.jpg", alt: "POV night ride on the F4i" },
      { title: "Mid-Wrap Transformation", category: "Transformations", thumb: "/images/thumb-transformation-mid.jpg", alt: "F4i mid-wrap in the shop" },
      { title: "Pre-Wrap Strip", category: "Transformations", thumb: "/images/thumb-before-strip.jpg", alt: "Black F4i before the wrap project" },
      { title: "Inside the K Films garage", category: "BTS", thumb: "/images/thumb-shop-bts.jpg", alt: "Behind the scenes in the wrap shop" },
      { title: "Tank lines, no seams", category: "BTS", thumb: "/images/thumb-panel-lines.jpg", alt: "Knife work on vinyl panel lines" },
      { title: "6 days in 60 seconds", category: "BTS", thumb: "/images/thumb-timelapse-shop.jpg", alt: "Shop timelapse still" },
      { title: "Marcus — Newark", category: "Rider Stories", thumb: "/images/thumb-customer-interview.jpg", alt: "Post-transform customer interview" },
      { title: "Yara — Jersey City", category: "Rider Stories", thumb: "/images/thumb-customer-interview-2.jpg", alt: "Rider story interview outdoors" },
    ];
    let active = "All";

    const render = () => {
      const items = active === "All" ? films : films.filter((f) => f.category === active);
      grid.innerHTML = items
        .map(
          (f) => `
        <article class="fcard">
          <img class="ph media m169" src="${f.thumb}" alt="${f.alt}" width="640" height="360" loading="lazy">
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
