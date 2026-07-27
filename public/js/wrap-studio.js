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
    write("colour", form.querySelector("[data-vinyl-label]")?.value || "");

    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map((el) => el.value);
    write("addons", addons.join(", "));

    write(
      "photos",
      photos.length ? `${photos.length} attached · ${mb(total())} MB` : ""
    );
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
    }
  });

  updateSummary();
})();
