/* Karriaro Branchen-KI-Concierge — wiederverwendbares Chat-Widget (2026-06-04, KI-Werkzeug #2).
 * Einbinden: <script src="/js/concierge.js" data-branche="immobilien"
 *   data-name="Stadtmakler Stuttgart" data-accent="#1A2E40" defer></script>
 * Spricht den Cloud-Function-Endpoint /concierge (Claude Haiku, Branchen-Persona) an. */
(function () {
    'use strict';
    var script = document.currentScript;
    var BRANCHE = (script && script.getAttribute('data-branche')) || '';
    var BIZ = (script && script.getAttribute('data-name')) || 'unser Team';
    var ACCENT = (script && script.getAttribute('data-accent')) || '#1A2E40';
    var GREETING = (script && script.getAttribute('data-greeting')) ||
        ('Hallo! Ich bin der digitale Assistent von ' + BIZ + '. Wie kann ich Ihnen helfen?');
    var FN_BASE = 'https://europe-west1-apex-executive.cloudfunctions.net';

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')) { /* respected in CSS */ }

    // ── Styles ──
    var css = '' +
        '.krc-fab{position:fixed;bottom:24px;right:24px;z-index:2147483600;display:inline-flex;align-items:center;gap:9px;' +
        'padding:13px 20px;border:none;border-radius:999px;background:' + ACCENT + ';color:#fff;font:500 14px/1 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;' +
        'cursor:pointer;box-shadow:0 12px 32px rgba(20,40,60,.30);transition:transform .18s ease,box-shadow .18s ease}' +
        '.krc-fab:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(20,40,60,.38)}' +
        '.krc-fab svg{width:18px;height:18px}' +
        '.krc-fab.krc-hide{display:none}' +
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
        '<div class="krc-foot">KI-Assistent · kann Fehler machen</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

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
        history.push({ role: 'user', content: text });
        busy = true; sendBtn.disabled = true;
        var typing = showTyping();

        var ctrl = new AbortController();
        var to = setTimeout(function () { ctrl.abort(); }, 28000);

        fetch(FN_BASE + '/concierge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branche: BRANCHE, messages: history.slice(-12) }),
            signal: ctrl.signal
        }).then(function (r) {
            clearTimeout(to);
            if (r.status === 429) throw new Error('rate');
            return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'fail'); return j; });
        }).then(function (j) {
            typing.remove();
            var reply = (j && j.reply) || 'Entschuldigung, das habe ich nicht verstanden. Mögen Sie es anders formulieren?';
            addMsg('bot', reply);
            history.push({ role: 'assistant', content: reply });
        }).catch(function (err) {
            clearTimeout(to);
            typing.remove();
            var msg = err && err.message === 'rate'
                ? 'Gerade sind sehr viele Anfragen unterwegs — bitte versuchen Sie es in einer Stunde erneut, oder nutzen Sie das Kontaktformular.'
                : 'Verbindung gerade nicht möglich. Bitte versuchen Sie es erneut oder nutzen Sie das Kontaktformular.';
            addMsg('bot', msg);
        }).then(function () {
            busy = false; sendBtn.disabled = false; inputEl.focus();
        });
    }
})();
