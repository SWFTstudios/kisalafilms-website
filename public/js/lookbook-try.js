/**
 * Lookbook “Try the wrap”: pick a film, drop a bike photo, generate a
 * concept mockup on canvas, then email it via FormSubmit (garage + CC user).
 */
(() => {
  const ROOT = document.querySelector("[data-try-wrap]");
  if (!ROOT) return;

  const filmHost = ROOT.querySelector("[data-try-film]");
  const dropzone = ROOT.querySelector("[data-try-dropzone]");
  const photoInput = ROOT.querySelector("[data-try-photo]");
  const dropCopy = ROOT.querySelector("[data-try-drop-copy]");
  const photoPreview = ROOT.querySelector("[data-try-photo-preview]");
  const generateBtn = ROOT.querySelector("[data-try-generate]");
  const downloadBtn = ROOT.querySelector("[data-try-download]");
  const statusEl = ROOT.querySelector("[data-try-status]");
  const result = ROOT.querySelector("[data-try-result]");
  const canvas = ROOT.querySelector("[data-try-canvas]");
  const form = ROOT.querySelector("[data-try-form]");
  const sent = ROOT.querySelector("[data-try-sent]");
  const againBtn = ROOT.querySelector("[data-try-again]");
  const studioLink = ROOT.querySelector("[data-try-studio]");

  const ccField = ROOT.querySelector("[data-try-cc]");
  const attachInput = ROOT.querySelector("[data-try-attachment]");
  const filmNameField = ROOT.querySelector("[data-try-film-name]");
  const filmHandleField = ROOT.querySelector("[data-try-film-handle]");
  const filmBrandField = ROOT.querySelector("[data-try-film-brand]");
  const filmFinishField = ROOT.querySelector("[data-try-film-finish]");
  const filmUrlField = ROOT.querySelector("[data-try-film-url]");

  /** @type {Record<string, unknown> | null} */
  let film = null;
  /** @type {HTMLImageElement | null} */
  let bikeImage = null;
  /** @type {Blob | null} */
  let mockupBlob = null;

  const MAX_BYTES = 8 * 1024 * 1024;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function proxiedFilmSrc(src) {
    if (!src) return "";
    try {
      const host = new URL(src, window.location.origin).hostname;
      if (
        host === "cdn.shopify.com" ||
        host === "metrorestyling.com" ||
        host.endsWith(".myshopify.com")
      ) {
        return `/api/image-proxy?url=${encodeURIComponent(src)}`;
      }
    } catch (_) {
      /* keep original */
    }
    return src;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = src;
    });
  }

  function sampleFilmColor(img) {
    const c = document.createElement("canvas");
    const size = 48;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Skip near-white / near-black borders on swatch shots.
      const rr = data[i];
      const gg = data[i + 1];
      const bb = data[i + 2];
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      if (max < 18 || min > 245) continue;
      r += rr;
      g += gg;
      b += bb;
      n += 1;
    }
    if (!n) return { r: 40, g: 40, b: 40 };
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    if (!s) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    };
  }

  async function generateMockup() {
    if (!film || !bikeImage || !canvas) return;
    setStatus("Generating concept mockup…");
    generateBtn.disabled = true;

    try {
      const filmSrc = proxiedFilmSrc(String(film.image_url || ""));
      let filmImg = null;
      if (filmSrc) {
        try {
          filmImg = await loadImage(filmSrc);
        } catch (_) {
          filmImg = null;
        }
      }
      const target = filmImg
        ? sampleFilmColor(filmImg)
        : { r: 32, g: 32, b: 32 };
      const targetHsl = rgbToHsl(target.r, target.g, target.b);

      const maxW = 1200;
      const scale = Math.min(1, maxW / bikeImage.naturalWidth);
      const w = Math.round(bikeImage.naturalWidth * scale);
      const h = Math.round(bikeImage.naturalHeight * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bikeImage, 0, 0, w, h);

      const image = ctx.getImageData(0, 0, w, h);
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const hsl = rgbToHsl(r, g, b);
        // Prefer midtones (body panels) over deep shadows / blown highlights.
        const mid = 1 - Math.abs(hsl.l - 0.45) * 2;
        const strength = Math.max(0, Math.min(1, mid)) * 0.78;
        const next = hslToRgb(
          targetHsl.h,
          Math.min(1, targetHsl.s * 0.95 + hsl.s * 0.15),
          hsl.l * (1 - strength * 0.08) + targetHsl.l * strength * 0.08
        );
        d[i] = Math.round(r * (1 - strength) + next.r * strength);
        d[i + 1] = Math.round(g * (1 - strength) + next.g * strength);
        d[i + 2] = Math.round(b * (1 - strength) + next.b * strength);
      }
      ctx.putImageData(image, 0, 0);

      // Soft film texture wash for material presence.
      if (filmImg) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.globalCompositeOperation = "overlay";
        ctx.drawImage(filmImg, 0, 0, w, h);
        ctx.restore();
      }

      // Film chip + watermark.
      const chip = Math.round(Math.min(w, h) * 0.16);
      const pad = Math.round(chip * 0.18);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(pad, pad, chip + pad * 2, chip + pad * 3.2);
      if (filmImg) ctx.drawImage(filmImg, pad * 1.5, pad * 1.5, chip, chip);
      else {
        ctx.fillStyle = `rgb(${target.r},${target.g},${target.b})`;
        ctx.fillRect(pad * 1.5, pad * 1.5, chip, chip);
      }
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.max(11, Math.round(chip * 0.16))}px Archivo, sans-serif`;
      ctx.fillText("TRY THE WRAP", pad * 1.5, pad * 1.5 + chip + pad * 1.1);
      ctx.font = `500 ${Math.max(10, Math.round(chip * 0.13))}px Mulish, sans-serif`;
      const label = String(film.name || "Film").slice(0, 28);
      ctx.fillText(label, pad * 1.5, pad * 1.5 + chip + pad * 2.1);

      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `500 ${Math.max(10, Math.round(w * 0.014))}px Mulish, sans-serif`;
      ctx.fillText("Kisala Films · concept preview", pad, h - pad);

      mockupBlob = await new Promise((resolve) =>
        canvas.toBlob((blob) => resolve(blob), "image/png", 0.92)
      );

      result.hidden = false;
      form.hidden = false;
      if (downloadBtn) downloadBtn.hidden = !mockupBlob;
      setStatus("Mockup ready — download it or email it to yourself.");
      window.KisalaTrack?.("try_wrap_generate", {
        label: String(film.name || ""),
        handle: String(film.handle || ""),
      });
    } catch (err) {
      console.error(err);
      setStatus(
        "Couldn’t build that mockup. Try another photo, or a film with a swatch image."
      );
    } finally {
      syncGenerateEnabled();
    }
  }

  function renderFilm() {
    if (!filmHost) return;
    if (!film) {
      filmHost.innerHTML =
        '<p class="kf-try-empty">Tap <strong>Try</strong> on any colour above to start — or keep browsing.</p>';
      return;
    }
    const name = film.name || "Untitled";
    const meta = [film.brand, film.finish, film.sku].filter(Boolean).join(" · ");
    const img = film.image_url
      ? `<img src="${escapeHtml(String(film.image_url))}" alt="${escapeHtml(
          String(name)
        )}" width="320" height="320" loading="lazy">`
      : "";
    filmHost.innerHTML = `
      <div class="kf-try-film-card">
        <div class="kf-try-film-media">${img}</div>
        <div class="kf-try-film-copy">
          <p class="eyebrow">Selected film</p>
          <h3>${escapeHtml(String(name))}</h3>
          <p class="meta">${escapeHtml(meta)}</p>
          <button type="button" class="btn btn-ghost" data-try-clear-film>Change colour</button>
        </div>
      </div>
    `;
    filmHost.querySelector("[data-try-clear-film]")?.addEventListener("click", () => {
      selectFilm(null);
    });

    if (filmNameField) filmNameField.value = String(film.name || "");
    if (filmHandleField) filmHandleField.value = String(film.handle || "");
    if (filmBrandField) filmBrandField.value = String(film.brand || "");
    if (filmFinishField) filmFinishField.value = String(film.finish || "");
    if (filmUrlField) {
      filmUrlField.value = String(
        film.metro_url ||
          (film.handle
            ? `https://metrorestyling.com/products/${film.handle}`
            : "")
      );
    }
    if (studioLink && film.handle) {
      studioLink.href = `/wrap-studio?finish=${encodeURIComponent(
        String(film.finish || "")
      )}&film=${encodeURIComponent(String(film.handle))}`;
    }
  }

  function syncGenerateEnabled() {
    if (generateBtn) generateBtn.disabled = !(film && bikeImage);
  }

  function selectFilm(next) {
    film = next;
    mockupBlob = null;
    if (result) result.hidden = true;
    if (form) form.hidden = true;
    if (downloadBtn) downloadBtn.hidden = true;
    if (sent) sent.hidden = true;
    renderFilm();
    syncGenerateEnabled();
    setStatus(
      film && bikeImage
        ? "Ready — generate your concept mockup."
        : film
          ? "Film locked in. Drop a bike photo next."
          : "Choose a film and a photo to generate a concept preview."
    );
    document.querySelectorAll(".kf-lookbook-card.is-trying").forEach((el) => {
      el.classList.remove("is-trying");
    });
    if (film?.handle) {
      const handle = String(film.handle);
      document.querySelectorAll(".kf-lookbook-card[data-film-handle]").forEach((el) => {
        if (el.getAttribute("data-film-handle") === handle) el.classList.add("is-trying");
      });
    }
  }

  function setPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setStatus("That file isn’t an image. Use a JPG or PNG of the bike.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("Photo is over 8 MB — compress it a little and try again.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bikeImage = img;
      if (photoPreview) {
        photoPreview.src = url;
        photoPreview.hidden = false;
      }
      if (dropCopy) dropCopy.hidden = true;
      dropzone?.classList.add("has-photo");
      mockupBlob = null;
      if (result) result.hidden = true;
      if (form) form.hidden = true;
      syncGenerateEnabled();
      setStatus(
        film ? "Ready — generate your concept mockup." : "Photo loaded. Pick a film above, then generate."
      );
    };
    img.onerror = () => setStatus("Couldn’t read that photo. Try another file.");
    img.src = url;
  }

  dropzone?.addEventListener("click", () => photoInput?.click());
  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      photoInput?.click();
    }
  });
  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (file) setPhoto(file);
  });

  ["dragenter", "dragover"].forEach((type) => {
    dropzone?.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    dropzone?.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-over");
    });
  });
  dropzone?.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) setPhoto(file);
  });

  generateBtn?.addEventListener("click", () => {
    generateMockup();
  });

  downloadBtn?.addEventListener("click", () => {
    if (!mockupBlob) return;
    const a = document.createElement("a");
    const handle = String(film?.handle || "wrap");
    a.href = URL.createObjectURL(mockupBlob);
    a.download = `kisala-try-wrap-${handle}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  form?.addEventListener("submit", async (e) => {
    if (!mockupBlob || !film) {
      e.preventDefault();
      setStatus("Generate a mockup before emailing it.");
      return;
    }
    const email = String(form.querySelector('[name="email"]')?.value || "").trim();
    if (!email) return;

    // CC the rider so FormSubmit delivers the submission (with PNG) to them too.
    if (ccField) ccField.value = email;

    if (attachInput && typeof DataTransfer === "function") {
      const file = new File(
        [mockupBlob],
        `kisala-try-wrap-${film.handle || "mockup"}.png`,
        { type: "image/png" }
      );
      const bucket = new DataTransfer();
      bucket.items.add(file);
      attachInput.files = bucket.files;
    } else {
      e.preventDefault();
      setStatus("This browser can’t attach the mockup. Download it, then email the garage.");
      return;
    }

    window.KisalaTrack?.("try_wrap_email", {
      label: String(film.name || ""),
      handle: String(film.handle || ""),
    });
    setStatus("Sending mockup…");
  });

  againBtn?.addEventListener("click", () => {
    if (sent) sent.hidden = true;
    selectFilm(null);
    if (typeof ROOT.scrollIntoView === "function") {
      ROOT.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Deep links: /lookbook?try=<handle> or ?try=sent
  const params = new URLSearchParams(window.location.search);
  const tryParam = (params.get("try") || "").trim();
  if (tryParam === "sent") {
    if (sent) sent.hidden = false;
    if (form) form.hidden = true;
    setStatus("Mockup emailed — check your inbox.");
    if (typeof ROOT.scrollIntoView === "function") {
      ROOT.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  window.KisalaTryWrap = {
    selectFilm: (next) => {
      selectFilm(next);
      if (typeof ROOT.scrollIntoView === "function") {
        ROOT.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    selected: () => film,
  };

  // Prefill from ?try=handle once the lookbook catalogue is ready.
  if (tryParam && tryParam !== "sent") {
    const boot = async () => {
      try {
        const res = await fetch(`/api/films/${encodeURIComponent(tryParam)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.film) window.KisalaTryWrap.selectFilm(data.film);
      } catch (_) {
        /* ignore */
      }
    };
    boot();
  }

  renderFilm();
  syncGenerateEnabled();
})();
