/**
 * GA4 plus the site's event layer.
 *
 * Anything with data-track reports itself on click:
 *   <a data-track="cta_click" data-track-label="home-hero">
 *
 * Other modules report through window.KisalaTrack(name, params), which is safe
 * to call whether or not this file loaded — see the no-op fallback at the end.
 *
 * The conversion to count is wrap_studio_lead on /thanks.html, not generate_lead
 * on submit: the Wrap Studio posts natively and the browser tears down the page
 * mid-request, so a submit-time beacon can be cut off before it lands. The
 * redirect target is the only thing that proves the POST completed.
 */
(() => {
  const settings = (window.KISALA_CONFIG && window.KISALA_CONFIG.analytics) || {};
  const ID = settings.ga4;
  const ON = settings.enabled !== false && Boolean(ID);

  if (ON) {
    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ID);

    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
    document.head.appendChild(tag);
  }

  function track(name, params) {
    if (!name) return;
    if (!ON || typeof window.gtag !== "function") return;
    window.gtag("event", name, params || {});
  }

  window.KisalaTrack = track;

  /* ---- Declarative clicks ----------------------------------------------- */
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest("[data-track]");
      if (!el) return;

      const params = {};
      Object.keys(el.dataset).forEach((key) => {
        if (key === "track" || !key.startsWith("track")) return;
        // data-track-label → label, data-track-service → service
        const name = key.slice(5).replace(/^[A-Z]/, (c) => c.toLowerCase());
        params[name] = el.dataset[key];
      });

      if (!params.label) {
        params.label = el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 80);
      }
      track(el.getAttribute("data-track"), params);
    },
    // Capture, so a link that navigates still reports before the page unloads.
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const link = e.target.closest('a[href^="mailto:"]');
      if (link) track("email_click", { label: link.getAttribute("href").replace("mailto:", "") });
      const tel = e.target.closest('a[href^="tel:"]');
      if (tel) track("phone_click", { label: tel.getAttribute("href").replace("tel:", "") });
    },
    true
  );

  /* ---- Page-level signals ----------------------------------------------- */
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    const path = window.location.pathname.replace(/\/index\.html$/, "/");

    if (document.querySelector("[data-wrap-studio]")) {
      track("view_wrap_studio", { label: path });
    }

    if (/^\/thanks(\.html)?$/.test(path)) {
      // The build sheet is in the inbox. This is the conversion.
      track("wrap_studio_lead", { label: "wrap-studio", value: 1 });
    }

    const local = document.querySelector("[data-local-zone]");
    if (local) {
      track("view_local_page", { label: local.getAttribute("data-local-zone") });
    }
  });
})();
