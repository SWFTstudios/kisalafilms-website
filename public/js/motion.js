(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const INTRO_KEY = "kfilms-home-intro";

  let lenis = null;
  let introPlaying = false;
  let heroPending = false;

  const ensureTransitionShell = () => {
    let root = document.querySelector("[data-kf-transition]");
    if (root) return root;

    root = document.createElement("div");
    root.className = "kf-page-transition";
    root.setAttribute("data-kf-transition", "");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="kf-pt-panel kf-pt-panel--left" data-kf-pt-left></div>
      <div class="kf-pt-panel kf-pt-panel--right" data-kf-pt-right></div>
      <div class="kf-pt-line" data-kf-pt-line aria-hidden="true"></div>
    `;
    document.body.prepend(root);
    return root;
  };

  const ensureLoader = () => {
    let loader = document.querySelector("[data-kf-loader]");
    if (loader) return loader;

    loader = document.createElement("div");
    loader.className = "kf-loader";
    loader.setAttribute("data-kf-loader", "");
    loader.setAttribute("aria-hidden", "true");
    loader.hidden = true;
    loader.innerHTML = `
      <div class="kf-loader-panel kf-loader-panel--top" data-kf-loader-top></div>
      <div class="kf-loader-panel kf-loader-panel--bottom" data-kf-loader-bottom></div>
      <div class="kf-loader-stage">
        <div class="kf-loader-logo-wrap">
          <img class="kf-loader-logo" data-kf-loader-logo src="/images/brand/kisala-films-logo.png" alt="Kisala Films" width="1421" height="745">
          <span class="kf-loader-sweep" data-kf-loader-sweep aria-hidden="true"></span>
        </div>
        <div class="kf-loader-line" data-kf-loader-line aria-hidden="true"></div>
      </div>
    `;
    document.body.prepend(loader);
    return loader;
  };

  const directRevealChildren = (parent) =>
    Array.from(parent.children).filter((child) => child.hasAttribute("data-reveal"));

  const hasSeenIntro = () => {
    try {
      return sessionStorage.getItem(INTRO_KEY) === "1";
    } catch (_) {
      return false;
    }
  };

  const markIntroSeen = () => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch (_) {
      /* private mode */
    }
  };

  const initLenis = () => {
    if (reduceMotion || !finePointer || typeof Lenis === "undefined") return null;
    const instance = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    instance.on("scroll", () => {
      if (window.ScrollTrigger) ScrollTrigger.update();
    });

    gsap.ticker.add((time) => {
      instance.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return instance;
  };

  const initHeaderSolid = () => {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const hero =
      document.querySelector(".kf-hero") || document.querySelector(".kf-page-hero");
    const onScroll = () => {
      const y = lenis ? lenis.scroll : window.scrollY || window.pageYOffset;
      let threshold = window.innerHeight * 0.65;
      if (hero) {
        const top = hero.getBoundingClientRect().top + y;
        threshold = top + hero.offsetHeight - 1;
      }
      header.classList.toggle("is-solid", y > threshold);
    };
    onScroll();
    if (lenis) lenis.on("scroll", onScroll);
    else window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  };

  const revealFromVars = (variant) => {
    switch (variant) {
      case "fade":
        return { opacity: 0 };
      case "scale":
        return { opacity: 0, scale: 1.04 };
      case "clip":
        return { clipPath: "inset(12% 12% 12% 12%)", opacity: 1 };
      case "up":
      default:
        return { opacity: 0, y: 36 };
    }
  };

  const revealToVars = (variant) => {
    switch (variant) {
      case "fade":
        return { opacity: 1, duration: 0.85, ease: "power2.out" };
      case "scale":
        return { opacity: 1, scale: 1, duration: 0.95, ease: "power3.out" };
      case "clip":
        return {
          clipPath: "inset(0% 0% 0% 0%)",
          opacity: 1,
          duration: 1.1,
          ease: "power3.inOut",
        };
      case "up":
      default:
        return { opacity: 1, y: 0, duration: 0.95, ease: "power3.out" };
    }
  };

  const clearRevealProps = (els) => {
    gsap.set(els, {
      opacity: 1,
      y: 0,
      scale: 1,
      clipPath: "none",
      clearProps: "transform,clipPath",
    });
  };

  const initHero = ({ skip = false } = {}) => {
    const items = document.querySelectorAll("[data-hero-anim]");
    if (!items.length) return;

    if (reduceMotion) {
      gsap.set(items, { opacity: 1, y: 0 });
      return;
    }

    if (skip || introPlaying) {
      gsap.set(items, { opacity: 0, y: 36 });
      heroPending = true;
      return;
    }

    heroPending = false;
    gsap.fromTo(
      items,
      { opacity: 0, y: 36 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        stagger: 0.11,
        ease: "power3.out",
        delay: 0.08,
      }
    );
  };

  const playPendingHero = () => {
    if (!heroPending) return;
    heroPending = false;
    const items = document.querySelectorAll("[data-hero-anim]");
    if (!items.length || reduceMotion) {
      if (items.length) gsap.set(items, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      items,
      { opacity: 0, y: 36 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        stagger: 0.11,
        ease: "power3.out",
      }
    );
  };

  const initHeroMedia = () => {
    const media = document.querySelectorAll(
      ".kf-hero-media, .kf-hero-video, .kf-page-hero > img"
    );
    if (!media.length) return;

    if (reduceMotion) {
      gsap.set(media, { scale: 1 });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    media.forEach((el) => {
      gsap.fromTo(
        el,
        { scale: 1.08 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: el.closest(".kf-hero, .kf-page-hero") || el,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        }
      );
    });
  };

  const initGalleriesParallax = () => {
    const section = document.querySelector("[data-galleries-parallax]");
    if (!section) return;

    const media = section.querySelector(".kf-galleries-hero-media");
    const label = section.querySelector(".kf-galleries-label");
    const body = section.querySelector(".kf-galleries-body");
    if (!media || !body) return;

    if (reduceMotion) {
      gsap.set([media, label].filter(Boolean), { clearProps: "transform,opacity" });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    gsap.fromTo(
      media,
      { yPercent: -8 },
      {
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      }
    );

    if (label) {
      gsap.fromTo(
        label,
        { y: 0, opacity: 1 },
        {
          y: -72,
          opacity: 0.15,
          ease: "none",
          scrollTrigger: {
            trigger: body,
            start: "top 88%",
            end: "top 35%",
            scrub: true,
          },
        }
      );
    }
  };

  const initReveals = () => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    const staggerParents = Array.from(document.querySelectorAll("[data-reveal-stagger]"));

    // Stagger parents without explicit child reveals: animate direct children
    staggerParents.forEach((parent) => {
      const kids = directRevealChildren(parent);
      if (kids.length) return;
      Array.from(parent.children).forEach((child) => {
        if (!child.hasAttribute("data-reveal")) {
          child.setAttribute("data-reveal", "scale");
          els.push(child);
        }
      });
    });

    if (!els.length) return;

    if (reduceMotion) {
      clearRevealProps(els);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const staggered = new Set();
    staggerParents.forEach((parent) => {
      const kids = directRevealChildren(parent);
      if (kids.length < 2) return;
      kids.forEach((k) => staggered.add(k));

      const variant = kids[0].getAttribute("data-reveal") || "up";
      gsap.fromTo(kids, revealFromVars(variant), {
        ...revealToVars(variant),
        stagger: 0.08,
        scrollTrigger: {
          trigger: parent,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });

    els.forEach((el) => {
      if (staggered.has(el)) return;
      const variant = el.getAttribute("data-reveal") || "up";
      gsap.fromTo(el, revealFromVars(variant), {
        ...revealToVars(variant),
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });
  };

  const finishLoader = (loader) => {
    introPlaying = false;
    document.body.classList.remove("kf-loader-active");
    document.documentElement.classList.add("kf-intro-seen");
    if (loader) {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      gsap.set(loader, { clearProps: "opacity,visibility" });
    }
    markIntroSeen();
    playPendingHero();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  };

  const hideLoader = (loader) => {
    if (!loader) return;
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    document.body.classList.remove("kf-loader-active");
  };

  const runHomeIntro = () => {
    if (reduceMotion || hasSeenIntro()) {
      hideLoader(document.querySelector("[data-kf-loader]"));
      markIntroSeen();
      document.documentElement.classList.add("kf-intro-seen");
      return Promise.resolve();
    }

    const loader = ensureLoader();
    const logo = loader.querySelector("[data-kf-loader-logo]");
    const sweep = loader.querySelector("[data-kf-loader-sweep]");
    const line = loader.querySelector("[data-kf-loader-line]");
    const top = loader.querySelector("[data-kf-loader-top]");
    const bottom = loader.querySelector("[data-kf-loader-bottom]");

    introPlaying = true;
    heroPending = true;
    loader.hidden = false;
    loader.setAttribute("aria-hidden", "false");
    document.body.classList.add("kf-loader-active");
    gsap.set(loader, { autoAlpha: 1 });

    gsap.set(logo, { opacity: 0, scale: 1.08 });
    gsap.set(sweep, { xPercent: -120 });
    gsap.set(line, { width: 0, opacity: 0.9 });
    gsap.set([top, bottom], { yPercent: 0 });

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        finishLoader(loader);
        resolve();
      };

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: done,
      });

      tl.to(logo, { opacity: 1, scale: 1, duration: 0.85 }, 0)
        .to(line, { width: "42%", duration: 0.55, ease: "power2.out" }, 0.35)
        .to(sweep, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, 0.55)
        .to(logo, { opacity: 0, scale: 0.94, duration: 0.45, ease: "power2.in" }, 1.45)
        .to(line, { opacity: 0, duration: 0.3 }, 1.5)
        .to(top, { yPercent: -101, duration: 0.75, ease: "expo.inOut" }, 1.65)
        .to(bottom, { yPercent: 101, duration: 0.75, ease: "expo.inOut" }, 1.65)
        .set(loader, { autoAlpha: 0 }, 2.4);

      window.setTimeout(() => {
        if (introPlaying) {
          tl.kill();
          done();
        }
      }, 4000);
    });
  };

  const killScrollTriggers = () => {
    if (window.ScrollTrigger) {
      ScrollTrigger.getAll().forEach((st) => st.kill());
    }
  };

  const rebindPageScript = (src) => {
    const script = document.createElement("script");
    script.src = `${src}?t=${Date.now()}`;
    document.body.appendChild(script);
  };

  const initPage = ({ deferHero = false } = {}) => {
    killScrollTriggers();
    initHero({ skip: deferHero });
    initHeroMedia();
    initGalleriesParallax();
    initReveals();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  };

  const coverTransition = () => {
    const root = ensureTransitionShell();
    const left = root.querySelector("[data-kf-pt-left]");
    const right = root.querySelector("[data-kf-pt-right]");
    const line = root.querySelector("[data-kf-pt-line]");

    root.classList.add("is-active");
    document.body.classList.add("kf-transitioning");

    gsap.set(left, { xPercent: -101 });
    gsap.set(right, { xPercent: 101 });
    gsap.set(line, { scaleY: 0, opacity: 0 });

    return gsap
      .timeline({ defaults: { ease: "power4.inOut" } })
      .to(left, { xPercent: 0, duration: 0.55 }, 0)
      .to(right, { xPercent: 0, duration: 0.55 }, 0)
      .to(line, { scaleY: 1, opacity: 1, duration: 0.35, ease: "power2.out" }, 0.2);
  };

  const uncoverTransition = () => {
    const root = document.querySelector("[data-kf-transition]");
    if (!root) return Promise.resolve();

    const left = root.querySelector("[data-kf-pt-left]");
    const right = root.querySelector("[data-kf-pt-right]");
    const line = root.querySelector("[data-kf-pt-line]");

    return gsap
      .timeline({
        defaults: { ease: "power4.inOut" },
        onComplete: () => {
          root.classList.remove("is-active");
          document.body.classList.remove("kf-transitioning");
          gsap.set([left, right], { clearProps: "transform" });
          gsap.set(line, { clearProps: "transform,opacity" });
        },
      })
      .to(line, { scaleY: 0, opacity: 0, duration: 0.25, ease: "power2.in" }, 0)
      .to(left, { xPercent: -101, duration: 0.65 }, 0.05)
      .to(right, { xPercent: 101, duration: 0.65 }, 0.05);
  };

  const afterPageEnter = async (namespace) => {
    if (namespace === "home" && !hasSeenIntro() && !reduceMotion) {
      initPage({ deferHero: true });
      await runHomeIntro();
    } else {
      initPage({ deferHero: false });
    }

    if (namespace === "home") {
      rebindPageScript("/js/home.js");
    } else if (namespace === "gallery") {
      rebindPageScript("/js/gallery.js");
    } else if (namespace === "vinyl-catalog" || namespace === "lookbook") {
      rebindPageScript("/js/vinyl-catalog-page.js");
    } else if (namespace === "vinyl-catalog-film" || namespace === "lookbook-film") {
      rebindPageScript("/js/vinyl-catalog-film.js");
    }
  };

  const initBarba = () => {
    if (typeof barba === "undefined") return;

    ensureTransitionShell();

    barba.init({
      preventRunning: true,
      transitions: [
        {
          name: "film-gate",
          async leave() {
            if (reduceMotion) return;
            await coverTransition();
          },
          async enter(data) {
            window.scrollTo(0, 0);
            if (lenis) lenis.scrollTo(0, { immediate: true });

            if (reduceMotion) {
              gsap.set(data.next.container, { opacity: 1 });
              return;
            }

            gsap.set(data.next.container, { opacity: 1 });
            await uncoverTransition();
          },
          async after(data) {
            await afterPageEnter(data.next.namespace);
          },
        },
      ],
      views: [
        { namespace: "home" },
        { namespace: "styleguide" },
        { namespace: "gallery" },
        { namespace: "vinyl-catalog" },
        { namespace: "vinyl-catalog-film" },
        { namespace: "lookbook" },
        { namespace: "lookbook-film" },
      ],
      prevent: ({ el }) => {
        if (!el) return false;
        const href = el.getAttribute("href") || "";
        if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#"))
          return true;
        let path = href.split("?")[0].replace(/\.html$/, "").replace(/\/$/, "") || "/";
        if (
          path === "/lookbook/film" ||
          path === "/vinyl-catalog/film" ||
          path.endswith("/film")
        ) {
          return true;
        }
        const allowed = ["/", "/styleguide", "/gallery", "/lookbook", "/vinyl-catalog", "/login"];
        return !allowed.includes(path);
      },
    });
  };

  if (typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);
  lenis = initLenis();
  initHeaderSolid();
  ensureTransitionShell();

  const isHome =
    document.querySelector('[data-barba-namespace="home"]') ||
    window.location.pathname === "/" ||
    window.location.pathname.endsWith("/index.html");

  const boot = async () => {
    const shouldIntro = Boolean(isHome) && !hasSeenIntro() && !reduceMotion;
    initPage({ deferHero: shouldIntro });

    if (shouldIntro) {
      await runHomeIntro();
    } else {
      hideLoader(document.querySelector("[data-kf-loader]"));
      if (hasSeenIntro() || reduceMotion) {
        document.documentElement.classList.add("kf-intro-seen");
      }
    }

    initBarba();
  };

  boot();
})();
