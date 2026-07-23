(() => {
  const root = document.querySelector("[data-z-timeline]");
  if (!root) return;

  const scroller = root.querySelector(".z-scroll");
  const stage = root.querySelector(".z-stage");
  const track = root.querySelector("[data-z-track]");
  const items = track ? [...track.querySelectorAll(".z-item")] : [];
  const rail = root.querySelector("[data-z-rail]");
  const count = root.querySelector("[data-z-count]");
  if (!scroller || !stage || !items.length) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Reduced motion / no support: keep the stacked CSS fallback (rail + dots). */
  if (prefersReduced) return;

  const N = items.length;
  const SPACING = 560; // z-depth between chapters
  const BOTTOM_PAD = 76; // gap between the path line and the bottom of the stage
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Per-card coordinates + the globe it drives (published by scene-boot). */
  const coords = items.map((el) => ({
    lat: parseFloat(el.getAttribute("data-lat")),
    lng: parseFloat(el.getAttribute("data-lng")),
  }));
  const hasCoords = coords.every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  let aboutGlobe = window.KisalaAboutGlobe || null;
  window.addEventListener("kisala:about-globe-ready", (e) => {
    aboutGlobe = e.detail;
  });
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpLng = (a, b, t) => {
    let d = ((b - a + 540) % 360) - 180; // shortest way around the globe
    return a + d * t;
  };

  scroller.style.height = `${(N + 1) * 100}vh`;
  root.classList.add("is-3d");

  /* Build the connecting path (nodes + segments) in the shared 3D space so it
     travels with the cards. Everything is a child of the track, positioned at
     base depth -i*SPACING; the whole track is pushed forward as you scroll.
     The path's vertical offset lives on the container so it can be re-centered
     to the bottom of the stage on resize. */
  const path = document.createElement("div");
  path.className = "z-path";
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const node = document.createElement("span");
    node.className = "z-node";
    node.style.transform = `translate(-50%, -50%) translateZ(${(-i * SPACING).toFixed(1)}px)`;
    path.appendChild(node);
    nodes.push(node);

    if (i < N - 1) {
      const seg = document.createElement("span");
      seg.className = "z-seg";
      seg.style.height = `${SPACING}px`;
      seg.style.transform = `translate(-50%, -50%) translateZ(${(-(i + 0.5) * SPACING).toFixed(1)}px) rotateX(90deg)`;
      path.appendChild(seg);
    }
  }
  track.insertBefore(path, track.firstChild);

  /* Push the path toward the bottom of the sticky stage (centered on X). */
  function positionPath(stageH) {
    const offsetY = Math.max(120, stageH / 2 - BOTTOM_PAD);
    path.style.transform = `translateY(${offsetY.toFixed(1)}px)`;
  }

  /* Cards sit at fixed base depth; only the track moves in Z. */
  items.forEach((el, i) => {
    el.style.transform = `translate(-50%, -50%) translateZ(${(-i * SPACING).toFixed(1)}px)`;
  });

  const pad2 = (n) => String(n).padStart(3, "0");
  let ticking = false;
  let lastActive = -1;

  function render() {
    ticking = false;
    const rect = scroller.getBoundingClientRect();
    const stageH = window.innerHeight;
    const distance = rect.height - stageH;
    if (distance <= 0) return;

    const p = clamp(-rect.top / distance, 0, 1);
    const active = p * (N - 1);

    positionPath(stageH);

    // Push the whole world forward so the active chapter reaches the camera.
    track.style.transform = `translateZ(${(active * SPACING).toFixed(1)}px)`;

    // Spin the globe to the location between the current and next chapter.
    if (aboutGlobe && hasCoords) {
      const i0 = clamp(Math.floor(active), 0, N - 1);
      const i1 = clamp(i0 + 1, 0, N - 1);
      const f = active - i0;
      aboutGlobe.setFocusLatLng(lerp(coords[i0].lat, coords[i1].lat, f), lerpLng(coords[i0].lng, coords[i1].lng, f));
    }

    for (let i = 0; i < N; i++) {
      const delta = i - active; // >0 ahead (deep), 0 focus, <0 passed
      let opacity;
      if (delta >= 0) opacity = clamp(1 - (delta - 0.35) / 1.6, 0, 1);
      else opacity = clamp(1 + delta / 0.5, 0, 1);

      const el = items[i];
      const blur = clamp((Math.abs(delta) - 0.5) * 2.2, 0, 5);
      const focus = Math.abs(delta) < 0.5;
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "none";
      el.style.zIndex = String(1000 - Math.round(Math.abs(delta) * 10));
      el.classList.toggle("is-focus", focus);
      el.style.pointerEvents = focus ? "auto" : "none";

      const node = nodes[i];
      node.style.opacity = clamp(opacity + 0.15, 0, 1).toFixed(3);
      node.classList.toggle("is-focus", focus);
    }

    if (rail) rail.style.transform = `scaleX(${p.toFixed(4)})`;

    const activeIndex = clamp(Math.round(active), 0, N - 1);
    if (count && activeIndex !== lastActive) {
      count.textContent = `${pad2(activeIndex + 1)} / ${pad2(N)}`;
      lastActive = activeIndex;
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  render();
})();
