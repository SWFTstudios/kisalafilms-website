/**
 * Shared pieces for the client portal and the studio admin: a tiny DOM
 * builder, formatting, a toast, the photo lightbox and grid, and the on-device
 * photo resize. Loaded before portal.js and admin.js as window.KFUI.
 *
 * Everything here builds with DOM calls and textContent, never innerHTML with
 * data, so text typed by riders or the studio can't become markup.
 */
(() => {
  /* ---- Tiny DOM helper -------------------------------------------------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }
  const arrow = () => h("span", { class: "btn-arrow", "aria-hidden": "true" });
  const money = (cents) => "$" + (Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 });
  const when = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const whenTime = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  function toast(text) {
    const el = h("div", { class: "portal-toast", role: "status", text });
    document.body.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* ---- Lightbox --------------------------------------------------------- */
  function lightbox(urls, start) {
    let i = start;
    const img = h("img", { alt: "" });
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
    const show = () => { img.src = urls[i]; };
    const step = (d) => { i = (i + d + urls.length) % urls.length; show(); };
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const box = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": "Photo", onclick: (e) => { if (e.target === box) close(); } },
      img,
      h("button", { class: "btn btn--small lightbox-close", type: "button", onclick: close }, "Close"),
      urls.length > 1 ? h("div", { class: "lightbox-nav" },
        h("button", { class: "btn btn--small", type: "button", onclick: () => step(-1) }, "Previous"),
        h("button", { class: "btn btn--small", type: "button", onclick: () => step(1) }, "Next")) : null);
    document.body.append(box);
    document.addEventListener("keydown", onKey);
    show();
    box.querySelector(".lightbox-close").focus();
  }

  function photoGrid(photos, extra) {
    const urls = photos.map((p) => p.url);
    return h("div", { class: "photo-grid" },
      photos.map((p, i) => h("button", { type: "button", "aria-label": "Open photo", onclick: () => lightbox(urls, i) },
        h("img", { src: p.url, alt: p.caption || "", loading: "lazy" }))),
      extra || null);
  }

  /* Resize on the device before upload, as the intake form does. */
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return (await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85))) || file;
    } catch (e) {
      return file;
    }
  }

  window.KFUI = { h, arrow, money, when, whenTime, toast, lightbox, photoGrid, shrink };
})();
