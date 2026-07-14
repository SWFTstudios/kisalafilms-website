/**
 * Bike year / make / model dropdowns + fairing R&R labor metadata.
 * Data: /data/motorcycles.json
 */
(() => {
  const YEAR = document.querySelector("[data-bike-year]");
  const MAKE = document.querySelector("[data-bike-make]");
  const MODEL = document.querySelector("[data-bike-model]");
  const BIKE_HIDDEN = document.querySelector("[data-bike-label]");
  const FORM = MAKE ? MAKE.closest("form") : null;
  if (!YEAR || !MAKE || !MODEL) return;

  const META = {
    bodyClass: FORM && FORM.querySelector("[data-bike-body-class]"),
    difficulty: FORM && FORM.querySelector("[data-bike-difficulty]"),
    hoursLow: FORM && FORM.querySelector("[data-bike-hours-low]"),
    hoursHigh: FORM && FORM.querySelector("[data-bike-hours-high]"),
    laborLabel: FORM && FORM.querySelector("[data-bike-labor-label]"),
  };

  let byMake = {};
  let laborBands = {};
  let loaded = false;

  function option(value, label, disabled) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (disabled) opt.disabled = true;
    return opt;
  }

  function clearMeta() {
    Object.values(META).forEach((el) => {
      if (el) el.value = "";
    });
    if (BIKE_HIDDEN) BIKE_HIDDEN.value = "";
  }

  function writeMeta(bike) {
    if (!bike) {
      clearMeta();
      return;
    }
    const band = laborBands[bike.c] || laborBands.unknown || {};
    const hours = band.fairingRrHours || {};
    if (META.bodyClass) META.bodyClass.value = bike.c || "";
    if (META.difficulty) META.difficulty.value = band.difficulty != null ? String(band.difficulty) : "";
    if (META.hoursLow) META.hoursLow.value = hours.low != null ? String(hours.low) : "";
    if (META.hoursHigh) META.hoursHigh.value = hours.high != null ? String(hours.high) : "";
    if (META.laborLabel) META.laborLabel.value = band.label || "";
    if (BIKE_HIDDEN) BIKE_HIDDEN.value = bike.l || `${bike.m} ${bike.o}`;
  }

  function resetModels(placeholder) {
    MODEL.innerHTML = "";
    MODEL.appendChild(option("", placeholder || "Select model", false));
    MODEL.disabled = true;
    MODEL.required = true;
    clearMeta();
  }

  function fillMakes() {
    const selected = MAKE.value;
    const makes = Object.keys(byMake).sort((a, b) => a.localeCompare(b));
    MAKE.innerHTML = "";
    MAKE.appendChild(option("", "Select make", false));
    makes.forEach((make) => MAKE.appendChild(option(make, make)));
    if (selected && byMake[selected]) MAKE.value = selected;
  }

  function fillModels(make) {
    resetModels(make ? "Select model" : "Select make first");
    if (!make || !byMake[make]) return;
    const models = byMake[make].slice().sort((a, b) => a.o.localeCompare(b.o));
    models.forEach((bike) => {
      const opt = option(bike.o, bike.o);
      opt.dataset.bodyClass = bike.c;
      MODEL.appendChild(opt);
    });
    MODEL.disabled = false;
  }

  function onModelChange() {
    const make = MAKE.value;
    const model = MODEL.value;
    if (!make || !model) {
      clearMeta();
      return;
    }
    const bike = (byMake[make] || []).find((b) => b.o === model) || {
      l: `${make} ${model}`,
      m: make,
      o: model,
      c: "unknown",
    };
    writeMeta(bike);
  }

  async function loadData() {
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch("/data/motorcycles.json", { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      laborBands = data.laborBands || {};
      byMake = {};
      (data.bikes || []).forEach((bike) => {
        if (!byMake[bike.m]) byMake[bike.m] = [];
        byMake[bike.m].push(bike);
      });
      fillMakes();
      if (MAKE.value) fillModels(MAKE.value);
    } catch (err) {
      console.warn("Bike index failed to load", err);
      MAKE.innerHTML = "";
      MAKE.appendChild(option("", "Couldn’t load makes — refresh", true));
      resetModels("Unavailable");
    }
  }

  MAKE.addEventListener("change", () => {
    fillModels(MAKE.value);
  });

  MODEL.addEventListener("change", onModelChange);

  MAKE.addEventListener("focus", loadData);
  MODEL.addEventListener("focus", loadData);
  YEAR.addEventListener("focus", loadData);

  resetModels("Select make first");

  const preloadRoot =
    document.getElementById("quote") ||
    document.getElementById("inquiry") ||
    FORM;
  if (preloadRoot && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadData();
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(preloadRoot);
  } else {
    loadData();
  }
})();
