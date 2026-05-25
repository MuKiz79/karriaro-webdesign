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

    // ─── 4. Editorial-Scroll-Animations (Sprint 95/100/132) ─────
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

        // Sprint 132 — Section-Reveal erweitert auf alle Magazine-Sections
        // (Personas + Demos + Kontakt zusätzlich zu Specs/Tools/Proof/Siegel).
        var magSections = document.querySelectorAll(
            '.m-mag-specs, .m-mag-tools, .m-mag-proof, .m-mag-siegel,' +
            ' .m-mag-personas, .m-demo-swiper-mobile, section[id="kontakt"]'
        );
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

    // ─── 6. Section-Spy: BG + Pin-Spy (Sprint 132/133) ──────────
    // Beobachtet welche Magazine-Section die größte Sichtbarkeit hat
    // und setzt
    //   a) body --m-section-bg (Sprint 132 Magazine-Page-Turn)
    //   b) data-m-pin-spy-num + data-m-pin-spy-label (Sprint 133 Pin-Spy)
    function mSectionBgSpy() {
        if (!('IntersectionObserver' in window)) return;

        // Section-Konfiguration: Selektor → key → CSS-Variable + Pin-Spy-Daten.
        // Sprint 134: BG kommt aus tokens.css via CSS-Variable — Dark-Mode-aware
        // (Variable wird in @media (prefers-color-scheme: dark) überschrieben).
        var SECTIONS = [
            { sel: '.hero-with-photo',      key: 'hero',     num: '01', label: 'COVER',    bgVar: '--m-bg-hero' },
            { sel: '.m-demo-swiper-mobile', key: 'demos',    num: '02', label: 'DEMOS',    bgVar: '--m-bg-demos' },
            { sel: '.m-mag-personas',       key: 'personas', num: '03', label: 'INDEX',    bgVar: '--m-bg-personas' },
            { sel: '.m-mag-tools',          key: 'tools',    num: '04', label: 'TOOLS',    bgVar: '--m-bg-tools' },
            { sel: '.m-mag-siegel',         key: 'siegel',   num: '05', label: 'SIEGEL',   bgVar: '--m-bg-siegel' },
            { sel: 'section[id="kontakt"]', key: 'kontakt',  num: '06', label: 'KONTAKT',  bgVar: '--m-bg-kontakt' }
        ];
        var sections = SECTIONS
            .map(function (s) { return Object.assign({}, s, { el: document.querySelector(s.sel) }); })
            .filter(function (s) { return s.el; });
        if (!sections.length) return;

        // Pin-Spy DOM-References
        var pinSpy      = document.querySelector('[data-m-pin-spy]');
        var pinSpyNum   = document.querySelector('[data-m-pin-spy-num]');
        var pinSpyLabel = document.querySelector('[data-m-pin-spy-label]');

        var visibility = new Map();
        var lastKey = null;

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                visibility.set(e.target, e.intersectionRatio);
            });
            // Höchste Sichtbarkeit gewinnt. Initial-acc mit ratio:-1 damit
            // jede gemessene Sichtbarkeit (auch 0) den Default ersetzt.
            var bestRatio = -1;
            var best = sections[0];
            for (var i = 0; i < sections.length; i++) {
                var s = sections[i];
                var r = visibility.get(s.el);
                if (typeof r === 'number' && r > bestRatio) {
                    bestRatio = r;
                    best = s;
                }
            }
            // Body-BG-Update (Sprint 132/134) — liest aktuellen Wert der
            // Section-bgVar (CSS-Variable aus tokens.css, Dark-Mode-aware).
            var rootStyles = getComputedStyle(document.documentElement);
            var bgValue = rootStyles.getPropertyValue(best.bgVar).trim() || '#FBFAF7';
            document.body.style.setProperty('--m-section-bg', bgValue);
            // Pin-Spy-Update (Sprint 133)
            if (pinSpy && best.key !== lastKey) {
                if (pinSpyNum)   pinSpyNum.textContent   = best.num;
                if (pinSpyLabel) pinSpyLabel.textContent = best.label;
                // Erscheinen erst ab Section 02 (Demos) — auf Hero zu viel Lärm
                if (best.num === '01') {
                    pinSpy.classList.remove('is-visible');
                } else {
                    pinSpy.classList.add('is-visible');
                }
                lastKey = best.key;
            }
        }, {
            threshold: [0, 0.25, 0.5, 0.75, 1.0]
        });
        sections.forEach(function (s) { io.observe(s.el); });
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

        // Sprint 148.6 — Transform-Scale iframe-Live-Preview im Desktop-
        // Viewport (1280×800). Card ist 16:10 MacBook-Browser-Mockup,
        // iframe rendert Portfolio-Page in Desktop-Layout (zweispaltiges
        // Hero), wird via transform:scale auf Card-Stage-Breite verkleinert.
        var IFRAME_NATIVE_W = 1280;
        var IFRAME_NATIVE_H = 1024;

        function setIframeScale(stage) {
            var w = stage.clientWidth;
            if (!w) return;
            var scale = w / IFRAME_NATIVE_W;
            stage.style.setProperty('--m-iframe-scale', scale.toFixed(4));
            // CSS aspect-ratio: 390/488 auf .m-poster-stage handhabt Höhe
            // automatisch — kein inline-style nötig.
        }

        var stages = rail.querySelectorAll('.m-poster-stage');
        stages.forEach(setIframeScale);

        if ('ResizeObserver' in window) {
            var ro = new ResizeObserver(function (entries) {
                entries.forEach(function (e) { setIframeScale(e.target); });
            });
            stages.forEach(function (s) { ro.observe(s); });
        } else {
            window.addEventListener('resize', function () {
                stages.forEach(setIframeScale);
            }, { passive: true });
        }

        // iframe-Lazy-Load (Sprint 140 / 148.5 / 154 Performance-Audit):
        //   - Sprint 154 OPT-1: navigator.connection adaption — saveData/3G → 0 eager
        //   - Sprint 154 OPT-2: dynamic rootMargin nach effectiveType (3G=300, 4G=150)
        //   - Sprint 154 OPT-2: threshold 0.1 → 0.25 (Horizontal-Rail braucht aktiveres Intent)
        //   - Sprint 154 OPT-4: requestIdleCallback für Lazy-Observer-Registration
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        var isSlow = conn && (
            conn.effectiveType === 'slow-2g' ||
            conn.effectiveType === '2g' ||
            conn.effectiveType === '3g' ||
            conn.saveData === true
        );
        var rootMarginValue = '200px 0px';
        if (conn) {
            if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
                rootMarginValue = '300px 0px';
            } else if (conn.effectiveType === '4g') {
                rootMarginValue = '150px 0px';
            }
        }
        var frames = rail.querySelectorAll('.m-poster-frame[data-m-poster-src]');
        function loadFrame(frame) {
            if (frame.src && frame.src !== 'about:blank') return;
            frame.src = frame.getAttribute('data-m-poster-src');
            frame.addEventListener('load', function () {
                frame.classList.add('is-loaded');
            }, { once: true });
        }
        var eagerLimit = isSlow ? 0 : 2;
        var eagerCount = 0;
        frames.forEach(function (f) {
            if (f.hasAttribute('data-m-poster-eager') && eagerCount < eagerLimit) {
                loadFrame(f);
                eagerCount++;
            }
        });
        if ('IntersectionObserver' in window) {
            var frameIo = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) { loadFrame(e.target); frameIo.unobserve(e.target); }
                });
            }, { rootMargin: rootMarginValue, threshold: 0.25 });
            var registerLazy = function () {
                frames.forEach(function (f) {
                    if (!f.hasAttribute('data-m-poster-eager')) frameIo.observe(f);
                });
            };
            if ('requestIdleCallback' in window) {
                requestIdleCallback(registerLazy, { timeout: 2000 });
            } else {
                registerLazy();
            }
        } else {
            frames.forEach(loadFrame);
        }

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
        // Sprint 143 (Senior-Review C-5) — Fail-Timeout damit der Spinner nicht
        // ewig dreht, falls die Demo-Page nie lädt (CSP, Network, sandboxed).
        var loadTimer = null;
        var loadErrorEl = null;
        function clearLoadTimer() {
            if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
            if (loadErrorEl) loadErrorEl.style.display = 'none';
        }
        function showLoadError() {
            if (sheetLoader) sheetLoader.classList.add('is-hidden');
            if (!loadErrorEl && sheetFrame && sheetFrame.parentNode) {
                loadErrorEl = document.createElement('div');
                loadErrorEl.setAttribute('role', 'status');
                loadErrorEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.55;color:var(--kr-ink,#14202B);background:var(--kr-bg,#FBFAF7);';
                loadErrorEl.innerHTML = '<div><strong style="display:block;margin-bottom:6px;font-weight:600;">Demo konnte nicht geladen werden.</strong><span style="opacity:0.7;">Bitte direkt unter dem Link unten öffnen.</span></div>';
                sheetFrame.parentNode.appendChild(loadErrorEl);
            }
            if (loadErrorEl) loadErrorEl.style.display = 'flex';
        }
        function openSheet(href, title, domain) {
            lastFocus = document.activeElement;
            if (sheetTitle) sheetTitle.textContent = title;
            if (sheetEyebrow) sheetEyebrow.textContent = domain;
            if (sheetTab) sheetTab.setAttribute('href', href);
            if (sheetLoader) sheetLoader.classList.remove('is-hidden');
            clearLoadTimer();
            if (sheetFrame) {
                // Sprint 160 — Lean-Embed-HTML (build-embed-hero.mjs) statt ?embed=hero.
                // Source: 53-154 KB pro Portfolio-Page → Lean: 23-62 KB (-60%).
                // Eliminiert Webfonts, Scripts, External-CSS, Schema, Footer, Nav.
                // Fallback bei /<slug>.html → /<slug>-embed.html-Pattern.
                var leanSrc = href.replace(/\.html(\?.*)?$/, '-embed.html');
                sheetFrame.setAttribute('src', leanSrc);
                sheetFrame.style.opacity = '0';
                loadTimer = setTimeout(showLoadError, 8000);
            }
            sheet.classList.add('is-open');
            sheet.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
        function closeSheet() {
            clearLoadTimer();
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
                clearLoadTimer();
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

    // ─── 6. Mobile-Menu A11y (Sprint 143 — Senior-Review C-7) ────
    // aria-expanded-Toggle, Escape-Key zum Schliessen, Focus-Trap im
    // offenen Menu (Tab/Shift+Tab bleiben im Menu), Focus-Return auf
    // Toggle-Button beim Schliessen.
    function mMobileMenu() {
        var toggle = document.querySelector('.menu-toggle');
        var menu = document.getElementById('mobile-menu');
        if (!toggle || !menu) return;
        // Inline-onclick aus Source-HTML neutralisieren — Mobile bekommt
        // den vollen Handler (aria-expanded + Escape + Focus-Trap).
        toggle.onclick = null;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'mobile-menu');
        function isOpen() { return menu.classList.contains('open'); }
        function focusables() {
            return menu.querySelectorAll('a[href], button:not([disabled])');
        }
        function openMenu() {
            menu.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Menü schließen');
            var first = focusables()[0];
            if (first) first.focus();
        }
        function closeMenu(returnFocus) {
            menu.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Menü öffnen');
            if (returnFocus !== false) toggle.focus();
        }
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            if (isOpen()) closeMenu(); else openMenu();
        });
        // Link-Click im Menu schliesst es (Navigation passiert sowieso)
        menu.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { closeMenu(false); });
        });
        // Escape-Key (WCAG 1.4.13)
        document.addEventListener('keydown', function (e) {
            if (!isOpen()) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeMenu();
                return;
            }
            // Focus-Trap (Tab + Shift+Tab)
            if (e.key !== 'Tab') return;
            var els = focusables();
            if (!els.length) return;
            var first = els[0];
            var last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    // ─── Boot ────────────────────────────────────────────────────
    function boot() {
        mStickyCta();
        mHeroDemoSpot();
        mPersonaTiles();
        mScrollAnimations();
        mDemoSwiper();
        mSectionBgSpy();    // Sprint 132
        mMobileMenu();      // Sprint 143
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
