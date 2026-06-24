/* Karriaro Branchen-KI-Concierge — wiederverwendbares Chat-Widget (2026-06-04, KI-Werkzeug #2).
 * Einbinden: <script src="/js/concierge.js" data-branche="immobilien"
 *   data-name="Stadtmakler Stuttgart" data-accent="#1A2E40" defer></script>
 * Spricht den Cloud-Function-Endpoint /concierge (Claude Haiku, Branchen-Persona) an.
 * Sonderfall data-branche="karriaro": Grounded-Mode gegen /siteAsk — jede Frage stateless,
 * Antworten kommen ausschließlich aus dem Seiteninhalt, Quellen werden als Chips verlinkt. */
(function () {
    'use strict';
    // Code-Review-Fix: nicht in eingebetteten Demo-Previews (iframe) initialisieren — sonst
    // schwebt der FAB/das Panel über jeder Vorschau-Kachel der Startseite. Im iframe (egal ob
    // ?embed=hero, same- oder cross-origin) → raus.
    try { if (window.self !== window.top) return; } catch (e) { return; }
    var script = document.currentScript;
    var BRANCHE = (script && script.getAttribute('data-branche')) || '';
    var BIZ = (script && script.getAttribute('data-name')) || 'unser Team';
    var ACCENT = (script && script.getAttribute('data-accent')) || '#1A2E40';
    var POSITION = (script && script.getAttribute('data-position')) === 'left' ? 'left' : 'right';
    var GREETING = (script && script.getAttribute('data-greeting')) ||
        ('Hallo! Ich bin der digitale Assistent von ' + BIZ + '. Wie kann ich Ihnen helfen?');
    var FN_BASE = 'https://europe-west1-apex-executive.cloudfunctions.net';
    // Grounded-Mode für die Karriaro-Hauptseite: stateless /siteAsk statt /concierge-Persona.
    var IS_KARRIARO = BRANCHE === 'karriaro';

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')) { /* respected in CSS */ }

    // ── Styles ──
    var css = '' +
        '.krc-fab{position:fixed;bottom:24px;right:24px;z-index:2147483600;display:inline-flex;align-items:center;gap:9px;box-sizing:border-box;min-height:44px;' +
        'padding:13px 20px;border:none;border-radius:999px;background:' + ACCENT + ';color:#fff;font:500 14px/1 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;' +
        'cursor:pointer;box-shadow:0 12px 32px rgba(20,40,60,.30);transition:transform .18s ease,box-shadow .18s ease}' +
        '.krc-fab:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(20,40,60,.38)}' +
        '.krc-fab svg{width:18px;height:18px}' +
        '.krc-fab.krc-hide,.krc-fab.krc-hero-hide{display:none}' +
        '.krc-panel{position:fixed;bottom:24px;right:24px;z-index:2147483601;width:370px;max-width:calc(100vw - 28px);height:540px;max-height:calc(100vh - 48px);' +
        'background:#fff;border-radius:16px;box-shadow:0 28px 70px rgba(20,40,60,.30);display:none;flex-direction:column;overflow:hidden;' +
        'border:1px solid rgba(20,32,43,.1);font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif}' +
        '.krc-panel.krc-open{display:flex;animation:krc-in .26s cubic-bezier(.16,1,.3,1) both}' +
        '@keyframes krc-in{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}' +
        '.krc-head{display:flex;align-items:center;gap:11px;padding:15px 16px;background:' + ACCENT + ';color:#fff}' +
        '.krc-head-seal{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
        '.krc-head-seal svg{width:17px;height:17px}' +
        '.krc-head-meta{flex:1;min-width:0}' +
        '.krc-head-name{font-weight:600;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.krc-head-sub{font-size:11px;opacity:.75;letter-spacing:.04em}' +
        '.krc-close{background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.85;padding:2px 6px}' +
        '.krc-close:hover{opacity:1}' +
        '.krc-msgs{flex:1;overflow-y:auto;padding:18px 16px;display:flex;flex-direction:column;gap:12px;background:#FBFAF7}' +
        '.krc-msg{max-width:84%;padding:11px 14px;border-radius:14px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}' +
        '.krc-msg.bot{align-self:flex-start;background:#fff;color:#16202C;border:1px solid rgba(20,32,43,.1);border-bottom-left-radius:4px}' +
        '.krc-msg.user{align-self:flex-end;background:' + ACCENT + ';color:#fff;border-bottom-right-radius:4px}' +
        '.krc-typing{align-self:flex-start;display:inline-flex;gap:4px;padding:13px 15px;background:#fff;border:1px solid rgba(20,32,43,.1);border-radius:14px;border-bottom-left-radius:4px}' +
        '.krc-typing span{width:6px;height:6px;border-radius:50%;background:rgba(20,32,43,.4);animation:krc-bounce 1.2s infinite}' +
        '.krc-typing span:nth-child(2){animation-delay:.18s}.krc-typing span:nth-child(3){animation-delay:.36s}' +
        '@keyframes krc-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}' +
        '.krc-form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(20,32,43,.1);background:#fff}' +
        '.krc-input{flex:1;resize:none;border:1px solid rgba(20,32,43,.2);border-radius:10px;padding:10px 12px;font:400 14.5px/1.4 inherit;color:#16202C;max-height:90px;outline:none}' +
        '.krc-input:focus{border-color:' + ACCENT + '}' +
        '.krc-send{flex:0 0 auto;width:40px;border:none;border-radius:10px;background:' + ACCENT + ';color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
        '.krc-send:disabled{opacity:.4;cursor:default}.krc-send svg{width:18px;height:18px}' +
        '.krc-foot{font-size:10px;text-align:center;color:#9a9a9f;padding:0 12px 9px;background:#fff;letter-spacing:.03em}' +
        '.krc-sources{align-self:flex-start;display:flex;flex-wrap:wrap;gap:6px;max-width:84%;margin-top:-4px}' +
        '.krc-source{font:500 11.5px/1.3 inherit;color:#16202C;text-decoration:none;background:#fff;border:1px solid rgba(20,32,43,.16);border-radius:999px;padding:5px 11px;letter-spacing:.01em;transition:border-color .15s ease,color .15s ease}' +
        '.krc-source:hover{border-color:' + ACCENT + ';color:' + ACCENT + '}' +
        '.krc-fab.krc-left{left:24px;right:auto}.krc-panel.krc-left{left:24px;right:auto}' +
        '.krc-fab.krc-raised{bottom:88px}' +
        '@media (prefers-reduced-motion:reduce){.krc-panel.krc-open{animation:none}.krc-typing span{animation:none}.krc-fab{transition:none}}';
    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
    var ICON_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/></svg>';

    // ── DOM ──
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'krc-fab';
    fab.setAttribute('aria-label', 'KI-Assistent öffnen');
    fab.innerHTML = ICON_CHAT + '<span>Fragen Sie uns</span>';

    var panel = document.createElement('div');
    panel.className = 'krc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'KI-Concierge ' + BIZ);
    panel.innerHTML =
        '<div class="krc-head"><div class="krc-head-seal">' + ICON_SPARK + '</div>' +
        '<div class="krc-head-meta"><div class="krc-head-name">' + escapeHtml(BIZ) + '</div>' +
        '<div class="krc-head-sub">KI-Concierge · antwortet sofort</div></div>' +
        '<button type="button" class="krc-close" aria-label="Schließen">×</button></div>' +
        '<div class="krc-msgs" aria-live="polite"></div>' +
        '<form class="krc-form"><textarea class="krc-input" rows="1" placeholder="Ihre Frage …" aria-label="Nachricht"></textarea>' +
        '<button type="submit" class="krc-send" aria-label="Senden">' + ICON_SEND + '</button></form>' +
        '<div class="krc-foot">' + (IS_KARRIARO
            ? 'Antworten aus dem Seiteninhalt · Quellen verlinkt · KI kann Fehler machen'
            : 'KI-Assistent · kann Fehler machen') + '</div>';

    // ── Kollisionssichere Platzierung (Sprint 251). data-position ist nur ein HINWEIS:
    //    (1) Liegt auf der Hinweis-Ecke ein schwebender WhatsApp-Button (oder ein
    //        [data-kr-avoid]-Element), weicht das Widget auf die freie Ecke aus.
    //    (2) ECHTE Bounding-Box-Garantie: überlappt der FAB danach trotzdem noch einen
    //        WhatsApp-FAB (z.B. breite Pill bei Zoom/großer Schrift auf schmalem Handy
    //        — reicht über die Mitte) ODER die „Erstgespräch"-Float-CTA, wird er
    //        angehoben (krc-raised → bottom:88px) und stapelt sich darüber. So können
    //        sich „WhatsApp" und „Fragen Sie uns" auf KEINER Seite je überlagern. ──
    function krcWaRects() {
        var rects = [], vh = window.innerHeight || document.documentElement.clientHeight || 0;
        var nodes;
        try {
            nodes = document.querySelectorAll(
                'a[href*="wa.me"],a[href*="api.whatsapp.com"],a[href*="whatsapp.com/send"],' +
                '.whatsapp-sticky,.whatsapp-fab,[class*="whatsapp"],[data-kr-avoid]');
        } catch (e) { nodes = document.querySelectorAll('.whatsapp-sticky,[data-kr-avoid]'); }
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el === fab || el === panel || fab.contains(el) || panel.contains(el)) continue;
            var cs = window.getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;   // nur SCHWEBENDE Buttons
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            var b = el.getBoundingClientRect();
            if (b.width < 1 || b.height < 1) continue;
            if (b.bottom < vh * 0.55) continue;                                  // nur unterer Bildschirmbereich
            rects.push(b);
        }
        return rects;
    }
    function krcHit(a, b) { return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); }
    var krcWaRaise = false;
    // Teuer (Seite + Bbox-Messung) — nur bei load/resize/Init.
    function krcLayout() {
        var wa = krcWaRects();
        var vw = window.innerWidth || document.documentElement.clientWidth || 0;
        // (1) freie Ecke wählen (Hinweis = POSITION)
        var occ = { left: false, right: false };
        for (var i = 0; i < wa.length; i++) occ[(wa[i].left + wa[i].width / 2) < vw / 2 ? 'left' : 'right'] = true;
        var side = POSITION;
        if (occ[side]) { var other = side === 'right' ? 'left' : 'right'; if (!occ[other]) side = other; }
        var isLeft = side === 'left';
        fab.classList.toggle('krc-left', isLeft);
        panel.classList.toggle('krc-left', isLeft);
        // (2) FAB OHNE Raise messen → echte Überlappungsprüfung gegen jeden WhatsApp-FAB
        krcWaRaise = false;
        if (document.body.contains(fab)) {
            fab.classList.remove('krc-raised');
            var fb = fab.getBoundingClientRect();
            var GAP = 18;  // Sicherheitsabstand: ANHEBEN, bevor sich die Symbole fast berühren
            if (fb.width) for (var j = 0; j < wa.length; j++) {
                var w = wa[j];
                if (krcHit(fb, { left: w.left - GAP, right: w.right + GAP, top: w.top - GAP, bottom: w.bottom + GAP })) { krcWaRaise = true; break; }
            }
        }
        krcSyncRaise();
    }
    // Billig (nur CTA-Zustand + gecachtes krcWaRaise) — auch bei scroll.
    function krcSyncRaise() {
        var cta = document.querySelector('.kr-cta-float');
        var ctaShown = !!cta && getComputedStyle(cta).display !== 'none' && cta.classList.contains('is-visible');
        fab.classList.toggle('krc-raised', krcWaRaise || ctaShown);
    }
    krcLayout();
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    krcLayout();                                          // erneut MIT im DOM gemessenem FAB
    window.addEventListener('load', krcLayout);
    window.addEventListener('resize', krcLayout, { passive: true });
    window.addEventListener('scroll', krcSyncRaise, { passive: true });

    var msgsEl = panel.querySelector('.krc-msgs');
    var formEl = panel.querySelector('.krc-form');
    var inputEl = panel.querySelector('.krc-input');
    var sendBtn = panel.querySelector('.krc-send');
    var history = [];
    var greeted = false;
    var busy = false;

    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }

    function addMsg(role, text) {
        var el = document.createElement('div');
        el.className = 'krc-msg ' + (role === 'user' ? 'user' : 'bot');
        el.textContent = text;
        msgsEl.appendChild(el);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return el;
    }
    // Karriaro-Grounded-Mode: Quellen-Chips unter der Bot-Antwort. Aufbau rein über
    // DOM-API + textContent (kein innerHTML) — heading/url/anchor kommen vom Server,
    // werden aber wie alle Messages behandelt: nie als HTML interpretiert. Zusätzlich
    // nur seiteninterne Pfade (führender „/") als href zulassen.
    function addSources(sources) {
        var wrap = document.createElement('div');
        wrap.className = 'krc-sources';
        var added = 0;
        for (var i = 0; i < sources.length && added < 4; i++) {
            var s = sources[i] || {};
            var url = typeof s.url === 'string' ? s.url : '';
            if (url.charAt(0) !== '/' || url.charAt(1) === '/' || url.charAt(1) === '\\') continue; // nur relative Pfade, kein „//host" (Browser normalisieren \ zu /)
            var a = document.createElement('a');
            a.className = 'krc-source';
            a.href = url + (s.anchor ? '#' + s.anchor : '');
            a.target = '_self';
            a.textContent = String(s.heading || url);
            wrap.appendChild(a);
            added++;
        }
        if (!added) return;
        msgsEl.appendChild(wrap);
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function showTyping() {
        var t = document.createElement('div');
        t.className = 'krc-typing';
        t.innerHTML = '<span></span><span></span><span></span>';
        msgsEl.appendChild(t);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return t;
    }

    function openPanel() {
        panel.classList.add('krc-open');
        fab.classList.add('krc-hide');
        if (!greeted) { greeted = true; addMsg('bot', GREETING); }
        setTimeout(function () { inputEl.focus(); }, 60);
    }
    function closePanel() {
        panel.classList.remove('krc-open');
        fab.classList.remove('krc-hide');
    }

    fab.addEventListener('click', openPanel);
    panel.querySelector('.krc-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('krc-open')) closePanel(); });

    // Hero-Schutz: FAB ausblenden, solange der primäre Hero-CTA im Viewport ist,
    // damit die Bubble den Kauf-Button nie überlagert. Erscheint, sobald der
    // Nutzer am Hero vorbeigescrollt ist. (Die alte krc-raised-Logik greift nur
    // gegen fixed/sticky-Elemente, nicht gegen den statischen In-Hero-CTA.)
    var krcHeroCta = document.querySelector('.hero-with-photo .hero-cta-row .btn, .hero-with-photo .hero-cta-row a, .hero-with-photo .btn');
    if (krcHeroCta && 'IntersectionObserver' in window) {
        fab.classList.add('krc-hero-hide'); // Default am Hero versteckt; Observer korrigiert
        new IntersectionObserver(function (entries) {
            fab.classList.toggle('krc-hero-hide', entries[0].isIntersecting);
        }, { threshold: 0 }).observe(krcHeroCta);
    }

    // Auto-grow textarea + Enter to send (Shift+Enter = newline)
    inputEl.addEventListener('input', function () { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(90, inputEl.scrollHeight) + 'px'; });
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit ? formEl.requestSubmit() : send(); } });

    formEl.addEventListener('submit', function (e) { e.preventDefault(); send(); });

    function send() {
        if (busy) return;
        var text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = ''; inputEl.style.height = 'auto';
        addMsg('user', text);
        // siteAsk-Vertrag: Frage 3–300 Zeichen. Zu kurz/zu lang ehrlich abfangen,
        // statt einen 400er später als „Verbindung nicht möglich" zu verkaufen.
        if (IS_KARRIARO && (text.length < 3 || text.length > 300)) {
            addMsg('bot', text.length < 3
                ? 'Mögen Sie Ihre Frage etwas ausführlicher stellen? Dann kann ich gezielt im Seiteninhalt nachsehen.'
                : 'Ihre Frage ist etwas zu lang (maximal 300 Zeichen). Mögen Sie sie kürzer fassen?');
            return;
        }
        if (!IS_KARRIARO) history.push({ role: 'user', content: text });
        busy = true; sendBtn.disabled = true;
        var typing = showTyping();

        var ctrl = new AbortController();
        var to = setTimeout(function () { ctrl.abort(); }, 28000);

        // Karriaro-Hauptseite: Grounded-Mode /siteAsk — jede Frage stateless, KEINE History.
        fetch(FN_BASE + (IS_KARRIARO ? '/siteAsk' : '/concierge'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(IS_KARRIARO
                ? { question: text }
                : { branche: BRANCHE, messages: history.slice(-12) }),
            signal: ctrl.signal
        }).then(function (r) {
            clearTimeout(to);
            if (r.status === 429) throw new Error('rate');
            return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'fail'); return j; });
        }).then(function (j) {
            typing.remove();
            if (IS_KARRIARO) {
                // Grounded-Antwort: answer kommt server-seitig belegt zurück (auch bei
                // found:false ehrlich formuliert). Quellen-Chips nur bei found:true.
                var answer = (j && j.answer) || 'Das kann ich gerade nicht beantworten. Mögen Sie es anders formulieren?';
                addMsg('bot', answer);
                if (j && j.found && j.sources && j.sources.length) addSources(j.sources);
                return;
            }
            var reply = (j && j.reply) || 'Entschuldigung, das habe ich nicht verstanden. Mögen Sie es anders formulieren?';
            addMsg('bot', reply);
            history.push({ role: 'assistant', content: reply });
        }).catch(function (err) {
            clearTimeout(to);
            typing.remove();
            // Code-Review-Fix: fehlgeschlagenen user-Turn aus der History entfernen — sonst bleibt
            // ein unbeantworteter user-Turn stehen, die nächste Nachricht erzeugt zwei user-Rollen
            // in Folge → Anthropic-API 400 → Chat tot bis Reload. (Karriaro-Mode: keine History.)
            if (!IS_KARRIARO) history.pop();
            var msg = err && err.message === 'rate'
                ? 'Gerade sind sehr viele Anfragen unterwegs — bitte versuchen Sie es in einer Stunde erneut, oder nutzen Sie das Kontaktformular.'
                : 'Verbindung gerade nicht möglich. Bitte versuchen Sie es erneut oder nutzen Sie das Kontaktformular.';
            addMsg('bot', msg);
        }).then(function () {
            busy = false; sendBtn.disabled = false; inputEl.focus();
        });
    }
})();
