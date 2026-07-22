(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* —— Live clock —— */
  const clocks = document.querySelectorAll("[data-live-clock]");
  if (clocks.length) {
    const tick = () => {
      const t = new Date().toLocaleTimeString("en-US", { hour12: false });
      clocks.forEach((el) => {
        el.textContent = t;
      });
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* —— Series / film tape data (PLACEHOLDER titles & video URLs until real films are wired) —— */
  const SERIES = [
    {
      id: "roller-reels",
      code: "RR-001",
      label: "ROLLER REELS",
      short: "ROLLER REELS",
      title: "OWN MACHINE",
      time: "—:—",
      tone: "red",
      format: "Hi8 / DIGI",
      blurb: "Cinematic films about cars, bikes, and the people who keep them alive.",
      /* PLACEHOLDER: replace with real YouTube / hosted video URL */
      video: "https://www.instagram.com/kisalafilms/",
      thumb: "/images/thumb-f4i-reveal.jpg",
    },
    {
      id: "lost-tapes",
      code: "LT-004",
      label: "LOST TAPES",
      short: "LOST TAPES",
      title: "GARAGE NIGHT",
      time: "—:—",
      tone: "lime",
      format: "PHONE / RAW",
      blurb: "Raw meet footage, old cameras, experiments, and recovered moments.",
      /* PLACEHOLDER: replace with real YouTube / hosted video URL */
      video: "https://www.instagram.com/kisalafilms/",
      thumb: "/images/thumb-shop-bts.jpg",
    },
    {
      id: "exit-unknown",
      code: "EU-012",
      label: "EXIT UNKNOWN",
      short: "EXIT UNK.",
      title: "NIGHT RUN",
      time: "—:—",
      tone: "orange",
      format: "HELMET CAM",
      blurb: "Motorcycle adventures and travel without a rigid destination.",
      /* PLACEHOLDER: replace with real YouTube / hosted video URL */
      video: "https://www.instagram.com/kisalafilms/",
      thumb: "/images/thumb-night-pov.jpg",
    },
    {
      id: "passenger-seat",
      code: "PS-007",
      label: "PASSENGER SEAT",
      short: "PASSENGER",
      title: "SHOP TALK",
      time: "—:—",
      tone: "blue",
      format: "STEREO",
      blurb: "Conversations with riders, builders, filmmakers, and friends.",
      /* PLACEHOLDER: replace with real YouTube / hosted video URL */
      video: "https://www.instagram.com/kisalafilms/",
      thumb: "/images/thumb-customer-interview.jpg",
    },
    {
      id: "family-films",
      code: "FF-003",
      label: "FAMILY FILMS",
      short: "FAMILY",
      title: "BETWEEN PLACES",
      time: "—:—",
      tone: "cream",
      format: "HOME VIDEO",
      blurb: "Intimate travel and life documentation from the road between places.",
      /* PLACEHOLDER: replace with real YouTube / hosted video URL */
      video: "https://www.instagram.com/kisalafilms/",
      thumb: "/images/story-elombe-workshop.jpg",
    },
  ];

  window.KISALA_SERIES = SERIES;

  function initTapeSlider(root) {
    if (!root) return;

    const track = root.querySelector("[data-tape-track]");
    const indexEl = root.querySelector("[data-tape-index]");
    const detailEl = root.querySelector("[data-tape-detail]");
    const prevBtn = root.querySelector("[data-tape-prev]");
    const nextBtn = root.querySelector("[data-tape-next]");
    if (!track) return;

    let active = 0;
    let startX = 0;
    let deltaX = 0;
    let swiping = false;

    const render = () => {
      track.innerHTML = SERIES.map((tape, i) => {
        let state = "";
        if (i === active) state = "is-active";
        else if (i === (active - 1 + SERIES.length) % SERIES.length) state = "is-prev";
        else if (i === (active + 1) % SERIES.length) state = "is-next";
        else state = "is-hidden";

        return `
          <article class="tape ${tape.tone} ${state}" data-tape-card data-index="${i}" style="${state === "is-hidden" ? "opacity:0;pointer-events:none;transform:translate3d(0,0,-200px) scale(.7)" : ""}">
            <div class="tape-top"><span>KF—${tape.code}</span><b>${tape.short}</b><span>${tape.format}</span></div>
            <div class="reels" aria-hidden="true"><i></i><i></i></div>
            <div class="tape-label">
              <small>KISALA FILMS SERIES</small>
              <strong>${tape.title}</strong>
              <span>${tape.time} / COLOR</span>
            </div>
            <a class="tape-link" href="${tape.video}" target="_blank" rel="noopener" aria-label="Play ${tape.label}: ${tape.title}"></a>
          </article>
        `;
      }).join("");

      if (indexEl) {
        indexEl.innerHTML = SERIES.map(
          (tape, i) =>
            `<button type="button" class="${i === active ? "active" : ""}" data-tape-goto="${i}" aria-pressed="${i === active}" aria-label="${tape.label}"><span>0${i + 1}</span>${tape.short}</button>`
        ).join("");
      }

      if (detailEl) {
        const tape = SERIES[active];
        detailEl.innerHTML = `
          <p><strong>${tape.label}</strong> — ${tape.blurb}<br><span class="placeholder-note">PLACEHOLDER: tape links to Instagram until the real film URL is set.</span></p>
          <a class="cta-primary" href="${tape.video}" target="_blank" rel="noopener">PLAY THIS TAPE <span>↗</span></a>
        `;
      }
    };

    const setActive = (next) => {
      active = (next + SERIES.length) % SERIES.length;
      render();
    };

    root.addEventListener("click", (e) => {
      const goto = e.target.closest("[data-tape-goto]");
      if (goto) {
        setActive(Number(goto.getAttribute("data-tape-goto")));
        return;
      }
      if (e.target.closest("[data-tape-prev]")) setActive(active - 1);
      if (e.target.closest("[data-tape-next]")) setActive(active + 1);
    });

    root.addEventListener("keydown", (e) => {
      if (!root.contains(document.activeElement) && document.activeElement !== root) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActive(active - 1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActive(active + 1);
      }
    });

    /* Swipe */
    const onStart = (x) => {
      swiping = true;
      startX = x;
      deltaX = 0;
    };
    const onMove = (x) => {
      if (!swiping) return;
      deltaX = x - startX;
    };
    const onEnd = () => {
      if (!swiping) return;
      swiping = false;
      if (Math.abs(deltaX) > 50) setActive(active + (deltaX < 0 ? 1 : -1));
    };

    track.addEventListener(
      "touchstart",
      (e) => onStart(e.changedTouches[0].clientX),
      { passive: true }
    );
    track.addEventListener(
      "touchmove",
      (e) => onMove(e.changedTouches[0].clientX),
      { passive: true }
    );
    track.addEventListener("touchend", onEnd);
    track.addEventListener("mousedown", (e) => onStart(e.clientX));
    window.addEventListener("mousemove", (e) => onMove(e.clientX));
    window.addEventListener("mouseup", onEnd);

    if (prevBtn) prevBtn.setAttribute("aria-label", "Previous tape");
    if (nextBtn) nextBtn.setAttribute("aria-label", "Next tape");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", "Series tape crate");

    render();

    if (prefersReduced) {
      document.querySelectorAll(".reels i").forEach((el) => {
        el.style.animation = "none";
      });
    }
  }

  document.querySelectorAll("[data-tape-slider]").forEach(initTapeSlider);

  /* Pause continuous motion when tab hidden */
  document.addEventListener("visibilitychange", () => {
    const paused = document.hidden;
    document.querySelectorAll(".ticker div, .rec b, .header-meta i, .reels i").forEach((el) => {
      el.style.animationPlayState = paused ? "paused" : "running";
    });
  });
})();
