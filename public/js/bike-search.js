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
  if (!YEAR || !MAKE || !MODEL || !FORM) return;

  const META = {
    bodyClass: FORM.querySelector("[data-bike-body-class]"),
    difficulty: FORM.querySelector("[data-bike-difficulty]"),
    hoursLow: FORM.querySelector("[data-bike-hours-low]"),
    hoursHigh: FORM.querySelector("[data-bike-hours-high]"),
    laborLabel: FORM.querySelector("[data-bike-labor-label]"),
  };

  let byMake = {};
  let laborBands = {};
  let loaded = false;
  let loading = null;

  function option(value, label) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
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
    MODEL.appendChild(option("", placeholder || "Select model"));
    MODEL.disabled = true;
    clearMeta();
  }

  function fillMakes() {
    const selected = MAKE.value;
    const makes = Object.keys(byMake).sort((a, b) => a.localeCompare(b));
    MAKE.innerHTML = "";
    MAKE.appendChild(option("", "Select make"));
    makes.forEach((make) => MAKE.appendChild(option(make, make)));
    MAKE.appendChild(option("Other", "Other / not listed"));
    if (selected) MAKE.value = selected;
  }

  function fillModels(make) {
    resetModels(make ? "Select model" : "Select make first");
    if (!make) return;

    if (make === "Other") {
      MODEL.appendChild(option("See notes", "See notes / will describe"));
      MODEL.disabled = false;
      MODEL.value = "See notes";
      writeMeta({ l: "Other (see notes)", m: "Other", o: "See notes", c: "unknown" });
      return;
    }

    if (!byMake[make]) return;
    const models = byMake[make].slice().sort((a, b) => a.o.localeCompare(b.o));
    models.forEach((bike) => {
      MODEL.appendChild(option(bike.o, bike.o));
    });
    MODEL.appendChild(option("Other / not listed", "Other / not listed"));
    MODEL.disabled = false;
  }

  function onModelChange() {
    const make = MAKE.value;
    const model = MODEL.value;
    if (!make || !model) {
      clearMeta();
      return;
    }
    if (make === "Other" || model === "Other / not listed" || model === "See notes") {
      writeMeta({
        l: `${make} ${model}`,
        m: make,
        o: model,
        c: "unknown",
      });
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
    if (loading) return loading;
    loading = (async () => {
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
        loaded = true;
        fillMakes();
        if (MAKE.value) fillModels(MAKE.value);
      } catch (err) {
        console.warn("Bike index failed to load", err);
        MAKE.innerHTML = "";
        MAKE.appendChild(option("", "Couldn’t load list — use Other"));
        MAKE.appendChild(option("Other", "Other / not listed"));
        resetModels("Select make first");
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  MAKE.addEventListener("change", () => {
    fillModels(MAKE.value);
  });

  MODEL.addEventListener("change", onModelChange);

  MAKE.addEventListener("focus", loadData);
  MODEL.addEventListener("focus", loadData);
  YEAR.addEventListener("focus", loadData);

  // Before FormSubmit POST: enable selects, sync bike label, clear honeypot
  FORM.addEventListener("submit", () => {
    const honey = FORM.querySelector('input[name="_honey"]');
    if (honey) honey.value = "";
    if (MODEL.disabled && MAKE.value) {
      // Shouldn't happen after make pick; re-enable so value posts
      MODEL.disabled = false;
    }
    onModelChange();
    if (BIKE_HIDDEN && !BIKE_HIDDEN.value && MAKE.value && MODEL.value) {
      BIKE_HIDDEN.value = `${MAKE.value} ${MODEL.value}`;
    }
  });

  resetModels("Select make first");
  // Prefetch immediately so mobile users don't wait on first tap
  loadData();
})();
