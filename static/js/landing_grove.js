(function () {
  'use strict';

  if (!document.body.classList.contains('grove-page')) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function initBackTop() {
    var btn = document.getElementById('grove-back-top');
    if (!btn) return;
    var SHOW_AFTER = 360;
    var HIDE_BELOW = 120;

    function update() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > SHOW_AFTER) {
        btn.classList.add('is-on');
        btn.setAttribute('aria-hidden', 'false');
      } else if (y < HIDE_BELOW) {
        btn.classList.remove('is-on');
        btn.setAttribute('aria-hidden', 'true');
      }
    }

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          update();
          ticking = false;
        });
      },
      { passive: true }
    );
    update();
  }

  function initChapterReveal() {
    var chapters = document.querySelectorAll('[data-grove-chapter]');
    if (!chapters.length) return;

    if (reduce || !('IntersectionObserver' in window)) {
      chapters.forEach(function (el) {
        el.classList.add('is-in');
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    chapters.forEach(function (el) {
      io.observe(el);
    });
  }

  function initMagnetic() {
    if (reduce || window.matchMedia('(pointer: coarse)').matches) return;
    var nodes = document.querySelectorAll('.grove-magnetic');
    nodes.forEach(function (el) {
      var strength = 12;
      el.addEventListener('pointermove', function (e) {
        var rect = el.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        el.style.transform =
          'translate(' + (x / strength).toFixed(2) + 'px,' + (y / strength).toFixed(2) + 'px)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  function initLeafParallax() {
    if (reduce) return;
    var leaves = document.querySelectorAll('.grove-deco');
    if (!leaves.length) return;
    var ticking = false;
    function paint() {
      var y = window.scrollY || 0;
      leaves.forEach(function (leaf, i) {
        var speed = 0.03 + (i % 6) * 0.014;
        var rot = (i % 2 === 0 ? 1 : -1) * y * 0.015;
        leaf.style.transform =
          'translate3d(0,' + (y * speed).toFixed(2) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
      });
      ticking = false;
    }
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(paint);
      },
      { passive: true }
    );
    paint();
  }

  function initGsapMotion() {
    if (reduce || !window.gsap) return;
    var gsap = window.gsap;
    if (window.ScrollTrigger) {
      gsap.registerPlugin(window.ScrollTrigger);
    }

    var hero = document.querySelector('[data-grove-hero]');
    if (hero) {
      gsap.from(hero.querySelectorAll('.grove-hero__brand, .grove-hero__title, .grove-hero__sub, .grove-hero__actions, .grove-chip-row'), {
        y: 28,
        opacity: 0,
        duration: 0.9,
        stagger: 0.1,
        ease: 'power3.out',
      });
      var plant = hero.querySelector('.grove-hero__plant');
      if (plant) {
        gsap.from(plant, { x: 40, opacity: 0, duration: 1.1, delay: 0.15, ease: 'power3.out' });
        var leafPaths = plant.querySelectorAll('.js-leaf');
        if (leafPaths.length) {
          gsap.to(leafPaths, {
            rotate: 3,
            transformOrigin: '70% 80%',
            duration: 3.2,
            yoyo: true,
            repeat: -1,
            stagger: 0.35,
            ease: 'sine.inOut',
          });
        }
      }
    }

    if (window.ScrollTrigger) {
      gsap.utils.toArray('.grove-visual__bar > i').forEach(function (bar) {
        gsap.fromTo(
          bar,
          { scaleX: 0, transformOrigin: 'left center' },
          {
            scaleX: 1,
            duration: 1.1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: bar.closest('.grove-chapter') || bar,
              start: 'top 75%',
              once: true,
            },
          }
        );
      });
    }
  }

  onReady(function () {
    initBackTop();
    initChapterReveal();
    initMagnetic();
    initLeafParallax();

    // GSAP may still be loading due to defer order; wait briefly if needed
    if (window.gsap) {
      initGsapMotion();
    } else {
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (window.gsap || tries > 40) {
          window.clearInterval(timer);
          if (window.gsap) initGsapMotion();
        }
      }, 50);
    }
  });
})();
