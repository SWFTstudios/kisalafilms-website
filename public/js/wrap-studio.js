/**
 * Wrap Studio: photo attachments + live build summary.
 *
 * The form posts natively as multipart/form-data because FormSubmit only
 * delivers attachments on the standard endpoint — its AJAX endpoint silently
 * drops files. Everything here is progressive enhancement on top of that.
 */
(() => {
  const form = document.querySelector("[data-wrap-studio]");
  if (!form) return;

  /* ---- Photo attachments ------------------------------------------------ */
  const input = form.querySelector("[data-photo-input]");
  const dropzone = form.querySelector("[data-dropzone]");
  const previews = form.querySelector("[data-photo-previews]");
  const meter = form.querySelector("[data-photo-meter]");
  const countOut = form.querySelector("[data-photo-count]");
  const sizeOut = form.querySelector("[data-photo-size]");
  const errorOut = form.querySelector("[data-photo-error]");

  // FormSubmit caps a submission at 10MB; hold back a megabyte for the fields.
  const MAX_TOTAL = 9 * 1024 * 1024;
  const MAX_FILES = 8;

  let photos = [];
  const previewUrls = new Map();
  const supportsDataTransfer = typeof DataTransfer === "function";

  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  const total = () => photos.reduce((sum, file) => sum + file.size, 0);

  function showError(message) {
    if (!errorOut) return;
    errorOut.textContent = message;
    errorOut.hidden = !message;
  }

  function syncInput() {
    if (!supportsDataTransfer) return;
    const bucket = new DataTransfer();
    photos.forEach((file) => bucket.items.add(file));
    input.files = bucket.files;
  }

  function renderPhotos() {
    if (!previews) return;

    previewUrls.forEach((url, file) => {
      if (!photos.includes(file)) {
        URL.revokeObjectURL(url);
        previewUrls.delete(file);
      }
    });

    previews.innerHTML = "";
    photos.forEach((file, index) => {
      const figure = document.createElement("figure");
      figure.className = "upload-thumb";

      // HEIC and other camera formats often can't be decoded for a preview,
      // so the tile falls back to the filename rather than a broken image.
      if (/^image\//.test(file.type) && !/heic|heif/i.test(file.type)) {
        let url = previewUrls.get(file);
        if (!url) {
          url = URL.createObjectURL(file);
          previewUrls.set(file, url);
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        figure.appendChild(img);
      }

      const caption = document.createElement("figcaption");
      caption.textContent = file.name;
      figure.appendChild(caption);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "upload-remove";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.textContent = "\u00d7";
      remove.addEventListener("click", () => {
        photos.splice(index, 1);
        syncInput();
        renderPhotos();
        updateSummary();
      });
      figure.appendChild(remove);

      previews.appendChild(figure);
    });

    previews.hidden = photos.length === 0;

    if (meter) {
      meter.hidden = photos.length === 0;
      const bytes = total();
      meter.classList.toggle("is-over", bytes > MAX_TOTAL);
      if (countOut) countOut.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
      if (sizeOut) sizeOut.textContent = `${mb(bytes)} MB of 9 MB`;
    }
  }

  function addFiles(incoming) {
    const rejected = [];
    let bytes = total();

    Array.from(incoming).forEach((file) => {
      if (photos.length >= MAX_FILES) {
        rejected.push(`${file.name} (over ${MAX_FILES} photos)`);
        return;
      }
      if (photos.some((existing) => existing.name === file.name && existing.size === file.size)) {
        return;
      }
      if (bytes + file.size > MAX_TOTAL) {
        rejected.push(`${file.name} (would pass the 9 MB limit)`);
        return;
      }
      photos.push(file);
      bytes += file.size;
    });

    if (!supportsDataTransfer) {
      // Without DataTransfer the browser's own FileList is the source of truth,
      // so mirror it instead of managing our own list.
      photos = Array.from(input.files || []);
    } else {
      syncInput();
    }

    showError(
      rejected.length
        ? `Skipped ${rejected.join(", ")}. Send the rest and I'll ask for more if I need them.`
        : ""
    );
    renderPhotos();
    updateSummary();
  }

  if (input) {
    input.addEventListener("change", () => {
      const picked = Array.from(input.files || []);
      if (!supportsDataTransfer) {
        photos = picked;
        renderPhotos();
        updateSummary();
        return;
      }
      // Reset to the managed list first so re-picking doesn't drop earlier files.
      syncInput();
      addFiles(picked);
    });
  }

  if (dropzone && supportsDataTransfer) {
    ["dragenter", "dragover"].forEach((type) =>
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.add("is-over");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-over");
      })
    );
    dropzone.addEventListener("drop", (e) => {
      const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => /^image\//.test(f.type));
      if (dropped.length) addFiles(dropped);
    });
  }

  /* ---- Deep links -------------------------------------------------------
     The home page finish tiles and service cards link straight in with the
     choice already made, e.g. /wrap-studio.html?finish=Matte             */
  const params = new URLSearchParams(window.location.search);

  const preselectFinish = params.get("finish");
  if (preselectFinish) {
    const select = form.querySelector('[name="finish"]');
    if (select && Array.from(select.options).some((o) => o.value === preselectFinish)) {
      select.value = preselectFinish;
    }
  }

  const preselectService = params.get("service");
  if (preselectService) {
    const radio = form.querySelector(`input[name="service"][value="${CSS.escape(preselectService)}"]`);
    if (radio) radio.checked = true;
  }

  /* Prefill a catalogue film into the saved-films shortlist when linked from vinyl catalog. */
  const preselectFilm = (params.get("film") || "").trim();
  if (preselectFilm) {
    try {
      const key = "kisala-saved-films";
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      const handles = Array.isArray(list) ? list : [];
      if (!handles.includes(preselectFilm)) {
        handles.unshift(preselectFilm);
        localStorage.setItem(key, JSON.stringify(handles.slice(0, 24)));
      }
      const field = form.querySelector("[data-saved-films-field]");
      if (field) {
        field.value = handles.join("\n");
        field.dataset.count = String(handles.length);
      }
      document.querySelector("[data-saved-films-note]")?.replaceChildren(
        document.createTextNode(`Catalogue film loaded: ${preselectFilm}`)
      );
    } catch (err) {
      console.warn("Could not prefill film", err);
    }
  }

  /* ---- Getting the bike here -------------------------------------------
     The zone select and the fee attributes are written by config-apply.js, so
     the numbers here are whatever kisala-config.js says they are.          */
  const transportDetail = form.querySelector("[data-transport-detail]");
  const zoneSelect = form.querySelector('[name="pickup_zone"]');
  const zoneHint = form.querySelector("[data-zone-hint]");
  const transportField = document.querySelector("[data-transport-field]");

  /** Selected radio, or null before anything is picked. */
  const transportChoice = () => form.querySelector('input[name="transport"]:checked');

  /** True for the options where I have to travel to the bike. */
  function transportNeedsZone(choice) {
    const fee = Number(choice?.dataset.fee || 0);
    return fee > 0 || /not sure/i.test(choice?.value || "");
  }

  function transportFee() {
    const choice = transportChoice();
    if (!choice) return 0;

    const base = Number(choice.dataset.fee || 0);
    if (!base) return 0;

    // A zone can carry its own floor. Quote the higher of the two so a longer
    // run is never under-quoted by the generic rate.
    const picked = zoneSelect?.selectedOptions?.[0];
    const zoneFrom = Number(picked?.dataset.pickupFrom || 0);
    if (!zoneFrom) return base;

    // Round trip is two legs, so scale the zone floor the same way the flat
    // fee relates to the one-way rate rather than assuming a single leg.
    const oneWay = window.KisalaConfig?.get("transport.pickup.fee") || zoneFrom;
    const legs = Math.max(1, Math.round(base / oneWay));
    return Math.max(base, zoneFrom * legs);
  }

  function renderTransport() {
    const choice = transportChoice();
    const needsZone = transportNeedsZone(choice);

    if (transportDetail) {
      transportDetail.hidden = !needsZone;
      // A hidden zone must not post a stale value from an earlier choice.
      if (!needsZone && zoneSelect) zoneSelect.value = "";
    }

    if (zoneHint && zoneSelect) {
      const picked = zoneSelect.selectedOptions?.[0];
      const available = picked?.dataset.available !== "0";
      const from = Number(picked?.dataset.pickupFrom || 0);
      if (!picked || !picked.value) {
        zoneHint.textContent = `Pickup starts at ${plain(window.KisalaConfig?.get("transport.pickup.from") || 75)} and depends on the run.`;
      } else if (!available) {
        zoneHint.textContent = "Outside the usual run — tell me where and I'll say honestly whether I can get to you.";
      } else {
        zoneHint.textContent = `${picked.value}: pickup from ${plain(from)}.`;
      }
    }
  }

  /* ---- Ballpark estimate ------------------------------------------------ */
  const estimateOut = document.querySelector("[data-estimate-out]");
  const estimateNote = document.querySelector("[data-estimate-note]");
  const estimateField = document.querySelector("[data-estimate-field]");
  const totalField = document.querySelector("[data-total-field]");

  const money = (n) => "$" + (Math.round(n / 25) * 25).toLocaleString("en-US");
  /** Unrounded, for fees that are already exact figures. */
  const plain = (n) => "$" + Number(n).toLocaleString("en-US");

  function estimate() {
    const service = form.querySelector('input[name="service"]:checked');
    if (!service) return null;

    let low = Number(service.dataset.priceLow || 0);
    let high = Number(service.dataset.priceHigh || 0);
    if (!low || !high) return null;

    // Prices are quoted for a mid-complexity bike. Stripping a full touring
    // fairing is a different job from wrapping a naked tank, so scale the
    // body-dependent services by the difficulty band the bike index reports.
    const difficulty = Number(form.querySelector("[data-bike-difficulty]")?.value || 0);
    let scaled = false;
    if (service.dataset.priceScales === "1" && difficulty) {
      const factor = 1 + 0.18 * (difficulty - 3);
      low *= factor;
      high *= factor;
      scaled = true;
    }

    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).reduce(
      (sum, el) => sum + Number(el.dataset.price || 0),
      0
    );

    return { low: low + addons, high: high + addons, addons, scaled, difficulty };
  }

  function renderEstimate() {
    const fee = transportFee();

    // Transport is quoted on its own line whether or not a service is picked,
    // so the pickup number never looks like part of the wrap price.
    if (transportField) transportField.value = fee ? plain(fee) : "";
    write("transportfee", fee ? `${plain(fee)} est.` : "");

    if (!estimateOut) return;
    const result = estimate();

    if (!result) {
      estimateOut.textContent = "Pick a service";
      if (estimateNote) {
        estimateNote.textContent = "Scales with how much bodywork your bike has to come apart.";
      }
      if (estimateField) estimateField.value = "";
      if (totalField) totalField.value = "";
      return;
    }

    const range = `${money(result.low)}–${money(result.high)}`;
    estimateOut.textContent = range;

    if (estimateNote) {
      const parts = [];
      if (result.scaled) {
        parts.push(
          result.difficulty >= 4
            ? "Adjusted up for your bike's bodywork."
            : result.difficulty <= 2
              ? "Adjusted down for your bike's bodywork."
              : "Adjusted for your bike's bodywork."
        );
      } else if (!result.difficulty) {
        parts.push("Pick your bike to sharpen this.");
      }
      if (result.addons) parts.push(`Includes ${money(result.addons)} of add-ons.`);
      if (fee) parts.push(`Transport adds about ${plain(fee)} on top.`);
      parts.push("A ballpark, not a quote — photos decide the real number.");
      estimateNote.textContent = parts.join(" ");
    }

    // ballpark_estimate stays wrap-only, the way it has always arrived in the
    // inbox. The combined figure rides along beside it instead of replacing it.
    if (estimateField) estimateField.value = range;
    if (totalField) {
      totalField.value = fee
        ? `${money(result.low + fee)}–${money(result.high + fee)}`
        : range;
    }
  }

  /* ---- Live build summary ----------------------------------------------- */
  const outs = {};
  document.querySelectorAll("[data-summary-out]").forEach((el) => {
    outs[el.getAttribute("data-summary-out")] = el;
  });

  function write(key, value) {
    const el = outs[key];
    if (!el) return;
    const empty = !value;
    el.textContent = empty ? el.dataset.placeholder || el.textContent : value;
    if (!el.dataset.placeholder) el.dataset.placeholder = empty ? el.textContent : el.dataset.placeholder;
    el.classList.toggle("is-empty", empty);
  }

  document.querySelectorAll("[data-summary-out]").forEach((el) => {
    el.dataset.placeholder = el.textContent;
  });

  function updateSummary() {
    const year = form.querySelector("[data-bike-year]")?.value || "";
    const make = form.querySelector("[data-bike-make]")?.value || "";
    const model = form.querySelector("[data-bike-model]")?.value || "";
    write("bike", [year, make, model].filter(Boolean).join(" "));

    write("service", form.querySelector('input[name="service"]:checked')?.value || "");
    write("finish", form.querySelector('[name="finish"]')?.value || "");
    write("coverage", form.querySelector('[name="coverage"]')?.value || "");
    write("timeline", form.querySelector('[name="timeline"]')?.value || "");
    write("budget", form.querySelector('[name="budget"]')?.value || "");
    write("colour", form.querySelector("[data-vinyl-label]")?.value || "");

    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map((el) => el.value);
    write("addons", addons.join(", "));

    // vinyl-catalog.js owns the shortlist, writes the hidden field and publishes
    // the count alongside it — film titles contain pipes and newlines of their
    // own, so the value is not safe to count by splitting.
    const savedCount = Number(document.querySelector("[data-saved-films-field]")?.dataset.count || 0);
    write("saved", savedCount ? `${savedCount} shortlisted` : "");

    const choice = transportChoice();
    const zone = zoneSelect && !transportDetail?.hidden ? zoneSelect.value : "";
    write("transport", [choice?.value, zone].filter(Boolean).join(" · "));

    write(
      "photos",
      photos.length ? `${photos.length} attached · ${mb(total())} MB` : ""
    );

    renderTransport();
    renderEstimate();
  }

  // The vinyl picker writes its hidden field programmatically, which fires no
  // event — re-read shortly after any interaction to catch it.
  const refresh = () => {
    updateSummary();
    setTimeout(updateSummary, 150);
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  form.addEventListener("click", refresh);

  form.addEventListener("submit", (e) => {
    if (total() > MAX_TOTAL) {
      e.preventDefault();
      showError("Those photos add up past 9 MB. Remove one or two and send again.");
      errorOut?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const email = (form.querySelector('[name="email"]')?.value || "").trim();
    const cc = form.querySelector("[data-studio-cc]");
    const replyto = form.querySelector("[data-studio-replyto]");
    if (cc) cc.value = email;
    if (replyto) replyto.value = email;

    // Compile a plain-text sheet so the rider’s CC’d copy is readable.
    const summaryField = form.querySelector("[data-build-summary]");
    if (summaryField && window.KisalaGarage?.compileBuildSheet) {
      const draft = window.KisalaGarage.collectDraft();
      summaryField.value = window.KisalaGarage.compileBuildSheet(draft);
    }
    window.KisalaGarage?.markSent?.();

    // Best-effort only. The native POST tears this page down, so the
    // conversion that actually gets counted is the one on /thanks.html.
    window.KisalaTrack?.("generate_lead", {
      label: form.querySelector('input[name="service"]:checked')?.value || "unknown",
      transport: transportChoice()?.value || "",
      budget: form.querySelector('[name="budget"]')?.value || "",
      photos: photos.length,
    });
  });

  updateSummary();
})();
