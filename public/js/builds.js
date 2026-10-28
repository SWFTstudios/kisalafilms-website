/**
 * Published builds from /api/builds.
 *
 * On /builds, each published build becomes a card ahead of the "your bike
 * here" slots, and one slot is dropped per build so the grid stays tidy.
 * On /builds/view?b=<id>, the page is filled in with that build.
 *
 * Built with DOM calls and textContent only: titles and summaries are typed
 * in the admin.
 */
(() => {
  const feed = document.querySelector("[data-builds-feed]");
  const title = document.querySelector("[data-build-title]");
  if (!feed && !title) return;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    });
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  }

  fetch("/api/builds")
    .then((r) => r.json())
    .then(({ builds }) => (feed ? list(builds || []) : view(builds || [])))
    .catch(() => {});

  function list(builds) {
    if (!builds.length) return;
    const slots = [...document.querySelectorAll("[data-build-slot]")];
    const cards = builds.map((b) =>
      h("a", { class: "build-card", href: `/builds/view?b=${encodeURIComponent(b.id)}` },
        h("figure", null,
          h("div", { class: "frame" }, b.cover ? h("img", { src: b.cover, alt: b.title, loading: "lazy" }) : null),
          h("figcaption", null,
            h("div", null, h("h3", { text: b.title }), h("p", { class: "meta", text: [b.service, b.finish].filter(Boolean).join(" · ") })),
            h("span", { class: "link-line", text: "View build" })))));
    // Cards go straight into the grid, where the placeholder slots sit.
    feed.replaceWith(...cards);
    slots.slice(0, builds.length).forEach((s) => s.remove());
  }

  function view(builds) {
    const id = new URLSearchParams(location.search).get("b");
    const b = builds.find((x) => x.id === id);
    if (!b) {
      title.textContent = "Build not found.";
      return;
    }
    document.title = `${b.title} | K Films Builds`;
    title.textContent = b.title;
    document.querySelector("[data-build-summary]").textContent = b.summary || `${b.service || "A build"} from the Jersey City studio.`;
    const spec = document.querySelector("[data-build-spec]");
    [["Bike", b.bike], ["Service", b.service], ["Finish", b.finish], ["Colour", b.colour]]
      .filter(([, v]) => v)
      .forEach(([k, v]) => spec.append(h("div", null, h("dt", { class: "label", text: k }), h("dd", { text: v }))));
    const gallery = document.querySelector("[data-build-gallery]");
    b.photos.forEach((p, i) => {
      const size = i === 0 ? "g-full" : i % 5 < 3 ? "g-half" : "g-third";
      gallery.append(h("figure", { class: size }, h("img", { src: p.url, alt: p.caption || b.title, loading: "lazy" })));
    });
  }
})();
