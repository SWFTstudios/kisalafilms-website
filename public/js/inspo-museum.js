/* Kisala Films — Inspo Museum.
   Slot-machine reels + JS float physics; Spin lands random frames;
   single-tap opens glass FLIP lightbox. */

(() => {
  const root = document.querySelector("[data-inspo]");
  if (!root) return;

  const wingsEl = root.querySelector("[data-inspo-wings]");
  const gridEl = root.querySelector("[data-inspo-grid]");
  const countEl = root.querySelector("[data-inspo-count]");
  const spinBtn = root.querySelector("[data-inspo-spin]");
  const room = document.querySelector("[data-inspo-room]");
  const roomFig = room?.querySelector("[data-inspo-room-figure]");
  const roomMeta = room?.querySelector("[data-inspo-room-meta]");
  const roomClose = room?.querySelector("[data-inspo-room-close]");
  const roomPrev = room?.querySelector("[data-inspo-room-prev]");
  const roomNext = room?.querySelector("[data-inspo-room-next]");

  const TAP_PX = 8;
  const TAP_MS = 320;
  const PAUSE_MS = 5000;
  const EASE_MS = 1200;
  const FLIP_MS = 420;
  const MAX_VEL = 2400;
  const COAST_LERP = 1.8;
  const SPIN_STAGGER_MS = 200;
  const REEL_COUNT = 3;

  let exhibits = [];
  let wings = [];
  let activeWing = "all";
  let activeIndex = -1;
  let filtered = [];
  let colCount = REEL_COUNT;
  let engines = [];
  let rafId = 0;
  let lastTs = 0;
  let roomOpen = false;
  let flyEl = null;
  let spinActive = false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function accession(i) {
    return `KF-INSPO-${String(i + 1).padStart(3, "0")}`;
  }

  function columnCount() {
    return REEL_COUNT;
  }

  function filterList() {
    filtered =
      activeWing === "all" ? exhibits.slice() : exhibits.filter((e) => e.wing === activeWing);
    return filtered;
  }

  function wrapOffset(offset, loop) {
    if (!loop || loop <= 0) return 0;
    let o = offset % loop;
    if (o > 0) o -= loop;
    return o;
  }

  function measureLoop(track) {
    if (!track) return 0;
    const half = track.scrollHeight / 2;
    return half > 1 ? half : track.scrollHeight;
  }

  function applyTransform(engine) {
    if (!engine.track) return;
    engine.track.style.transform = `translate3d(0, ${engine.offset}px, 0)`;
  }

  function isSpinMode(mode) {
    return mode === "spinning" || mode === "decelerating" || mode === "hold";
  }

  function setSpinUi(busy) {
    spinActive = busy;
    if (spinBtn) {
      spinBtn.disabled = busy;
      spinBtn.classList.toggle("is-busy", busy);
      spinBtn.setAttribute("aria-busy", busy ? "true" : "false");
      const caption = spinBtn.querySelector(".inspo-lever-caption");
      if (caption) caption.textContent = busy ? "HOLD" : "PULL";
    }
    gridEl?.classList.toggle("is-spinning", busy);
  }

  function checkSpinComplete() {
    if (!spinActive) return;
    const stillBusy = engines.some((eng) => isSpinMode(eng.mode) || eng.mode === "easing");
    if (!stillBusy) setSpinUi(false);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastTs = 0;
  }

  function tick(ts) {
    if (!engines.length || reduceMotion) {
      rafId = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    const now = performance.now();

    for (const eng of engines) {
      if (!eng.track) continue;
      if (!eng.loop) eng.loop = measureLoop(eng.track);

      if (roomOpen) {
        applyTransform(eng);
        continue;
      }

      if (eng.mode === "spinning") {
        if (eng.decelAt && now >= eng.decelAt) {
          beginDecelerate(eng, now);
        } else {
          eng.offset = wrapOffset(eng.offset + eng.velocity * dt, eng.loop);
        }
      } else if (eng.mode === "decelerating") {
        const t = Math.min(1, (now - eng.decelStart) / eng.decelDuration);
        const ease = 1 - Math.pow(1 - t, 3);
        eng.offset = wrapOffset(eng.decelFrom + eng.decelDelta * ease, eng.loop);
        eng.velocity = t >= 1 ? 0 : (eng.decelDelta / (eng.decelDuration / 1000)) * (3 * Math.pow(1 - t, 2));
        if (t >= 1) {
          eng.offset = wrapOffset(eng.targetOffset, eng.loop);
          eng.velocity = 0;
          eng.mode = "hold";
          eng.holdUntil = now + PAUSE_MS;
        }
      } else if (eng.mode === "hold") {
        eng.velocity = 0;
        if (eng.holdUntil && now >= eng.holdUntil) {
          eng.mode = "easing";
          eng.easeFrom = 0;
          eng.easeStart = now;
          eng.holdUntil = 0;
        }
      } else if (eng.mode === "paused") {
        if (eng.pauseUntil && now >= eng.pauseUntil) {
          eng.mode = "easing";
          eng.easeFrom = 0;
          eng.easeStart = now;
          eng.velocity = 0;
        }
      } else if (eng.mode === "easing") {
        const t = Math.min(1, (now - eng.easeStart) / EASE_MS);
        const ease = t * t * (3 - 2 * t);
        eng.velocity = eng.easeFrom + (eng.defaultVelocity - eng.easeFrom) * ease;
        eng.offset = wrapOffset(eng.offset + eng.velocity * dt, eng.loop);
        if (t >= 1) {
          eng.mode = "float";
          eng.velocity = eng.defaultVelocity;
          checkSpinComplete();
        }
      } else if (eng.mode === "drag") {
        /* scrubbed in pointermove */
      } else if (eng.mode === "coast") {
        eng.offset = wrapOffset(eng.offset + eng.velocity * dt, eng.loop);
        const target = eng.defaultVelocity;
        const blend = 1 - Math.exp(-COAST_LERP * dt);
        eng.velocity += (target - eng.velocity) * blend;
        if (Math.abs(eng.velocity - target) < 2) {
          eng.velocity = target;
          eng.mode = "float";
        }
      } else {
        eng.mode = "float";
        eng.velocity = eng.defaultVelocity;
        eng.offset = wrapOffset(eng.offset + eng.velocity * dt, eng.loop);
      }

      applyTransform(eng);
    }

    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (reduceMotion || rafId) return;
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }

  function uniqueCards(track) {
    if (!track) return [];
    const all = Array.from(track.querySelectorAll(".inspo-card"));
    const half = Math.max(1, Math.floor(all.length / 2));
    return all.slice(0, half);
  }

  function paylineOffsetForCard(eng, card) {
    if (!eng.el || !eng.track || !card) return eng.offset;
    const loop = eng.loop || measureLoop(eng.track);
    const paylineY = eng.el.clientHeight / 2;
    const cardCenter = card.offsetTop + card.offsetHeight / 2;
    return wrapOffset(paylineY - cardCenter, loop);
  }

  function travelDelta(from, to, loop, dir) {
    if (!loop) return 0;
    let delta = to - from;
    if (dir < 0) {
      if (delta > 0) delta -= loop;
      if (delta === 0) delta = -loop;
    } else {
      if (delta < 0) delta += loop;
      if (delta === 0) delta = loop;
    }
    const extra = (1 + Math.floor(Math.random() * 2)) * loop;
    return delta + dir * extra;
  }

  function beginDecelerate(eng, now) {
    const cards = uniqueCards(eng.track);
    if (!cards.length) {
      eng.mode = "hold";
      eng.velocity = 0;
      eng.holdUntil = now + PAUSE_MS;
      return;
    }
    const card = cards[Math.floor(Math.random() * cards.length)];
    eng.loop = eng.loop || measureLoop(eng.track);
    eng.targetOffset = paylineOffsetForCard(eng, card);
    const dir = Math.sign(eng.velocity) || -1;
    eng.decelFrom = eng.offset;
    eng.decelDelta = travelDelta(eng.offset, eng.targetOffset, eng.loop, dir);
    eng.decelStart = now;
    eng.decelDuration = 1200 + Math.random() * 600;
    eng.mode = "decelerating";
  }

  function spinAll() {
    if (!spinBtn || spinActive || roomOpen) return;
    if ((!engines.length && !reduceMotion) || !filterList().length) {
      spinBtn.classList.remove("is-pulling");
      return;
    }

    if (reduceMotion) {
      setSpinUi(true);
      window.setTimeout(() => setSpinUi(false), PAUSE_MS);
      return;
    }

    setSpinUi(true);
    const now = performance.now();

    engines.forEach((eng, i) => {
      eng.loop = eng.loop || measureLoop(eng.track);
      const mult = 3.5 + Math.random() * 2.5;
      const base = Math.abs(eng.defaultVelocity) || 28;
      eng.velocity = -base * mult;
      eng.mode = "spinning";
      eng.pauseUntil = 0;
      eng.holdUntil = 0;
      eng.decelAt = now + 700 + i * SPIN_STAGGER_MS;
    });

    startLoop();
  }

  function pauseColumn(eng) {
    if (isSpinMode(eng.mode)) return;
    eng.mode = "paused";
    eng.velocity = 0;
    eng.pauseUntil = performance.now() + PAUSE_MS;
  }

  function clearFly() {
    if (flyEl) {
      flyEl.remove();
      flyEl = null;
    }
  }

  function runFlip(fromEl, toEl, onDone) {
    if (!fromEl || !toEl || reduceMotion) {
      onDone?.();
      return;
    }
    clearFly();
    const from = fromEl.getBoundingClientRect();
    const img = fromEl.querySelector("img") || fromEl;
    const src = img.currentSrc || img.src;
    if (!src || from.width < 2) {
      onDone?.();
      return;
    }

    requestAnimationFrame(() => {
      const to = toEl.getBoundingClientRect();
      if (to.width < 2) {
        onDone?.();
        return;
      }

      flyEl = document.createElement("img");
      flyEl.className = "inspo-fly";
      flyEl.src = src;
      flyEl.alt = "";
      flyEl.style.cssText = `
        top:${from.top}px;left:${from.left}px;
        width:${from.width}px;height:${from.height}px;
      `;
      document.body.appendChild(flyEl);

      toEl.classList.add("is-morphing");
      roomMeta?.classList.add("is-pending");

      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const sx = to.width / from.width;
      const sy = to.height / from.height;

      requestAnimationFrame(() => {
        flyEl.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius ${FLIP_MS}ms ease`;
        flyEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        flyEl.style.borderRadius = "4px";
        flyEl.style.transformOrigin = "top left";
      });

      window.setTimeout(() => {
        toEl.classList.remove("is-morphing");
        roomMeta?.classList.remove("is-pending");
        roomMeta?.classList.add("is-shown");
        clearFly();
        onDone?.();
      }, FLIP_MS + 40);

      window.setTimeout(() => {
        roomMeta?.classList.add("is-shown");
      }, 120);
    });
  }

  function fillRoom(globalIndex) {
    const e = exhibits[globalIndex];
    const inFilter = filterList();
    const fi = inFilter.indexOf(e);

    if (roomFig) {
      roomFig.innerHTML = `<img src="${esc(e.src)}" alt="${esc(e.title)}">`;
      roomFig.classList.remove("is-morphing");
    }
    if (roomMeta) {
      roomMeta.classList.remove("is-shown", "is-pending");
      const link = e.href
        ? `<a class="cta-primary inspo-source" href="${esc(e.href)}" target="_blank" rel="noopener noreferrer">OPEN SOURCE <span>&#8599;</span></a>`
        : `<span class="placeholder-note">NO PUBLIC SOURCE ON FILE</span>`;
      roomMeta.innerHTML = `
        <span class="inspo-acc">${accession(globalIndex)}</span>
        <span class="stamp">${esc((e.wing || "").toUpperCase())} WING</span>
        <h2>${esc(e.title)}</h2>
        <p class="inspo-work">${esc(e.work || "")}</p>
        <p class="inspo-credit">${esc(e.credit || "")}</p>
        <p class="inspo-note">${esc(e.note || "")}</p>
        <div class="inspo-room-actions">${link}</div>
        <p class="inspo-room-pos">${fi + 1} / ${inFilter.length}</p>
      `;
    }
  }

  function openRoom(globalIndex, opts = {}) {
    if (!room || globalIndex < 0 || globalIndex >= exhibits.length) return;
    activeIndex = globalIndex;
    const fromEl = opts.fromEl || null;

    fillRoom(globalIndex);

    room.hidden = false;
    room.setAttribute("aria-hidden", "false");
    room.classList.add("is-opening");
    document.body.classList.add("inspo-room-open");
    roomOpen = true;

    const finishOpen = () => {
      room.classList.remove("is-opening");
      room.classList.add("is-open");
      roomMeta?.classList.add("is-shown");
      roomClose?.focus();
    };

    if (fromEl && !reduceMotion) {
      roomMeta?.classList.add("is-pending");
      roomFig?.classList.add("is-morphing");
      runFlip(fromEl, roomFig, finishOpen);
    } else {
      finishOpen();
    }
  }

  function closeRoom() {
    if (!room) return;
    clearFly();
    room.classList.remove("is-open", "is-opening");
    roomMeta?.classList.remove("is-shown", "is-pending");
    roomFig?.classList.remove("is-morphing");
    room.hidden = true;
    room.setAttribute("aria-hidden", "true");
    document.body.classList.remove("inspo-room-open");
    roomOpen = false;
    activeIndex = -1;
    engines.forEach((eng) => {
      if (isSpinMode(eng.mode)) return;
      if (eng.mode === "paused" && eng.pauseUntil && performance.now() < eng.pauseUntil) return;
      if (eng.mode === "paused") {
        eng.mode = "easing";
        eng.easeFrom = 0;
        eng.easeStart = performance.now();
      }
    });
  }

  function handlePinTap(eng, card) {
    if (isSpinMode(eng.mode) || spinActive) return;
    const index = Number(card.getAttribute("data-index"));
    const frame = card.querySelector(".inspo-card-frame") || card;
    pauseColumn(eng);
    openRoom(index, { fromEl: frame });
  }

  function bindColumn(eng) {
    const el = eng.el;
    let pointerId = null;
    let startT = 0;
    let lastY = 0;
    let moved = 0;
    let samples = [];
    let startY = 0;

    function onDown(ev) {
      if (reduceMotion) return;
      if (isSpinMode(eng.mode) || spinActive) return;
      if (ev.button != null && ev.button !== 0) return;
      pointerId = ev.pointerId;
      el.setPointerCapture?.(pointerId);
      startY = lastY = ev.clientY;
      startT = performance.now();
      moved = 0;
      samples = [{ y: lastY, t: startT }];
      eng.mode = "drag";
      eng.velocity = 0;
      eng.pauseUntil = 0;
    }

    function onMove(ev) {
      if (pointerId == null || ev.pointerId !== pointerId) return;
      if (isSpinMode(eng.mode) || spinActive) return;
      const y = ev.clientY;
      const t = performance.now();
      const dy = y - lastY;
      eng.offset = wrapOffset(eng.offset + dy, eng.loop || measureLoop(eng.track));
      eng.loop = eng.loop || measureLoop(eng.track);
      applyTransform(eng);
      moved += Math.abs(dy);
      lastY = y;
      samples.push({ y, t });
      if (samples.length > 6) samples.shift();
      ev.preventDefault();
    }

    function velocityFromSamples() {
      if (samples.length < 2) return 0;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0.001) return 0;
      return Math.max(-MAX_VEL, Math.min(MAX_VEL, (b.y - a.y) / dt));
    }

    function onUp(ev) {
      if (pointerId == null || ev.pointerId !== pointerId) return;
      const dt = performance.now() - startT;
      const isTap = moved < TAP_PX && dt < TAP_MS;
      const card = ev.target.closest?.("[data-index]");

      try {
        el.releasePointerCapture?.(pointerId);
      } catch (_) {
        /* ignore */
      }
      pointerId = null;

      if (isSpinMode(eng.mode) || spinActive) return;

      if (isTap && card) {
        handlePinTap(eng, card);
        return;
      }

      eng.velocity = velocityFromSamples();
      eng.mode = "coast";
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    el.addEventListener("click", (ev) => {
      if (reduceMotion) {
        const card = ev.target.closest("[data-index]");
        if (card) {
          const frame = card.querySelector(".inspo-card-frame") || card;
          openRoom(Number(card.getAttribute("data-index")), { fromEl: frame });
        }
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

  function teardownEngines() {
    stopLoop();
    engines = [];
    setSpinUi(false);
  }

  function mountEngines() {
    teardownEngines();
    if (reduceMotion || !gridEl) return;

    const cols = gridEl.querySelectorAll(".inspo-col");
    engines = Array.from(cols).map((el, ci) => {
      const track = el.querySelector(".inspo-col-track");
      const sign = ci % 2 === 0 ? -1 : 1;
      const speed = 22 + (ci % 4) * 4;
      const eng = {
        el,
        track,
        offset: 0,
        velocity: sign * speed,
        defaultVelocity: sign * speed,
        mode: "float",
        loop: 0,
        pauseUntil: 0,
        holdUntil: 0,
        easeFrom: 0,
        easeStart: 0,
        decelAt: 0,
        decelFrom: 0,
        decelDelta: 0,
        decelStart: 0,
        decelDuration: 1400,
        targetOffset: 0,
      };
      bindColumn(eng);
      return eng;
    });

    requestAnimationFrame(() => {
      engines.forEach((eng) => {
        eng.loop = measureLoop(eng.track);
        applyTransform(eng);
      });
      startLoop();
    });

    gridEl.querySelectorAll("img").forEach((img) => {
      if (img.complete) return;
      img.addEventListener(
        "load",
        () => {
          engines.forEach((eng) => {
            eng.loop = measureLoop(eng.track);
          });
        },
        { once: true }
      );
    });
  }

  function renderWings() {
    if (!wingsEl) return;
    wingsEl.innerHTML = wings
      .map(
        (w) =>
          `<button type="button" class="inspo-wing${w.id === activeWing ? " is-active" : ""}" data-wing="${esc(
            w.id
          )}">${esc(w.label)}</button>`
      )
      .join("");
  }

  function cardHtml(e, filterIndex) {
    const globalIndex = exhibits.indexOf(e);
    return `<button type="button" class="inspo-card" data-index="${globalIndex}" data-filter-index="${filterIndex}">
      <span class="inspo-card-frame">
        <img src="${esc(e.src)}" alt="${esc(e.title)}" loading="lazy" decoding="async">
      </span>
      <span class="inspo-card-meta">
        <span class="inspo-acc">${accession(globalIndex)}</span>
        <span class="inspo-wing-stamp">${esc((e.wing || "").toUpperCase())}</span>
        <strong>${esc(e.title)}</strong>
        <span class="inspo-work">${esc(e.work || "")}</span>
      </span>
    </button>`;
  }

  function renderGrid() {
    const list = filterList();
    colCount = columnCount();
    if (countEl) {
      countEl.textContent = `${list.length} EXHIBIT${list.length === 1 ? "" : "S"}`;
    }
    if (!gridEl) return;
    if (!list.length) {
      teardownEngines();
      gridEl.className = "inspo-marquee is-empty";
      gridEl.innerHTML = `<p class="inspo-empty">NO EXHIBITS IN THIS WING.</p>`;
      return;
    }

    const columns = Array.from({ length: colCount }, () => []);
    list.forEach((e, i) => {
      columns[i % colCount].push({ e, i });
    });
    columns.forEach((col) => {
      if (!col.length && list.length) col.push({ e: list[0], i: 0 });
    });

    gridEl.className = "inspo-marquee";
    gridEl.style.setProperty("--inspo-cols", String(colCount));
    gridEl.innerHTML = columns
      .map((col, ci) => {
        const cards = col.map(({ e, i }) => cardHtml(e, i)).join("");
        const track = reduceMotion ? cards : `${cards}${cards}`;
        return `<div class="inspo-col" data-col="${ci}">
          <span class="inspo-payline" aria-hidden="true"></span>
          <div class="inspo-col-track">${track}</div>
        </div>`;
      })
      .join("");

    if (reduceMotion) {
      gridEl.onclick = (ev) => {
        const card = ev.target.closest("[data-index]");
        if (card) {
          const frame = card.querySelector(".inspo-card-frame") || card;
          openRoom(Number(card.getAttribute("data-index")), { fromEl: frame });
        }
      };
      return;
    }

    gridEl.onclick = null;
    mountEngines();
  }

  function step(delta) {
    const list = filterList();
    if (!list.length || activeIndex < 0) return;
    const current = exhibits[activeIndex];
    let fi = list.indexOf(current);
    if (fi < 0) fi = 0;
    fi = (fi + delta + list.length) % list.length;
    openRoom(exhibits.indexOf(list[fi]));
  }

  wingsEl?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-wing]");
    if (!btn) return;
    activeWing = btn.getAttribute("data-wing") || "all";
    renderWings();
    renderGrid();
  });

  const LEVER_PULL_MS = 140;
  const LEVER_CYCLE_MS = 360;

  spinBtn?.addEventListener("click", () => {
    if (!spinBtn || spinActive || roomOpen || spinBtn.disabled) return;
    if (spinBtn.classList.contains("is-pulling")) return;

    spinBtn.classList.remove("is-pulling");
    void spinBtn.offsetWidth;
    spinBtn.classList.add("is-pulling");

    const fireAt = reduceMotion ? 0 : LEVER_PULL_MS;
    const clearAt = reduceMotion ? 0 : LEVER_CYCLE_MS;

    window.setTimeout(() => spinAll(), fireAt);
    window.setTimeout(() => spinBtn.classList.remove("is-pulling"), clearAt);
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const next = columnCount();
      if (next !== colCount) renderGrid();
      else {
        engines.forEach((eng) => {
          eng.loop = measureLoop(eng.track);
        });
      }
    }, 180);
  });

  roomClose?.addEventListener("click", closeRoom);
  roomPrev?.addEventListener("click", () => step(-1));
  roomNext?.addEventListener("click", () => step(1));
  room?.addEventListener("click", (ev) => {
    if (ev.target === room) closeRoom();
  });

  document.addEventListener("keydown", (ev) => {
    if (room?.hidden !== false) return;
    if (ev.key === "Escape") closeRoom();
    if (ev.key === "ArrowLeft") step(-1);
    if (ev.key === "ArrowRight") step(1);
  });

  fetch("/data/inspo-museum.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      exhibits = data.exhibits || [];
      wings = data.wings || [{ id: "all", label: "ALL" }];
      const lede = root.querySelector("[data-inspo-lede]");
      if (lede && data.lede) lede.textContent = data.lede;
      renderWings();
      renderGrid();
    })
    .catch(() => {
      teardownEngines();
      if (gridEl) {
        gridEl.className = "inspo-marquee is-empty";
        gridEl.innerHTML = `<p class="inspo-empty">ARCHIVE UNAVAILABLE.</p>`;
      }
    });
})();
