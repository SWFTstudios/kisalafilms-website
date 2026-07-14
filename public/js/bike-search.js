/**
 * Bike year / make / model typeahead for the quote form.
 * Data: /data/motorcycles.json (NHTSA motorcycle makes/models + curated aliases)
 */
(() => {
  const YEAR_INPUT = document.querySelector("[data-bike-year]");
  const BIKE_INPUT = document.querySelector("[data-bike-search]");
  const LIST = document.querySelector("[data-bike-list]");
  if (!YEAR_INPUT || !BIKE_INPUT || !LIST) return;

  let searchIndex = [];
  let years = { min: 1985, max: new Date().getFullYear() + 1 };
  let loaded = false;
  let activeIndex = -1;
  let results = [];

  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  function fillYears() {
    const selected = YEAR_INPUT.value;
    // Keep static HTML options if already populated (no-JS / first paint)
    if (YEAR_INPUT.options.length > 2) {
      if (selected) YEAR_INPUT.value = selected;
      return;
    }
    YEAR_INPUT.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Year";
    YEAR_INPUT.appendChild(blank);
    for (let y = years.max; y >= years.min; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      YEAR_INPUT.appendChild(opt);
    }
    if (selected) YEAR_INPUT.value = selected;
  }

  async function loadData() {
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch("/data/motorcycles.json", { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      years = {
        min: Number(data.yearMin) || 1985,
        max: Number(data.yearMax) || new Date().getFullYear() + 1,
      };
      searchIndex = Array.isArray(data.search) ? data.search : [];
      fillYears();
    } catch (err) {
      console.warn("Bike index failed to load", err);
      fillYears();
    }
  }

  function scoreMatch(query, candidate) {
    const q = normalize(query);
    const c = normalize(candidate);
    if (!q) return 0;
    if (c === q) return 100;
    if (c.startsWith(q)) return 90;
    const tokens = q.split(" ").filter(Boolean);
    if (tokens.every((t) => c.includes(t))) return 70 + Math.min(tokens.length, 10);
    if (c.includes(q)) return 50;
    return 0;
  }

  function queryResults(q) {
    if (!q || q.length < 1) return [];
    const ranked = [];
    for (const entry of searchIndex) {
      const score = scoreMatch(q, entry);
      if (score > 0) ranked.push({ entry, score });
    }
    ranked.sort((a, b) => b.score - a.score || a.entry.localeCompare(b.entry));
    return ranked.slice(0, 8).map((r) => r.entry);
  }

  function closeList() {
    LIST.hidden = true;
    LIST.innerHTML = "";
    activeIndex = -1;
    results = [];
    BIKE_INPUT.setAttribute("aria-expanded", "false");
  }

  function openList(items) {
    results = items;
    activeIndex = items.length ? 0 : -1;
    LIST.innerHTML = "";
    if (!items.length) {
      closeList();
      return;
    }
    items.forEach((label, i) => {
      const li = document.createElement("li");
      li.id = `bike-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
      li.textContent = label;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(label);
      });
      LIST.appendChild(li);
    });
    LIST.hidden = false;
    BIKE_INPUT.setAttribute("aria-expanded", "true");
  }

  function highlight() {
    [...LIST.children].forEach((el, i) => {
      el.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    });
    const active = LIST.children[activeIndex];
    if (active) {
      BIKE_INPUT.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      BIKE_INPUT.removeAttribute("aria-activedescendant");
    }
  }

  function pick(label) {
    BIKE_INPUT.value = label;
    closeList();
    BIKE_INPUT.focus();
  }

  function refresh() {
    openList(queryResults(BIKE_INPUT.value));
  }

  BIKE_INPUT.addEventListener("focus", () => {
    loadData().then(() => {
      if (BIKE_INPUT.value.trim()) refresh();
    });
  });

  BIKE_INPUT.addEventListener("input", () => {
    loadData().then(refresh);
  });

  BIKE_INPUT.addEventListener("keydown", (e) => {
    if (LIST.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex + 1) % results.length;
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      highlight();
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        pick(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      closeList();
    }
  });

  BIKE_INPUT.addEventListener("blur", () => {
    setTimeout(closeList, 120);
  });

  YEAR_INPUT.addEventListener("focus", loadData);

  // Prefetch when the quote section is near viewport
  const quote = document.getElementById("quote");
  if (quote && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadData();
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(quote);
  } else {
    loadData();
  }
})();
