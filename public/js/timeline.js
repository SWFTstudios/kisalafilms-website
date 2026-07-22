(() => {
  const root = document.querySelector("[data-z-timeline]");
  if (!root) return;

  const scroller = root.querySelector(".z-scroll");
  const track = root.querySelector("[data-z-track]");
  const items = track ? [...track.querySelectorAll(".z-item")] : [];
  const rail = root.querySelector("[data-z-rail]");
  const count = root.querySelector("[data-z-count]");
  if (!scroller || !items.length) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Reduced motion / no support: leave the plain stacked fallback in place. */
  if (prefersReduced) return;

  const N = items.length;
  const SPACING = 640; // px of z-depth between chapters
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Tall scroll area: one viewport of scroll per chapter (plus lead-in/out). */
  scroller.style.height = `${(N + 1) * 100}vh`;
  root.classList.add("is-3d");

  const pad2 = (n) => String(n).padStart(3, "0");
  let ticking = false;
  let lastActive = -1;

  function render() {
    ticking = false;
    const rect = scroller.getBoundingClientRect();
    const stageH = window.innerHeight;
    const distance = rect.height - stageH;
    if (distance <= 0) return;

    // progress 0..1 across the pinned range
    const p = clamp(-rect.top / distance, 0, 1);
    const active = p * (N - 1);

    for (let i = 0; i < N; i++) {
      const el = items[i];
      const delta = i - active; // >0 future (far), 0 focus, <0 past (toward camera)
      const z = -delta * SPACING;

      let opacity;
      if (delta >= 0) {
        opacity = clamp(1 - (delta - 0.35) / 1.5, 0, 1);
      } else {
        opacity = clamp(1 + delta / 0.55, 0, 1);
      }

      const y = delta * 26; // subtle vertical drift for depth
      const blur = clamp((Math.abs(delta) - 0.4) * 2.4, 0, 6);

      el.style.transform = `translate(-50%, -50%) translateZ(${z.toFixed(1)}px) translateY(${y.toFixed(1)}px)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "none";
      el.style.zIndex = String(1000 - Math.round(Math.abs(delta) * 10));
      el.classList.toggle("is-focus", Math.abs(delta) < 0.5);
      el.style.pointerEvents = Math.abs(delta) < 0.5 ? "auto" : "none";
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

  /* Keyboard: let arrows nudge the page when the timeline is on screen. */
  root.setAttribute("tabindex", "-1");
})();
