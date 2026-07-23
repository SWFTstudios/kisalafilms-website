/* Kisala Films — journal reader.
   Renders a single mixed-media entry (video / audio / photos / text) from
   /data/journal.json, or an index of all entries when no ?e=slug is given. */

(() => {
  const mount = document.querySelector("[data-journal]");
  if (!mount) return;

  const params = new URLSearchParams(location.search);
  const slug = (params.get("e") || location.hash.replace(/^#/, "")).trim();

  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MEDIA = {
    video: { glyph: "\u25B6", label: "VIDEO" },
    audio: { glyph: "\u25CF", label: "AUDIO" },
    mixed: { glyph: "\u25A3", label: "MIXED MEDIA" },
  };

  function fmtCoord(lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number") return "";
    return `${lat.toFixed(4)}\u00B0, ${lng.toFixed(4)}\u00B0`;
  }

  function badge(media) {
    const m = MEDIA[media] || MEDIA.mixed;
    return `<span class="jr-media-badge" data-media="${esc(media)}">${m.glyph} ${m.label}</span>`;
  }

  function renderBlock(b) {
    switch (b.type) {
      case "heading":
        return `<h2 class="jr-heading">${esc(b.value)}</h2>`;
      case "text":
        return `<p class="body-copy">${esc(b.value)}</p>`;
      case "quote":
        return `<blockquote class="jr-quote">${esc(b.value)}</blockquote>`;
      case "image":
        return `<figure class="jr-figure"><img src="${esc(b.src)}" alt="${esc(b.alt || "")}" loading="lazy">${
          b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
        }</figure>`;
      case "gallery":
        return `<div class="jr-gallery">${(b.images || [])
          .map((im) => `<figure class="jr-figure"><img src="${esc(im.src)}" alt="${esc(im.alt || "")}" loading="lazy"></figure>`)
          .join("")}</div>`;
      case "video":
        return `<figure class="jr-figure"><div class="jr-video"><iframe src="https://player.vimeo.com/video/${esc(
          b.vimeo
        )}?title=0&byline=0&portrait=0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="${esc(
          b.caption || "Journal video"
        )}"></iframe></div>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
      case "audio":
        if (b.src) {
          return `<figure class="jr-figure"><div class="jr-audio"><span class="jr-audio-title">${esc(
            b.title || "Field audio"
          )}</span><audio controls preload="none" src="${esc(b.src)}"></audio></div>${
            b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
          }</figure>`;
        }
        return `<figure class="jr-figure"><div class="jr-audio is-empty"><span class="jr-audio-title">${esc(
          b.title || "Field audio"
        )}</span><span class="jr-audio-note">&#9679; AUDIO &mdash; COMING SOON</span></div>${
          b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
        }</figure>`;
      default:
        return "";
    }
  }

  function renderEntry(entry, entries) {
    document.title = `${entry.title} — Kisala Films Journal`;
    const idx = entries.findIndex((e) => e.slug === entry.slug);
    const prev = idx > 0 ? entries[idx - 1] : null;
    const next = idx < entries.length - 1 ? entries[idx + 1] : null;

    mount.innerHTML = `
      <article class="jr-entry">
        <header class="jr-head" ${entry.cover ? `style="--cover:url('${esc(entry.cover)}')"` : ""}>
          <div class="jr-head-inner">
            <a class="jr-back" href="/journal.html">&larr; ALL ENTRIES</a>
            ${badge(entry.media)}
            <h1 class="jr-title">${esc(entry.title)}</h1>
            <div class="jr-meta">
              <span class="jr-date">${esc(entry.date)}</span>
              <span class="jr-place">${esc(entry.place)}</span>
              <span class="jr-coord">${fmtCoord(entry.lat, entry.lng)}</span>
            </div>
          </div>
        </header>
        <div class="jr-body">
          ${(entry.blocks || []).map(renderBlock).join("")}
        </div>
        <nav class="jr-pager">
          ${prev ? `<a class="jr-pager-link" href="/journal.html?e=${esc(prev.slug)}"><span>&larr; PREVIOUS</span><b>${esc(prev.title)}</b></a>` : "<span></span>"}
          ${next ? `<a class="jr-pager-link jr-pager-next" href="/journal.html?e=${esc(next.slug)}"><span>NEXT &rarr;</span><b>${esc(next.title)}</b></a>` : "<span></span>"}
        </nav>
        <div class="jr-return"><a href="/about.html#timeline">&larr; BACK TO THE TIMELINE</a></div>
      </article>`;
  }

  function renderIndex(entries) {
    document.title = "Journal — Kisala Films";
    const cards = entries
      .map((e) => {
        const m = MEDIA[e.media] || MEDIA.mixed;
        return `<a class="jr-card" href="/journal.html?e=${esc(e.slug)}" data-media="${esc(e.media)}">
          <span class="jr-card-cover" style="background-image:url('${esc(e.cover || "")}')"></span>
          <span class="jr-card-body">
            <span class="jr-card-top"><span class="jr-card-year">${esc(e.year)}</span>${badge(e.media)}</span>
            <span class="jr-card-title">${esc(e.title)}</span>
            <span class="jr-meta">
              <span class="jr-date">${esc(e.date)}</span>
              <span class="jr-coord">${fmtCoord(e.lat, e.lng)}</span>
            </span>
            <span class="jr-card-place">${esc(e.place)}</span>
          </span>
        </a>`;
      })
      .join("");

    mount.innerHTML = `
      <section class="page-hero">
        <span class="eyebrow">THE JOURNAL</span>
        <h1>FIELD<br><em>ENTRIES.</em></h1>
        <p class="lede">Geotagged, dated dispatches from the road &mdash; video, audio, and mixed-media tapes.</p>
      </section>
      <section class="section">
        <div class="jr-index">${cards}</div>
      </section>`;
  }

  function fail(msg) {
    mount.innerHTML = `
      <section class="page-hero">
        <span class="eyebrow">THE JOURNAL</span>
        <h1>SIGNAL<br><em>LOST.</em></h1>
        <p class="lede">${esc(msg)}</p>
        <p style="margin-top:20px"><a href="/journal.html" style="color:var(--lime);border-bottom:1px solid var(--lime)">Back to all entries</a></p>
      </section>`;
  }

  fetch("/data/journal.json")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load journal");
      return r.json();
    })
    .then((data) => {
      const entries = (data && data.entries) || [];
      if (!entries.length) return fail("No entries yet. Check back after the next trip.");
      if (slug) {
        const entry = entries.find((e) => e.slug === slug);
        if (entry) return renderEntry(entry, entries);
        return fail("That entry isn't in the crate. It may have moved.");
      }
      renderIndex(entries);
    })
    .catch(() => fail("Couldn't reach the journal archive. Try again in a moment."));
})();
