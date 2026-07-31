/**
 * Shared vinyl build cart — films added from the catalog land here so a rider
 * can gather colours, then open /project to place notes and photos.
 */
(() => {
  const KEY = "kisala-vinyl-build";
  const MAX_FILMS = 12;
  const MAX_IMAGES = 3;
  const MAX_IMAGE_DIM = 900;
  const MAX_IMAGE_BYTES = 450_000;

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || typeof raw !== "object") return { v: 1, films: [] };
      const films = Array.isArray(raw.films) ? raw.films.filter((f) => f && f.handle) : [];
      return { v: 1, films };
    } catch {
      return { v: 1, films: [] };
    }
  }

  function write(state) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ v: 1, films: state.films || [], updatedAt: Date.now() })
      );
    } catch {
      /* private mode / quota */
    }
    window.dispatchEvent(new CustomEvent("kisala-build-change"));
  }

  function normalizeFilm(input) {
    const handle = String(input.handle || input.h || "").trim();
    if (!handle) return null;
    return {
      handle,
      name: String(input.name || input.n || handle),
      brand: String(input.brand || input.v || ""),
      finish: String(input.finish || input.f || ""),
      sku: String(input.sku || ""),
      image_url: String(input.image_url || input.i || ""),
      color_family: String(input.color_family || input.c || ""),
      notes: String(input.notes || ""),
      placement: String(input.placement || ""),
      images: Array.isArray(input.images) ? input.images.slice(0, MAX_IMAGES) : [],
    };
  }

  function list() {
    return read().films.slice();
  }

  function count() {
    return read().films.length;
  }

  function get(handle) {
    const h = String(handle || "").trim();
    return read().films.find((f) => f.handle === h) || null;
  }

  function has(handle) {
    return !!get(handle);
  }

  /** Add or refresh a film. Returns the updated list. */
  function add(input) {
    const film = normalizeFilm(input);
    if (!film) return list();
    const state = read();
    const existing = state.films.find((f) => f.handle === film.handle);
    if (existing) {
      existing.name = film.name || existing.name;
      existing.brand = film.brand || existing.brand;
      existing.finish = film.finish || existing.finish;
      existing.sku = film.sku || existing.sku;
      existing.image_url = film.image_url || existing.image_url;
      existing.color_family = film.color_family || existing.color_family;
      // Move to front
      state.films = [existing, ...state.films.filter((f) => f.handle !== film.handle)];
    } else {
      state.films = [film, ...state.films].slice(0, MAX_FILMS);
    }
    write(state);
    return state.films.slice();
  }

  function remove(handle) {
    const h = String(handle || "").trim();
    const state = read();
    state.films = state.films.filter((f) => f.handle !== h);
    write(state);
    return state.films.slice();
  }

  function update(handle, patch) {
    const h = String(handle || "").trim();
    const state = read();
    const film = state.films.find((f) => f.handle === h);
    if (!film) return null;
    if (patch.notes != null) film.notes = String(patch.notes);
    if (patch.placement != null) film.placement = String(patch.placement);
    if (Array.isArray(patch.images)) film.images = patch.images.slice(0, MAX_IMAGES);
    write(state);
    return { ...film };
  }

  function clear() {
    write({ films: [] });
  }

  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || "")) {
        reject(new Error("Choose a photo (JPG or PNG)."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not open that photo."));
        img.onload = () => {
          const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not prepare that photo."));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          let quality = 0.72;
          let data = canvas.toDataURL("image/jpeg", quality);
          while (data.length > MAX_IMAGE_BYTES && quality > 0.4) {
            quality -= 0.08;
            data = canvas.toDataURL("image/jpeg", quality);
          }
          if (data.length > MAX_IMAGE_BYTES) {
            reject(new Error("That photo is still too large. Try a smaller one."));
            return;
          }
          resolve(data);
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function addImage(handle, file) {
    const film = get(handle);
    if (!film) throw new Error("Add this colour to your build first.");
    if ((film.images || []).length >= MAX_IMAGES) {
      throw new Error("You can attach up to " + MAX_IMAGES + " photos per colour.");
    }
    const dataUrl = await resizeImageFile(file);
    const images = (film.images || []).concat(dataUrl).slice(0, MAX_IMAGES);
    return update(handle, { images });
  }

  function removeImage(handle, index) {
    const film = get(handle);
    if (!film) return null;
    const images = (film.images || []).slice();
    images.splice(Number(index) || 0, 1);
    return update(handle, { images });
  }

  window.KisalaVinylBuild = {
    KEY,
    MAX_FILMS,
    MAX_IMAGES,
    list,
    count,
    get,
    has,
    add,
    remove,
    update,
    clear,
    addImage,
    removeImage,
  };
})();
