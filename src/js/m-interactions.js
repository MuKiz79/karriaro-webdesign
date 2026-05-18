/* ============================================================
   Karriaro Mobile — Interactions (Sprint 128)

   Konsolidiert die zuvor inline-injizierten <script>-Bloecke
   aus scripts/build-mobile-pages.mjs in eine einzige Datei.

   Selbstschutz: jedes Modul prueft existence seiner Targets via
   `if (!el) return;` — dadurch ist die Datei auf jeder Page
   (auch Desktop) load-safe; Inhalte ohne passende Elemente werden
   uebersprungen.

   Wird per `<script src="/js/m-interactions.js?v=128" defer>` am
   </body>-Ende geladen. Defer = nach DOM-Parse, vor DOMContentLoaded.

   Module:
   1. mStickyCta        — IntersectionObserver, blendet Sticky-Bar
                          nach Hero ein (Sprint 94/100)
   2. mHeroDemoSpot     — Auto-Rotation + Click-to-Scroll des
                          Hero-Demo-Cards (Sprint 105)
   3. mPersonaTiles     — Persona-Tile → Demo-Slide-Scroll +
                          Sheet-Modal-Open (Sprint 103)
   4. mScrollAnimations — Counter-Up, Pull-Quote-Reveal, Mag-Sections
                          Stagger-In (Sprint 95/100)
   5. mDemoSwiper       — Demo-Swiper Dot-Indicator, IO-Spy,
                          Sheet-Modal Open/Close (Sprint 93/95)
   ============================================================ */

