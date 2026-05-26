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
    var MAX_SCAN_MS = 18000;
    var LOG = function () {
        if (typeof console === 'undefined' || !console.log) return;
        var args = ['[audit-magic]'].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    };
    var ERR = function () {
        if (typeof console === 'undefined' || !console.error) return;
        var args = ['[audit-magic]'].concat(Array.prototype.slice.call(arguments));
        console.error.apply(console, args);
    };
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
        // Sprint 168.3 — Schema des echten quickAudit-Backends:
        // painPoints ist ein OBJECT mit Keys (socialMeta/securityHeaders/...),
        // jeder Eintrag hat { ok: bool, label: string }.
        // bfsg.complianceScore (0-100), seoGeo.seo.{found,total},
        // seoGeo.geo.{found,total}, branch.{foundCount,totalCount,pitchArg}.
        var pool = [];
        if (result && result.painPoints && typeof result.painPoints === 'object') {
            Object.keys(result.painPoints).forEach(function (k) {
                var item = result.painPoints[k];
                if (item && item.ok === false && item.label) {
                    pool.push({ label: String(item.label), detail: '' });
                }
            });
        }
        if (result && result.bfsg && typeof result.bfsg.complianceScore === 'number') {
            if (result.bfsg.complianceScore < 80) {
                pool.push({
                    label: 'BFSG-Konformität mit Lücken',
                    detail: 'Einige Pflicht-Signale (Sprache, Labels, Skip-Link) fehlen oder sind unvollständig.'
                });
            }
        }
        if (result && result.seoGeo) {
            var sg = result.seoGeo;
            if (sg.seo && sg.seo.total && sg.seo.found / sg.seo.total < 0.7) {
                pool.push({
                    label: 'SEO-Signale unvollständig',
                    detail: sg.seo.found + ' von ' + sg.seo.total + ' Pflicht-Elementen vorhanden (Schema, Canonical, Meta-Description, Title, robots.txt, sitemap).'
                });
            }
            if (sg.geo && sg.geo.total && sg.geo.found / sg.geo.total < 0.7) {
                pool.push({
                    label: 'KI-Auffindbarkeit dünn',
                    detail: 'Für ChatGPT, Perplexity und Gemini fehlen strukturierte Signale (FAQ-Schema, Breadcrumb-Schema, llms.txt).'
                });
            }
        }
        if (result && result.branch && typeof result.branch.foundCount === 'number') {
            var missing = (result.branch.totalCount || 0) - result.branch.foundCount;
            if (missing > 0) {
                pool.push({
                    label: 'Branchen-Standards: ' + missing + ' von ' + result.branch.totalCount + ' fehlen',
                    detail: result.branch.pitchArg || 'Branchen-typische Inhalte (Leistungen, Adresse, Öffnungszeiten) sind unvollständig.'
                });
            }
        }
        if (result && result.techAge && typeof result.techAge.severity === 'number' && result.techAge.severity >= 2) {
            pool.push({
                label: result.techAge.headline || 'Technische Basis veraltet',
                detail: result.techAge.composite || ''
            });
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

    function deriveCompositeScore(result) {
        // Sprint 168.3 — quickAudit liefert keinen einzelnen Score-Wert;
        // wir bilden einen Mittelwert aus den verfügbaren Sub-Metriken.
        if (!result) return null;
        var components = [];
        if (result.bfsg && typeof result.bfsg.complianceScore === 'number') {
            components.push(result.bfsg.complianceScore);
        }
        if (result.painPoints && typeof result.painPoints === 'object') {
            var keys = Object.keys(result.painPoints);
            if (keys.length) {
                var okCount = 0;
                keys.forEach(function (k) {
                    if (result.painPoints[k] && result.painPoints[k].ok === true) okCount++;
                });
                components.push(Math.round(okCount / keys.length * 100));
            }
        }
        if (result.seoGeo) {
            if (result.seoGeo.seo && result.seoGeo.seo.total) {
                components.push(Math.round(result.seoGeo.seo.found / result.seoGeo.seo.total * 100));
            }
            if (result.seoGeo.geo && result.seoGeo.geo.total) {
                components.push(Math.round(result.seoGeo.geo.found / result.seoGeo.geo.total * 100));
            }
        }
        if (result.branch && typeof result.branch.foundCount === 'number' && result.branch.totalCount) {
            components.push(Math.round(result.branch.foundCount / result.branch.totalCount * 100));
        }
        if (!components.length) return null;
        var sum = 0;
        components.forEach(function (c) { sum += c; });
        return Math.round(sum / components.length);
    }

    function renderResultHtml(result, url) {
        var domain = (result && result.domain) || deriveDomain(url) || (url || '');
        var rawScore = deriveCompositeScore(result);
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
                '<a class="kr-audit-result-cta-secondary" ' +
                    'href="https://lighthouse.karriaro.de" target="_blank" rel="noopener" ' +
                    'data-audit-lighthouse-cta>' +
                    'Auch Live-Verkehr messen? → Lighthouse' +
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
        var retryBtn = stage.querySelector('[data-audit-magic-retry]');
        if (retryBtn) retryBtn.parentNode.removeChild(retryBtn);
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

    function showInlineError(stage, message, onRetry) {
        var status = stage.querySelector('[data-audit-magic-status]');
        if (status) {
            status.textContent = message;
            status.classList.add('kr-audit-magic-status--error');
        }
        var seal = stage.querySelector('.kr-audit-magic-seal');
        if (seal) seal.classList.remove('kr-audit-magic-seal--spin');
        // Sprint 168.2 — persistenter "Wieder versuchen"-Button (kein Auto-Reset)
        var existingRetry = stage.querySelector('[data-audit-magic-retry]');
        if (existingRetry) existingRetry.parentNode.removeChild(existingRetry);
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.setAttribute('data-audit-magic-retry', '');
        retryBtn.className = 'kr-audit-magic-retry';
        retryBtn.textContent = 'Wieder versuchen';
        retryBtn.style.cssText = 'margin-top:12px;padding:10px 18px;font-family:Inter,system-ui,sans-serif;font-size:13px;color:#14202B;background:transparent;border:1px solid #14202B;border-radius:2px;cursor:pointer;';
        retryBtn.addEventListener('click', function () {
            if (typeof onRetry === 'function') onRetry();
        });
        stage.appendChild(retryBtn);
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
        LOG('init, found forms:', forms.length);
        if (!forms.length) return;

        forms.forEach(function (form) {
            var section = form.closest('.kr-audit-magic') || form.parentNode;
            var stage = section.querySelector('[data-audit-magic-stage]');
            var input = form.querySelector('[data-audit-magic-input]');
            var hp    = form.querySelector('input[name="hp"]');
            if (!stage || !input) {
                ERR('init bail: stage or input missing', { stage: !!stage, input: !!input });
                return;
            }
            var resultHost = ensureResultHost(section, stage);
            // Sprint 168.2 — Bind-Guard verhindert doppelte Submit-Handler
            // (falls Script versehentlich mehrfach geladen wird).
            if (form.dataset.auditMagicBound === '1') {
                LOG('form already bound, skipping');
                return;
            }
            form.dataset.auditMagicBound = '1';

            function runAudit() {
                var url = normalizeUrl(input.value);
                if (!url) {
                    input.setCustomValidity('Bitte eine gültige Adresse angeben.');
                    input.reportValidity();
                    return;
                }
                input.setCustomValidity('');
                var domain = deriveDomain(url);
                LOG('submit', { url: url, domain: domain });
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
                    LOG('fetch response', { status: res.status, ok: res.ok });
                    if (res.status === 429) { var e1 = new Error('rate_limited'); e1.code = 429; throw e1; }
                    if (!res.ok)            { var e2 = new Error('http_' + res.status); e2.code = res.status; throw e2; }
                    return res.json();
                });

                var timeoutPromise = new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error('timeout')); }, MAX_SCAN_MS);
                });

                Promise.race([fetchPromise, timeoutPromise]).then(function (result) {
                    if (done) return;
                    LOG('result received', result);
                    // Sprint 168.2 — Backend kann {ok:false, error:...} returnen
                    if (result && result.ok === false) {
                        var msg = (result.error && typeof result.error === 'string')
                            ? result.error
                            : 'Diese Seite lässt sich gerade nicht prüfen.';
                        throw new Error('backend:' + msg);
                    }
                    // Sprint 168.4 — Backend setzt degraded:true wenn die Seite
                    // nicht abrufbar war (Typo, DNS, Timeout). result.ok bleibt true,
                    // aber alle Sub-Metriken sind leer. Editorialer Fehler statt
                    // irreführendem "Substanziell solide"-Fallback.
                    if (result && result.degraded === true) {
                        var degradedMsg = (result.error && typeof result.error === 'string')
                            ? result.error + ' Bitte Schreibweise prüfen oder Domain neu eingeben.'
                            : 'Diese Adresse konnten wir nicht abrufen. Bitte Schreibweise prüfen.';
                        throw new Error('backend:' + degradedMsg);
                    }
                    done = true;
                    var elapsed = Date.now() - scanStart;
                    var wait = Math.max(0, MIN_SCAN_MS - elapsed);
                    setTimeout(function () {
                        clearInterval(phaseTimer);
                        var verdict = scoreVerdict(deriveCompositeScore(result));
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
                    ERR('error', err);
                    var message;
                    var reason;
                    if (err && err.code === 429) {
                        message = 'Bereits geprüft — bitte in einer Stunde erneut.';
                        reason = 'rate_limited';
                    } else if (err && err.message === 'timeout') {
                        message = 'Die Prüfung dauert ungewöhnlich lange. Bitte erneut versuchen.';
                        reason = 'timeout';
                    } else if (err && err.message && err.message.indexOf('backend:') === 0) {
                        message = err.message.slice(8);
                        reason = 'backend_error';
                    } else {
                        message = 'Etwas ist schiefgegangen. Bitte erneut versuchen.';
                        reason = (err && err.message) || 'unknown';
                    }
                    track('Magic Audit Failed', { reason: reason, domain: domain });
                    // Sprint 168.2 — persistente Fehler-Anzeige + Retry-Button
                    showInlineError(stage, message, function () {
                        resetSection(section, form, stage, resultHost);
                        // Re-trigger the audit with the same URL after a brief tick
                        setTimeout(runAudit, 100);
                    });
                });
            }

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (hp && hp.value) return;
                runAudit();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
