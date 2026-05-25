/* Karriaro — Audit Magic-Moment (Sprint 168).
 *
 * Editorial-stille "Erste Einschätzung"-Section. User gibt URL ein,
 * Phyllotaxis-Siegel rotiert ~8s linear, 3 Status-Phrasen morphen alle
 * ~1.2s. Nach 3-5s erscheint Result-Panel inline unter der Form.
 *
 * Backend: europe-west1-apex-executive.cloudfunctions.net/quickAudit
 * (Sprint 162 — Light-Audit-only, 3-5s Latenz, 24h-Cache, Rate-Limit 5/h/IP).
 *
 * Voice-Disziplin (CLAUDE.md):
 *  - Keine SaaS-Filler ("kostenlos", "60 Sekunden", "keine Kreditkarte")
 *  - Editorial-Phrasen, "Sie"-Anrede, Manufaktur-Voice
 *  - Score qualitativ ("Solide"/"Stark"/"Ausbaufaehig"), nicht prominent als Zahl
 */
(function () {
    'use strict';

    var FN_BASE = 'https://europe-west1-apex-executive.cloudfunctions.net';
    var MIN_SCAN_MS = 2500;
    var MAX_SCAN_MS = 6000;
    var PHASE_PHRASES = [
        'Wird geprüft …',
        'Lese Struktur und Konformität …',
        'Erste Diagnose entsteht …'
    ];
    var PHASE_INTERVAL_MS = 1200;

    function normalizeUrl(raw) {
        var s = String(raw || '').trim();
        if (!s) return '';
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        try {
            var u = new URL(s);
            return u.origin + u.pathname.replace(/\/$/, '') + (u.search || '');
        } catch (e) {
            return '';
        }
    }

    function deriveDomain(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch (e) { return ''; }
    }

    function track(event, props) {
        if (typeof window.plausible === 'function') {
            try { window.plausible(event, { props: props || {} }); } catch (e) {}
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function scoreVerdict(score) {
        if (typeof score !== 'number') {
            return {
                label: 'Auf den ersten Blick',
                detail: 'Eine Tiefenmessung folgt im Detail-Brief.',
                tag: 'unbekannt'
            };
        }
        if (score >= 80) return {
            label: 'Stark',
            detail: 'Substanz auf der Höhe der Manufaktur-Klasse.',
            tag: 'stark'
        };
        if (score >= 55) return {
            label: 'Solide',
            detail: 'Tragfähige Basis, mit feinen Hebeln im Detail.',
            tag: 'solide'
        };
        return {
            label: 'Ausbaufähig',
            detail: 'Die Substanz trägt, der Auftritt verdient mehr.',
            tag: 'ausbaufaehig'
        };
    }

    function pickTopFindings(result) {
        var pool = [];
        if (result && Array.isArray(result.painPoints)) {
            result.painPoints.forEach(function (p) {
                if (!p) return;
                if (typeof p === 'string') {
                    pool.push({ label: p, detail: '' });
                } else if (typeof p === 'object') {
                    var label = p.label || p.title || p.summary || p.id || '';
                    var detail = p.why || p.detail || p.evidence || p.pitch || '';
                    if (label) pool.push({ label: String(label), detail: String(detail) });
                }
            });
        }
        if (result && result.bfsg && typeof result.bfsg === 'object') {
            if (result.bfsg.score != null && result.bfsg.score < 80) {
                pool.push({
                    label: 'BFSG-Konformität mit Lücken',
                    detail: 'Einige Pflicht-Signale (Sprache, Labels, Skip-Link) fehlen oder sind unvollständig.'
                });
            }
        }
        if (result && result.seoGeo && typeof result.seoGeo === 'object') {
            if (result.seoGeo.geoScore != null && result.seoGeo.geoScore < 50) {
                pool.push({
                    label: 'KI-Auffindbarkeit dünn',
                    detail: 'ChatGPT, Perplexity und Gemini finden zu wenige strukturierte Signale.'
                });
            }
        }
        var seen = {}, out = [];
        pool.forEach(function (item) {
            var key = item.label.toLowerCase().slice(0, 60);
            if (seen[key]) return;
            seen[key] = true;
            out.push(item);
        });
        if (!out.length) {
            out.push({
                label: 'Substanziell solide',
                detail: 'Im Detail-Brief zeigen wir die feineren Hebel — die Schritte, die ein geübtes Auge sieht.'
            });
        }
        return out.slice(0, 3);
    }

    function renderResultHtml(result, url) {
        var domain = (result && result.domain) || deriveDomain(url) || (url || '');
        var rawScore = (result && result.light && typeof result.light.score === 'number')
            ? result.light.score
            : (result && typeof result.score === 'number' ? result.score : null);
        var verdict = scoreVerdict(rawScore);
        var findings = pickTopFindings(result);
        var branchHint = '';
        if (result && result.branch && result.branch.name) {
            branchHint = '<p class="kr-audit-result-branch">Branchen-Bezug: <em>'
                + escapeHtml(result.branch.name) + '</em></p>';
        }
        var prefill = encodeURIComponent(url || '');
        var findingsHtml = findings.map(function (f) {
            var detail = f.detail
                ? '<p class="kr-audit-result-finding-detail">' + escapeHtml(f.detail) + '</p>'
                : '';
            return '<li class="kr-audit-result-finding">' +
                '<p class="kr-audit-result-finding-label">' + escapeHtml(f.label) + '</p>' +
                detail + '</li>';
        }).join('');

        return '' +
            '<article class="kr-audit-result" data-audit-result>' +
            '<p class="kr-audit-result-folio">№&nbsp;02 · Erste Einschätzung</p>' +
            '<p class="kr-audit-result-domain"><em>' + escapeHtml(domain) + '</em></p>' +
            '<div class="kr-audit-result-verdict" data-verdict="' + escapeHtml(verdict.tag) + '">' +
                '<span class="kr-audit-result-verdict-label">' + escapeHtml(verdict.label) + '</span>' +
                '<span class="kr-audit-result-verdict-detail">' + escapeHtml(verdict.detail) + '</span>' +
            '</div>' +
            branchHint +
            '<ol class="kr-audit-result-findings">' + findingsHtml + '</ol>' +
            '<p class="kr-audit-result-note">' +
                'Erste Einschätzung auf öffentlich sichtbaren Signalen. ' +
                'Ein Detail-Brief geht tiefer: Web Vitals im Detail, BFSG-Audit, ' +
                'branchen-spezifische Empfehlungen.' +
            '</p>' +
            '<div class="kr-audit-result-cta-row">' +
                '<a class="kr-audit-result-cta" href="/?prefill=' + prefill + '#kontakt" ' +
                    'data-audit-detail-link data-audit-domain="' + escapeHtml(domain) + '">' +
                    '30-Minuten-Brief anfragen — wir gehen tief →' +
                '</a>' +
                '<button type="button" class="kr-audit-result-reset" data-audit-result-reset>' +
                    'Eine weitere Adresse prüfen' +
                '</button>' +
            '</div>' +
            '<p class="kr-audit-result-trust">Antwort in 24 h.</p>' +
            '</article>';
    }

    function setStatus(stage, text) {
        var el = stage.querySelector('[data-audit-magic-status]');
        if (!el) return;
        el.style.transition = 'opacity 240ms ease';
        el.style.opacity = '0';
        setTimeout(function () {
            el.textContent = text;
            el.style.opacity = '1';
        }, 240);
    }

    function showStage(form, stage) {
        form.style.transition = 'opacity 200ms ease';
        form.style.opacity = '0';
        setTimeout(function () {
            form.style.display = 'none';
            stage.hidden = false;
            requestAnimationFrame(function () {
                stage.style.opacity = '1';
            });
            var seal = stage.querySelector('.kr-audit-magic-seal');
            if (seal) seal.classList.add('kr-audit-magic-seal--spin');
        }, 200);
    }

    function hideStage(stage) {
        stage.hidden = true;
        stage.style.opacity = '0';
        var seal = stage.querySelector('.kr-audit-magic-seal');
        if (seal) seal.classList.remove('kr-audit-magic-seal--spin');
        var status = stage.querySelector('[data-audit-magic-status]');
        if (status) {
            status.textContent = PHASE_PHRASES[0];
            status.classList.remove('kr-audit-magic-status--error');
        }
    }

    function resetSection(section, form, stage, resultHost) {
        hideStage(stage);
        if (resultHost) {
            resultHost.innerHTML = '';
            resultHost.hidden = true;
        }
        form.style.display = '';
        form.style.opacity = '1';
        var input = form.querySelector('[data-audit-magic-input]');
        if (input) input.focus();
    }

    function startPhaseLoop(stage) {
        var i = 0;
        return setInterval(function () {
            i = (i + 1) % PHASE_PHRASES.length;
            setStatus(stage, PHASE_PHRASES[i]);
        }, PHASE_INTERVAL_MS);
    }

    function showInlineError(stage, message) {
        var status = stage.querySelector('[data-audit-magic-status]');
        if (status) {
            status.textContent = message;
            status.classList.add('kr-audit-magic-status--error');
        }
        var seal = stage.querySelector('.kr-audit-magic-seal');
        if (seal) seal.classList.remove('kr-audit-magic-seal--spin');
    }

    function ensureResultHost(section, stage) {
        var host = section.querySelector('[data-audit-result-host]');
        if (host) return host;
        host = document.createElement('div');
        host.className = 'kr-audit-result-host';
        host.setAttribute('data-audit-result-host', '');
        host.hidden = true;
        stage.parentNode.insertBefore(host, stage.nextSibling);
        return host;
    }

    function commitResult(section, form, stage, resultHost, result, url) {
        function apply() {
            hideStage(stage);
            resultHost.innerHTML = renderResultHtml(result, url);
            resultHost.hidden = false;
            // Wire reset-button
            var resetBtn = resultHost.querySelector('[data-audit-result-reset]');
            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    resetSection(section, form, stage, resultHost);
                });
            }
            // Wire detail-cta tracking
            var detailLink = resultHost.querySelector('[data-audit-detail-link]');
            if (detailLink) {
                detailLink.addEventListener('click', function () {
                    track('Magic Audit Detail Requested', {
                        domain: detailLink.getAttribute('data-audit-domain') || ''
                    });
                });
            }
            // Scroll result into comfortable view (not the very top — keep section header visible)
            requestAnimationFrame(function () {
                if (resultHost.scrollIntoView) {
                    resultHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
        if (document.startViewTransition) {
            document.startViewTransition(apply);
        } else {
            apply();
        }
    }

    function init() {
        var forms = document.querySelectorAll('form[data-audit-magic]');
        if (!forms.length) return;

        forms.forEach(function (form) {
            var section = form.closest('.kr-audit-magic') || form.parentNode;
            var stage = section.querySelector('[data-audit-magic-stage]');
            var input = form.querySelector('[data-audit-magic-input]');
            var hp    = form.querySelector('input[name="hp"]');
            if (!stage || !input) return;
            var resultHost = ensureResultHost(section, stage);

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (hp && hp.value) return;

                var url = normalizeUrl(input.value);
                if (!url) {
                    input.setCustomValidity('Bitte eine gültige Adresse angeben.');
                    input.reportValidity();
                    return;
                }
                input.setCustomValidity('');
                var domain = deriveDomain(url);
                track('Magic Audit Submitted', { domain: domain });

                showStage(form, stage);
                var phaseTimer = startPhaseLoop(stage);
                var scanStart = Date.now();
                var done = false;

                var fetchPromise = fetch(FN_BASE + '/quickAudit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url, hp: '' })
                }).then(function (res) {
                    if (res.status === 429) { var e1 = new Error('rate_limited'); e1.code = 429; throw e1; }
                    if (!res.ok)            { var e2 = new Error('http_' + res.status); e2.code = res.status; throw e2; }
                    return res.json();
                });

                var timeoutPromise = new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error('timeout')); }, MAX_SCAN_MS);
                });

                Promise.race([fetchPromise, timeoutPromise]).then(function (result) {
                    if (done) return;
                    done = true;
                    var elapsed = Date.now() - scanStart;
                    var wait = Math.max(0, MIN_SCAN_MS - elapsed);
                    setTimeout(function () {
                        clearInterval(phaseTimer);
                        var verdict = scoreVerdict(
                            (result && result.light && typeof result.light.score === 'number')
                                ? result.light.score
                                : (result && typeof result.score === 'number' ? result.score : null)
                        );
                        track('Magic Audit Completed', {
                            domain: (result && result.domain) || domain,
                            branch: (result && result.branch && result.branch.name) || '',
                            scoreLabel: verdict.tag
                        });
                        commitResult(section, form, stage, resultHost, result || {}, url);
                    }, wait);
                }).catch(function (err) {
                    if (done) return;
                    done = true;
                    clearInterval(phaseTimer);
                    var message;
                    var reason;
                    if (err && err.code === 429) {
                        message = 'Bereits geprüft — bitte in einer Stunde erneut.';
                        reason = 'rate_limited';
                    } else if (err && err.message === 'timeout') {
                        message = 'Diese Seite lässt sich gerade nicht öffnen. Versuchen Sie es in einer Minute erneut.';
                        reason = 'timeout';
                    } else {
                        message = 'Etwas ist schiefgegangen. Versuchen Sie es in einer Minute erneut.';
                        reason = (err && err.message) || 'unknown';
                    }
                    track('Magic Audit Failed', { reason: reason, domain: domain });
                    showInlineError(stage, message);
                    setTimeout(function () {
                        resetSection(section, form, stage, resultHost);
                    }, 4500);
                });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