(function () {
    'use strict';

    // ─── 1. Sticky-CTA-Bar (Sprint 94/100) ───────────────────────
    function mStickyCta() {
        var bar = document.querySelector('[data-m-sticky-cta]');
        var hero = document.querySelector('.hero-with-photo') || document.querySelector('.hero, [class*="hero"]');
        if (!bar) return;
        if (!hero || !('IntersectionObserver' in window)) {
            bar.classList.add('is-visible');
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                bar.classList.toggle('is-visible', !e.isIntersecting);
            });
        }, { threshold: 0.05 });
        io.observe(hero);
    }

    // ─── 2. Hero-Demo-Spot Auto-Rotation (Sprint 105) ───────────
    function mHeroDemoSpot() {
        var domainEl = document.querySelector('[data-m-hero-demo-domain]');
        var webpEl   = document.querySelector('[data-m-hero-demo-webp]');
        var imgEl    = document.querySelector('[data-m-hero-demo-img]');
        var canvas   = document.querySelector('[data-m-hero-demo-canvas]');
        var card     = document.querySelector('[data-m-hero-demo-click]');
        if (!card || !canvas) return;

        var rotation = [
            { slug: 'immobilien-stadtmakler', domain: 'stadtmakler-stuttgart.de' },
            { slug: 'praxis-weber',           domain: 'praxis-weber.de' },
            { slug: 'friseur-mueller',        domain: 'salon-mueller.de' }
        ];
        var idx = 0;

        var rmq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
        var reducedMotion = rmq && rmq.matches;

        if (!reducedMotion) {
            setInterval(function () {
                idx = (idx + 1) % rotation.length;
                var next = rotation[idx];
                canvas.style.opacity = '0';
                setTimeout(function () {
                    if (domainEl) domainEl.textContent = next.domain;
                    if (webpEl)   webpEl.srcset = '/images/mockups-opt/' + next.slug + '-mockup-480.webp';
                    if (imgEl)    imgEl.src    = '/images/mockups-opt/' + next.slug + '-mockup-800.jpg';
                    canvas.style.opacity = '1';
                }, 280);
            }, 4000);
        }

        card.addEventListener('click', function () {
            var demos = document.querySelector('#demos');
            if (demos) demos.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // ─── 3. Persona-Tile Click → Demo-Sheet (Sprint 103) ────────
    function mPersonaTiles() {
        var tiles = document.querySelectorAll('[data-m-persona-target]');
        if (!tiles.length) return;
        tiles.forEach(function (t) {
            t.addEventListener('click', function () {
                var idx = parseInt(t.getAttribute('data-m-persona-target'), 10);
                if (isNaN(idx)) return;
                var slide = document.querySelector('[data-m-demo-slide="' + idx + '"]');
                if (!slide) return;
                slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'center' });
                var card = slide.querySelector('[data-m-demo-open]');
                if (card) setTimeout(function () { card.click(); }, 320);
            });
        });
    }

    // ─── 4. Editorial-Scroll-Animations (Sprint 95/100) ─────────
    function mScrollAnimations() {
        if (!('IntersectionObserver' in window)) return;

        var counters = document.querySelectorAll('.m-hero-counter');
        if (counters.length) {
            var ioCounter = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    var el = e.target;
                    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
                    var dur = 1200, start = performance.now();
                    function tick(now) {
                        var p = Math.min(1, (now - start) / dur);
                        var eased = 1 - Math.pow(1 - p, 3);
                        el.textContent = Math.round(target * eased).toLocaleString('de-DE');
                        if (p < 1) requestAnimationFrame(tick);
                    }
                    requestAnimationFrame(tick);
                    ioCounter.unobserve(el);
                });
            }, { threshold: 0.5 });
            counters.forEach(function (c) { ioCounter.observe(c); });
        }

        var quotes = document.querySelectorAll('blockquote, .pull-quote');
        if (quotes.length) {
            var ioQuote = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) {
                        e.target.classList.add('m-in-view');
                        ioQuote.unobserve(e.target);
                    }
                });
            }, { threshold: 0.2 });
            quotes.forEach(function (q) { ioQuote.observe(q); });
        }

        var magSections = document.querySelectorAll('.m-mag-specs, .m-mag-tools, .m-mag-proof, .m-mag-siegel');
        if (magSections.length) {
            var ioMag = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) {
                        e.target.classList.add('m-in-view');
                        ioMag.unobserve(e.target);
                    }
                });
            }, { threshold: 0.15 });
            magSections.forEach(function (s) { ioMag.observe(s); });
        }
    }

    // ─── 5. Demo-Swiper Dots + Sheet-Modal (Sprint 93/95) ───────
    function mDemoSwiper() {
        var rail = document.querySelector('[data-m-demo-rail]');
        var dotsBox = document.querySelector('[data-m-demo-dots]');
        var sheet = document.querySelector('[data-m-demo-sheet]');
        var sheetFrame = document.querySelector('[data-m-demo-sheet-frame]');
        var sheetLoader = document.querySelector('[data-m-demo-sheet-loader]');
        var sheetTitle = document.querySelector('[data-m-demo-sheet-title]');
        var sheetEyebrow = document.querySelector('[data-m-demo-sheet-eyebrow]');
        var sheetTab = document.querySelector('[data-m-demo-sheet-tab]');
        if (!rail || !dotsBox || !sheet) return;
        var slides = rail.querySelectorAll('.m-demo-swiper-slide');
        if (!slides.length) return;

        slides.forEach(function (_, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'm-demo-swiper-dot' + (i === 0 ? ' is-active' : '');
            b.setAttribute('aria-label', 'Demo ' + (i + 1) + ' von ' + slides.length);
            b.addEventListener('click', function () {
                slides[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
            });
            dotsBox.appendChild(b);
        });
        var dotEls = dotsBox.querySelectorAll('.m-demo-swiper-dot');

        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting && e.intersectionRatio > 0.6) {
                        var i = Array.prototype.indexOf.call(slides, e.target);
                        if (i >= 0) dotEls.forEach(function (d, j) { d.classList.toggle('is-active', j === i); });
                    }
                });
            }, { root: rail, threshold: [0.6] });
            slides.forEach(function (s) { io.observe(s); });
        }

        var lastFocus = null;
        function openSheet(href, title, domain) {
            lastFocus = document.activeElement;
            if (sheetTitle) sheetTitle.textContent = title;
            if (sheetEyebrow) sheetEyebrow.textContent = domain;
            if (sheetTab) sheetTab.setAttribute('href', href);
            if (sheetLoader) sheetLoader.classList.remove('is-hidden');
            if (sheetFrame) {
                sheetFrame.setAttribute('src', href);
                sheetFrame.style.opacity = '0';
            }
            sheet.classList.add('is-open');
            sheet.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
        function closeSheet() {
            sheet.classList.remove('is-open');
            sheet.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (sheetFrame) {
                sheetFrame.setAttribute('src', 'about:blank');
                sheetFrame.style.opacity = '0';
            }
            if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        }
        if (sheetFrame) {
            sheetFrame.addEventListener('load', function () {
                if (sheetFrame.getAttribute('src') === 'about:blank') return;
                if (sheetLoader) sheetLoader.classList.add('is-hidden');
                sheetFrame.style.transition = 'opacity 240ms ease';
                sheetFrame.style.opacity = '1';
            });
        }
        document.querySelectorAll('[data-m-demo-open]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                openSheet(el.getAttribute('data-m-demo-href'), el.getAttribute('data-m-demo-title'), el.getAttribute('data-m-demo-domain'));
            });
        });
        document.querySelectorAll('[data-m-demo-sheet-close]').forEach(function (el) {
            el.addEventListener('click', closeSheet);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
        });
    }

    // ─── Boot ────────────────────────────────────────────────────
    function boot() {
        mStickyCta();
        mHeroDemoSpot();
        mPersonaTiles();
        mScrollAnimations();
        mDemoSwiper();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
