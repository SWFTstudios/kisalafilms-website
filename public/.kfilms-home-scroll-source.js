<script src="https://unpkg.com/lenis@1.1.14/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<script>
(function () {
  if (window.__kfilmsHomeScrollReady) return;
  window.__kfilmsHomeScrollReady = true;

  var homeMm = null;
  var marqueeTween = null;
  var marqueeBoostHandler = null;

  function ensurePlugins() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return false;
    gsap.registerPlugin(ScrollTrigger);
    return true;
  }

  function ensureLenis() {
    if (!ensurePlugins()) return null;
    if (typeof Lenis === 'undefined') return null;
    if (!window.lenis) {
      var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
      window.lenis = lenis;
    }
    return window.lenis;
  }

  function scopeRoot(root) {
    if (root && root.querySelector) return root;
    return document.querySelector('[data-barba="container"]') || document;
  }

  function hasHomeMarkers(scope) {
    return !!(
      scope.querySelector('.horizontal') ||
      scope.querySelector('.marquee-track') ||
      scope.querySelector('.theatre-pin') ||
      scope.querySelector('.about-intro-media') ||
      scope.querySelector('.theatre-list')
    );
  }

  window.kfilmsDestroyHome = function () {
    if (homeMm && homeMm.revert) {
      try { homeMm.revert(); } catch (e) {}
    }
    homeMm = null;
    if (marqueeTween) {
      try { marqueeTween.kill(); } catch (e) {}
      marqueeTween = null;
    }
    if (marqueeBoostHandler && window.lenis && typeof window.lenis.off === 'function') {
      try { window.lenis.off('scroll', marqueeBoostHandler); } catch (e) {}
      marqueeBoostHandler = null;
    }
    if (typeof ScrollTrigger === 'undefined') return;
    ScrollTrigger.getAll().forEach(function (st) {
      var t = st.trigger;
      if (!t) {
        st.kill();
        return;
      }
      if (
        t.closest &&
        (t.closest('.horizontal') ||
          t.closest('.about-intro-media') ||
          t.closest('.theatre-pin') ||
          t.closest('.theatre-list') ||
          t.closest('.marquee-section'))
      ) {
        st.kill();
      }
    });
  };

  function initAboutWipe(scope) {
    var media = scope.querySelector('.about-intro-media');
    var image = scope.querySelector('.about-image-placeholder');
    if (!media || !image) return;
    gsap.fromTo(
      image,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)',
        ease: 'none',
        scrollTrigger: {
          trigger: media,
          start: 'top 80%',
          end: 'top 30%',
          scrub: true,
        },
      }
    );
  }

  function initMarquee(scope, lenis) {
    var track = scope.querySelector('.marquee-track');
    if (!track) return;

    if (!track.getAttribute('data-kf-marquee-ready')) {
      var originals = Array.prototype.slice.call(track.children);
      originals.forEach(function (child) {
        track.appendChild(child.cloneNode(true));
      });
      track.setAttribute('data-kf-marquee-ready', '1');
    }

    marqueeTween = gsap.to(track, {
      x: function () {
        return -track.scrollWidth / 2;
      },
      duration: 45,
      ease: 'none',
      repeat: -1,
    });

    var idleTimer;
    function boostFromVelocity(velocity) {
      var boost = Math.min(Math.abs(velocity) / 600, 3);
      var target = 1 + boost;
      gsap.to(marqueeTween, {
        timeScale: target,
        duration: 0.35,
        overwrite: true,
        ease: 'power2.out',
      });
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        gsap.to(marqueeTween, {
          timeScale: 1,
          duration: 0.8,
          overwrite: true,
          ease: 'power2.out',
        });
      }, 120);
    }

    if (lenis) {
      marqueeBoostHandler = function (e) {
        boostFromVelocity(e.velocity || 0);
      };
      lenis.on('scroll', marqueeBoostHandler);
    } else {
      ScrollTrigger.create({
        onUpdate: function (self) {
          boostFromVelocity(self.getVelocity());
        },
      });
    }
  }

  function initTheatrePin(scope) {
    var pin = scope.querySelector('.theatre-pin');
    var reel = scope.querySelector('.theatre-reel');
    if (!pin || !reel) return;

    function getStartSize() {
      var vw = window.innerWidth;
      return vw < 768 ? vw * 0.55 : vw * 0.4;
    }

    gsap.fromTo(
      reel,
      {
        width: function () {
          return getStartSize();
        },
        height: function () {
          return getStartSize();
        },
        aspectRatio: '1 / 1',
      },
      {
        width: function () {
          return window.innerWidth;
        },
        height: function () {
          return window.innerHeight;
        },
        aspectRatio: 'auto',
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true,
        },
      }
    );
  }

  function initTheatreList(scope) {
    var depts = gsap.utils.toArray(scope.querySelectorAll('.theatre-dept'));
    if (!depts.length) return;

    var intro = scope.querySelector('.theatre-list-intro');
    if (intro) {
      gsap.from(intro.children, {
        opacity: 0,
        y: 24,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: intro,
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });
    }

    depts.forEach(function (dept) {
      var line = dept.querySelector('.theatre-dept-line');
      var label = dept.querySelector('.theatre-dept-label');
      var links = dept.querySelector('.theatre-dept-links');
      var desc = dept.querySelector('.theatre-dept-desc');
      var media = dept.querySelector('.theatre-dept-media');

      if (line) {
        gsap.fromTo(
          line,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'power2.out',
            duration: 1,
            scrollTrigger: {
              trigger: dept,
              start: 'top 75%',
              toggleActions: 'play none none none',
            },
          }
        );
      }

      var fadeItems = [label, links, desc, media].filter(Boolean);
      if (fadeItems.length) {
        gsap.from(fadeItems, {
          opacity: 0,
          y: 28,
          duration: 0.75,
          stagger: 0.12,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: dept,
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        });
      }
    });
  }

  function initHorizontal(scope) {
    homeMm = gsap.matchMedia();
    homeMm.add('(min-width: 769px)', function () {
      var horizontal = scope.querySelector('.horizontal');
      if (!horizontal) return;

      var horizontalContent = horizontal.querySelector('.horizontal_wrapper');
      if (!horizontalContent) return;

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: horizontal,
          start: 'top top',
          end: function () {
            return '+=' + (horizontalContent.scrollWidth - window.innerWidth);
          },
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });

      tl.to(horizontalContent, {
        x: function () {
          return -(horizontalContent.scrollWidth - window.innerWidth);
        },
        ease: 'none',
      });

      var wallPieces = gsap.utils.toArray(scope.querySelectorAll('[class*="wall-piece-"]'));
      var pieceTriggers = [];

      wallPieces.forEach(function (piece) {
        var anim = gsap.fromTo(
          piece,
          { scale: 0.35 },
          {
            scale: 1,
            duration: 0.9,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: piece,
              containerAnimation: tl,
              start: 'left 85%',
              toggleActions: 'play none none none',
            },
          }
        );
        if (anim.scrollTrigger) pieceTriggers.push(anim.scrollTrigger);
      });

      return function () {
        pieceTriggers.forEach(function (st) {
          st.kill();
        });
        if (tl.scrollTrigger) tl.scrollTrigger.kill();
        tl.kill();
        gsap.set(horizontalContent, { clearProps: 'x' });
        gsap.set(wallPieces, { clearProps: 'scale' });
      };
    });
  }

  window.kfilmsInitHome = function (root) {
    if (!ensurePlugins()) return;
    var scope = scopeRoot(root);
    if (!hasHomeMarkers(scope)) return;

    window.kfilmsDestroyHome();
    var lenis = ensureLenis();
    if (lenis && lenis.start) {
      try { lenis.start(); } catch (e) {}
    }

    initAboutWipe(scope);
    initMarquee(scope, lenis);
    initHorizontal(scope);
    initTheatrePin(scope);
    initTheatreList(scope);

    requestAnimationFrame(function () {
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(true);
    });
  };

  function boot() {
    var container = document.querySelector('[data-barba-namespace="home"]') ||
      document.querySelector('[data-barba="container"]');
    if (container && hasHomeMarkers(container)) {
      window.kfilmsInitHome(container);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
</script>
