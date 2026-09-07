(function () {
  'use strict';

  if (!document.body.classList.contains('agh-home-body')) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function initReveal() {
    var nodes = document.querySelectorAll('[data-agh-tile]');
    if (!nodes.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach(function (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }
    nodes.forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)';
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'none';
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.08 }
    );
    nodes.forEach(function (el) {
      io.observe(el);
    });
  }

  function initMagnetic() {
    if (reduce || window.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('.agh-magnetic').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var rect = el.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        el.style.transform =
          'translate(' + (x / 18).toFixed(2) + 'px,' + (y / 18).toFixed(2) + 'px)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  function initParallax() {
    if (reduce) return;
    var decos = document.querySelectorAll('.agh-deco');
    if (!decos.length) return;
    var ticking = false;
    function paint() {
      var y = window.scrollY || 0;
      decos.forEach(function (el, i) {
        var speed = 0.03 + (i % 3) * 0.012;
        var rot = (i % 2 === 0 ? 1 : -1) * y * 0.012;
        el.style.transform =
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

  function initGsapLite() {
    if (reduce || !window.gsap) return;
    var gsap = window.gsap;
    var hero = document.querySelector('[data-agh-hero]');
    if (hero) {
      gsap.from(hero.querySelectorAll('.agh-hero__eyebrow, .agh-hero__brand, .agh-hero__title, .agh-hero__lead, .agh-hero__actions, .agh-chip-row'), {
        y: 22,
        opacity: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
      });
      var plant = hero.querySelector('.agh-hero__plant');
      if (plant) {
        gsap.from(plant, { x: 24, opacity: 0, duration: 0.95, delay: 0.1, ease: 'power3.out' });
        var leaves = plant.querySelectorAll('.js-agh-leaf');
        if (leaves.length) {
          gsap.to(leaves, {
            rotate: 2.5,
            transformOrigin: '70% 80%',
            duration: 3,
            yoyo: true,
            repeat: -1,
            stagger: 0.3,
            ease: 'sine.inOut',
          });
        }
      }
    }
  }

  onReady(function () {
    initReveal();
    initMagnetic();
    initParallax();
    if (window.gsap) {
      initGsapLite();
    } else {
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (window.gsap || tries > 40) {
          window.clearInterval(timer);
          if (window.gsap) initGsapLite();
        }
      }, 50);
    }
  });
})();
