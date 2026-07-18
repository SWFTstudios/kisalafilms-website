(() => {
  const scrollRoot = document.querySelector("[data-sphere-scroll]");
  const sphere = document.querySelector("[data-sphere]");
  const sphereLayer = document.querySelector("[data-sphere-layer]");
  const sphereWrap = document.querySelector("[data-sphere-wrap]");
  const intro = document.querySelector("[data-intro]");
  const introLogo = document.querySelector("[data-intro-logo]");
  const introCue = document.querySelector("[data-intro-cue]");
  const introTiles = Array.from(document.querySelectorAll("[data-intro-tile]"));
  const header = document.querySelector("[data-sphere-header]");
  const projectPanel = document.querySelector("[data-project-panel]");
  const warpStage = document.querySelector("[data-warp-stage]");
  const warpCards = Array.from(document.querySelectorAll("[data-warp-card]"));
  const warpStatus = document.querySelector("[data-warp-status]");
  const warpCue = document.querySelector("[data-warp-cue]");
  const menu = document.querySelector("[data-menu-overlay]");
  const motionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const media = [
    "/images/hero-f4i-garage-night.jpg",
    "/images/thumb-f4i-reveal.jpg",
    "/images/thumb-night-pov.jpg",
    "/images/thumb-shop-bts.jpg",
    "/images/thumb-wrap-process.jpg",
    "/images/story-elombe-workshop.jpg",
    "/images/thumb-customer-interview.jpg",
    "/images/about-vinyl-hands.jpg",
    "/images/thumb-panel-lines.jpg",
    "/images/thumb-timelapse-shop.jpg",
    "/images/thumb-transformation-mid.jpg",
    "/images/thumb-customer-interview-2.jpg",
    "/images/thumb-before-strip.jpg"
  ];

  let radius = 230;
  let rotationY = 0;
  let extraTilt = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = performance.now();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (value, start, finish) => {
    const t = clamp((value - start) / (finish - start), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const layoutIntroTiles = () => {
    const angles = [-158, -126, -91, -48, -14, 27, 72, 137];
    const distances = [0.92, 0.75, 0.9, 0.72, 0.88, 0.76, 0.86, 0.72];
    const maxX = Math.max(180, window.innerWidth * (window.innerWidth < 768 ? 0.42 : 0.4));
    const maxY = Math.max(190, window.innerHeight * (window.innerWidth < 768 ? 0.36 : 0.39));

    introTiles.forEach((tile, index) => {
      const angle = (angles[index % angles.length] * Math.PI) / 180;
      const distance = distances[index % distances.length];
      tile.dataset.introX = String(Math.cos(angle) * maxX * distance);
      tile.dataset.introY = String(Math.sin(angle) * maxY * distance);
      tile.dataset.introRotation = String(-12 + ((index * 17) % 25));
    });
  };

  const buildSphere = () => {
    if (!sphere || !sphereWrap) return;
    const diameter = clamp(Math.min(window.innerWidth, window.innerHeight) * (window.innerWidth < 768 ? 0.72 : 0.62), 220, 560);
    radius = diameter / 2;
    sphereWrap.style.width = `${diameter}px`;
    sphereWrap.style.height = `${diameter}px`;
    sphere.innerHTML = "";

    const rows = 4;
    const columns = 6;
    const thetaStep = 360 / columns;
    const phiStep = 180 / rows;
    const tileHeight = 2 * radius * Math.tan((phiStep / 2) * Math.PI / 180) * 1.02;

    for (let row = 0; row < rows; row += 1) {
      const phi = -90 + (row + 0.5) * phiStep;
      const cosine = Math.max(Math.cos(phi * Math.PI / 180), 0.3);
      const tileWidth = 2 * radius * Math.tan((thetaStep / 2) * Math.PI / 180) * cosine * 1.02;

      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const theta = column * thetaStep;
        const tile = document.createElement("div");
        tile.className = "sphere-tile";
        tile.style.width = `${tileWidth}px`;
        tile.style.height = `${tileHeight}px`;
        tile.style.transform = `translate(-50%,-50%) rotateY(${theta}deg) rotateX(${phi}deg) translateZ(${radius}px)`;

        const inner = document.createElement("div");
        inner.className = "sphere-tile-inner";
        inner.style.backgroundImage = `url("${media[index % media.length]}")`;
        inner.style.backgroundPosition = `${25 + ((index * 17) % 55)}% ${25 + ((index * 11) % 50)}%`;
        tile.appendChild(inner);
        sphere.appendChild(tile);
      }
    }
  };

  const applyScroll = () => {
    if (!scrollRoot) return;
    const rect = scrollRoot.getBoundingClientRect();
    const distance = scrollRoot.offsetHeight - window.innerHeight;
    const progress = distance > 0 ? clamp(-rect.top / distance, 0, 1) : 0;

    const introOut = smooth(progress, 0.24, 0.38);
    const logoTravel = motionReduced ? 0 : smooth(progress, 0, 0.06);
    const logoScale = motionReduced ? 1 : 1 + 59 * smooth(progress, 0.055, 0.31);
    const logoOut = smooth(progress, 0.24, 0.34);
    const reveal = smooth(progress, 0.3, 0.42);
    const columns = smooth(progress, 0.52, 0.86);

    if (intro) {
      intro.style.opacity = String(1 - introOut);
      intro.style.pointerEvents = progress > 0.38 ? "none" : "auto";
    }
    if (introLogo) {
      const logoX = -50 + logoTravel * 30;
      const logoY = -50 - logoTravel * 28;
      introLogo.style.transform = `translate(${logoX}%, ${logoY}%) scale(${logoScale})`;
      introLogo.style.opacity = String(1 - logoOut);
    }
    introTiles.forEach((tile, index) => {
      const tileReveal = smooth(progress, 0.05 + index * 0.006, 0.23 + index * 0.005);
      const x = Number(tile.dataset.introX || 0) * tileReveal;
      const y = Number(tile.dataset.introY || 0) * tileReveal;
      const rotation = Number(tile.dataset.introRotation || 0) * tileReveal;
      const scale = 0.58 + tileReveal * 0.42;
      tile.style.opacity = String(tileReveal);
      tile.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotation}deg)`;
    });
    if (introCue) introCue.style.opacity = String(1 - smooth(progress, 0, 0.07));
    if (header) header.classList.toggle("is-revealed", reveal > 0.5);
    if (projectPanel) projectPanel.style.transform = `translateY(${100 - columns * 100}%)`;
  };

  const animate = (time) => {
    const deltaTime = Math.min(time - lastTime, 40);
    lastTime = time;
    if (!dragging && !motionReduced) {
      if (Math.abs(velocity) > 0.002) {
        rotationY += velocity * deltaTime;
        velocity *= 0.945;
      } else {
        velocity = 0;
        rotationY += 0.011 * deltaTime;
      }
      extraTilt += (0 - extraTilt) * 0.06;
    }
    if (sphere) sphere.style.transform = `rotateX(${-8 + extraTilt}deg) rotateY(${rotationY}deg)`;
    applyScroll();
    requestAnimationFrame(animate);
  };

  if (sphereLayer) {
    sphereLayer.addEventListener("pointerdown", (event) => {
      dragging = true;
      velocity = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      sphereLayer.classList.add("is-dragging");
      try { sphereLayer.setPointerCapture(event.pointerId); } catch (_) { /* no-op */ }
    });
    sphereLayer.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      const change = dx * 0.35;
      rotationY += change;
      velocity = change / 16;
      extraTilt = clamp(extraTilt - dy * 0.22, -32, 32);
    });
    const release = () => {
      dragging = false;
      sphereLayer.classList.remove("is-dragging");
    };
    sphereLayer.addEventListener("pointerup", release);
    sphereLayer.addEventListener("pointercancel", release);
    sphereLayer.addEventListener("pointerleave", release);
  }

  const warpCount = warpCards.length;
  let warpIndex = 0;
  let warpTarget = 0;
  let warpDrag = false;
  let warpPointerId = null;
  let warpStartX = 0;
  let warpStartY = 0;
  let warpLastX = 0;
  let warpLastTime = 0;
  let warpVelocity = 0;
  let warpMoved = false;
  let warpAxis = null;
  let warpIgnoreClick = false;
  let warpIgnoreTimer = 0;
  let warpAnnounced = -1;
  let warpSpacing = 280;
  let warpArc = 54;

  const wrapDistance = (distance, length) => {
    let value = ((distance % length) + length) % length;
    if (value > length / 2) value -= length;
    return value;
  };

  const measureWarp = () => {
    const mobile = window.innerWidth < 768;
    warpSpacing = Math.max(180, window.innerWidth * (mobile ? 0.58 : 0.3));
    warpArc = mobile ? 42 : 58;
  };

  const updateWarpStatus = (force = false) => {
    if (!warpStatus || !warpCount) return;
    const active = ((Math.round(warpIndex) % warpCount) + warpCount) % warpCount;
    if (!force && active === warpAnnounced) return;
    warpAnnounced = active;
    const card = warpCards[active];
    const title = card?.dataset.title || "Project";
    warpStatus.textContent = `${title}, card ${active + 1} of ${warpCount}`;
  };

  const renderWarp = () => {
    if (!warpCount) return;
    const active = ((Math.round(warpIndex) % warpCount) + warpCount) % warpCount;

    warpCards.forEach((card, index) => {
      const distance = wrapDistance(index - warpIndex, warpCount);
      const abs = Math.abs(distance);
      const x = distance * warpSpacing;
      const y = abs * abs * warpArc * 0.55;
      const rotate = distance * (window.innerWidth < 768 ? 9 : 12);
      const scale = Math.max(0.72, 1 - abs * 0.14);
      const opacity = Math.max(0.28, 1 - abs * 0.28);
      const z = 40 - Math.round(abs * 10);

      card.classList.toggle("is-active", index === active);
      card.style.zIndex = String(z);
      card.style.opacity = String(opacity);
      card.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) rotate(${rotate}deg) scale(${scale})`;
      card.setAttribute("aria-hidden", index === active ? "false" : "true");
      card.tabIndex = index === active ? 0 : -1;
    });

    if (!warpDrag) updateWarpStatus();
  };

  const stepWarp = (direction) => {
    if (!warpCount) return;
    warpTarget = Math.round(warpTarget) + direction;
    if (motionReduced) {
      warpIndex = warpTarget;
      renderWarp();
      updateWarpStatus();
    }
  };

  const animateWarp = () => {
    if (!warpDrag && !motionReduced) {
      const delta = warpTarget - warpIndex;
      if (Math.abs(delta) > 0.0008) {
        warpIndex += delta * 0.14;
      } else {
        warpIndex = warpTarget;
      }
      renderWarp();
    } else if (motionReduced) {
      warpIndex = warpTarget;
      renderWarp();
    }
    requestAnimationFrame(animateWarp);
  };

  if (warpStage && warpCount) {
    measureWarp();
    renderWarp();
    updateWarpStatus();
    requestAnimationFrame(animateWarp);

    warpStage.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      warpDrag = true;
      warpPointerId = event.pointerId;
      warpStartX = event.clientX;
      warpStartY = event.clientY;
      warpLastX = event.clientX;
      warpLastTime = performance.now();
      warpVelocity = 0;
      warpMoved = false;
      warpAxis = null;
      warpIgnoreClick = false;
      warpStage.classList.add("is-dragging");
      if (warpCue) warpCue.style.opacity = "0";
      try { warpStage.setPointerCapture(event.pointerId); } catch (_) { /* no-op */ }
    });

    warpStage.addEventListener("pointermove", (event) => {
      if (!warpDrag || event.pointerId !== warpPointerId) return;
      const dx = event.clientX - warpStartX;
      const dy = event.clientY - warpStartY;

      if (!warpAxis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        warpAxis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (warpAxis === "y") {
          warpDrag = false;
          warpStage.classList.remove("is-dragging");
          try { warpStage.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
          return;
        }
      }

      if (warpAxis !== "x") return;
      event.preventDefault();
      warpMoved = Math.abs(dx) > 8;
      const now = performance.now();
      const frameDx = event.clientX - warpLastX;
      const frameDt = Math.max(now - warpLastTime, 1);
      warpVelocity = frameDx / frameDt;
      warpLastX = event.clientX;
      warpLastTime = now;
      warpIndex = warpTarget - dx / warpSpacing;
      renderWarp();
    });

    const endWarpDrag = (event) => {
      if (!warpDrag || (event && event.pointerId !== warpPointerId)) return;
      warpDrag = false;
      warpPointerId = null;
      warpStage.classList.remove("is-dragging");

      if (warpMoved) {
        warpIgnoreClick = true;
        window.clearTimeout(warpIgnoreTimer);
        warpIgnoreTimer = window.setTimeout(() => {
          warpIgnoreClick = false;
        }, 280);
        const flick = clamp(warpVelocity * 180, -1.35, 1.35);
        warpTarget = Math.round(warpIndex - flick);
        if (motionReduced) {
          warpIndex = warpTarget;
          renderWarp();
        }
      } else {
        warpTarget = Math.round(warpIndex);
        warpIndex = warpTarget;
        renderWarp();
      }
    };

    warpStage.addEventListener("pointerup", endWarpDrag);
    warpStage.addEventListener("pointercancel", endWarpDrag);
    warpStage.addEventListener("lostpointercapture", endWarpDrag);

    warpCards.forEach((card) => {
      card.addEventListener("click", (event) => {
        if (!warpIgnoreClick) return;
        event.preventDefault();
        event.stopPropagation();
        warpIgnoreClick = false;
      });
    });
  }

  document.querySelector("[data-project-prev]")?.addEventListener("click", () => stepWarp(-1));
  document.querySelector("[data-project-next]")?.addEventListener("click", () => stepWarp(1));

  const setMenu = (open) => {
    menu?.classList.toggle("is-open", open);
    menu?.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
    document.querySelectorAll("[data-menu-open]").forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
    });
  };
  document.querySelectorAll("[data-menu-open]").forEach((button) => {
    button.addEventListener("click", () => setMenu(true));
  });
  document.querySelectorAll("[data-menu-close]").forEach((button) => {
    button.addEventListener("click", () => setMenu(false));
  });
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
    if (event.key === "ArrowLeft") stepWarp(-1);
    if (event.key === "ArrowRight") stepWarp(1);
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      buildSphere();
      layoutIntroTiles();
      measureWarp();
      renderWarp();
    }, 120);
  });
  window.addEventListener("scroll", applyScroll, { passive: true });

  buildSphere();
  layoutIntroTiles();
  applyScroll();
  requestAnimationFrame(animate);
})();
