/*
 * Karriaro Branchen-Tools — Sprint 44 Shared JS
 *
 * Liefert die 7 Live-Tool-Berechnungen, die auf der Hauptseite (src/index.html)
 * und auf jeder Sub-Page (src/portfolio/<branche>.html) als interaktiver Demo-Block
 * embedded werden.
 *
 * Pattern:
 *   1. HTML stellt <form data-kr-tool-form="<branche>"> + <output data-kr-tool-output="<branche>">
 *   2. Dieses Script attached automatisch den Submit-Handler für jede gefundene Form
 *   3. Berechnung ist 100% Browser-only, kein Server-Call, vereinfacht aber Branchen-realistisch
 *
 * Klassen-Konventionen:
 *   - .is-revealed auf <output> nach erster erfolgreicher Berechnung
 *   - .kr-tool-output-value bekommt den Hauptwert (innerHTML)
 *   - .kr-tool-output-note bekommt die Erklärung (innerHTML)
 */
(function () {
    'use strict';

    function formatEUR(n) {
        return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
    }

    function showOutput(branche, value, note) {
        var out = document.querySelector('[data-kr-tool-output="' + branche + '"]');
        if (!out) return;
        out.classList.add('is-revealed');
        var v = out.querySelector('.kr-tool-output-value');
        var n = out.querySelector('.kr-tool-output-note');
        if (v) v.innerHTML = value;
        if (n) n.innerHTML = note;
    }

    // === Dachdecker · BAFA-Förderrechner ===
    function attachDachdecker() {
        var f = document.querySelector('[data-kr-tool-form="dachdecker"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var flaeche = parseInt(fd.get('flaeche'), 10) || 0;
            var solar = fd.get('solar') === '1';
            var basis = flaeche * 80;
            var maxIsfp = basis * 1.15;
            var solarBonus = solar ? flaeche * 50 : 0;
            var min = Math.round((basis + solarBonus) / 100) * 100;
            var max = Math.round((maxIsfp + solarBonus) / 100) * 100;
            showOutput('dachdecker',
                formatEUR(min) + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">bis</span> ' + formatEUR(max),
                'Schätzung BAFA + KfW + iSFP-Bonus' + (solar ? ' + Solar-Förderung' : '') + '. Echte Demo gibt PDF-Report mit Auszahlungsbescheinigung-Vorlage aus.'
            );
        });
    }

    // === Immobilien · Wertermittlung ===
    function attachImmobilien() {
        var f = document.querySelector('[data-kr-tool-form="immobilien"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var plz = (fd.get('plz') || '').toString();
            var flaeche = parseInt(fd.get('flaeche'), 10) || 0;
            var baujahr = parseInt(fd.get('baujahr'), 10) || 1990;
            var firstTwo = plz.substring(0, 2);
            var basePerM2 = 3500;
            if (['10','11','12','13','80','81','82'].indexOf(firstTwo) >= 0) basePerM2 = 6800;
            else if (['70','71','72','73','60','61','40','41','20','22'].indexOf(firstTwo) >= 0) basePerM2 = 5400;
            else if (['01','02','04','06','99'].indexOf(firstTwo) >= 0) basePerM2 = 2400;
            var alterMod = baujahr > 2015 ? 1.10 : (baujahr < 1990 ? 0.92 : 1.0);
            var basis = flaeche * basePerM2 * alterMod;
            var min = Math.round(basis * 0.94 / 1000) * 1000;
            var max = Math.round(basis * 1.07 / 1000) * 1000;
            showOutput('immobilien',
                formatEUR(min) + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">bis</span> ' + formatEUR(max),
                'Live-Spanne aus PLZ-Markt + Baujahr-Modifier. Echte Demo erweitert um Objekttyp, Lage-Score und Vergleichs-Transaktionen der letzten 6 Monate.'
            );
        });
    }

    // === Praxis · KI-Symptom-Checker ===
    function attachPraxis() {
        var f = document.querySelector('[data-kr-tool-form="praxis"]');
        if (!f) return;
        f.addEventListener('change', function (e) {
            if (e.target.name !== 'sym') return;
            var checked = f.querySelectorAll('input[name="sym"]:checked');
            if (checked.length > 3) e.target.checked = false;
        });
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var syms = Array.from(f.querySelectorAll('input[name="sym"]:checked')).map(function (c) { return c.value; });
            if (syms.length === 0) {
                showOutput('praxis', '—', 'Bitte mindestens ein Symptom auswählen.');
                return;
            }
            var mapping = {
                'kopfschmerz_fieber': { typ: 'Akutsprechstunde', slot: 'heute 14:30' },
                'fieber_husten': { typ: 'Akutsprechstunde + ggf. Atemwegs-Check', slot: 'heute 15:00' },
                'rueckenschmerz_schwindel': { typ: 'Untersuchung HNO + Orthopädie', slot: 'morgen 09:45' },
                'rueckenschmerz': { typ: 'Orthopädische Akut-Sprechstunde', slot: 'morgen 11:00' },
                'muedigkeit_schwindel': { typ: 'Blutdruck + Labor-Check', slot: 'morgen 10:15' },
                'muedigkeit': { typ: 'Routine-Check-Up', slot: 'Mittwoch 16:00' },
                'kopfschmerz': { typ: 'Akut-Termin Hausarzt', slot: 'morgen 08:30' }
            };
            var key = syms.sort().join('_');
            var match = mapping[key] || mapping[syms[0]] || { typ: 'Routine-Termin', slot: 'Donnerstag 11:30' };
            showOutput('praxis',
                match.typ,
                'Vorschlag: <strong>' + match.slot + '</strong>. Echte Demo prüft DMP-Status und reserviert den Slot live in der MFA-Inbox.'
            );
        });
    }

    // === Friseur · Style-Empfehlung ===
    function attachFriseur() {
        var f = document.querySelector('[data-kr-tool-form="friseur"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var form = fd.get('form'), anlass = fd.get('anlass');
            if (!form || !anlass) { showOutput('friseur', '—', 'Bitte Gesichtsform und Anlass auswählen.'); return; }
            var stiles = {
                'oval_alltag': 'Long-Bob mit weichen Layers',
                'oval_business': 'Klassischer Bob auf Kinnhöhe',
                'oval_event': 'Hollywood-Waves Halboffen',
                'rund_alltag': 'Stufenschnitt mit Volumen oben',
                'rund_business': 'Side-Part Lob mit Tiefe',
                'rund_event': 'Hochgesteckte Welle, asymmetrisch',
                'herz_alltag': 'Pony schräg, mittellang',
                'herz_business': 'Curtain-Bangs mit Bob',
                'herz_event': 'Knot mit Akzent-Strähnen',
                'eckig_alltag': 'Soft-Layers, Mittellang',
                'eckig_business': 'Stumpfer Schnitt, Schulterhöhe',
                'eckig_event': 'Weiche Updo mit Locken'
            };
            var style = stiles[form + '_' + anlass] || 'Persönliche Beratung empfohlen';
            showOutput('friseur',
                style,
                'Nächster freier Slot: <strong>Donnerstag 14:30 bei Sara M.</strong> · 65 €. Echte Demo lädt Foto hoch und zeigt AR-Preview.'
            );
        });
    }

    // === Sanitär · Notdienst-Pulse ===
    function attachSanitaer() {
        var f = document.querySelector('[data-kr-tool-form="sanitaer"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var plz = (fd.get('plz') || '').toString();
            var art = fd.get('art');
            if (!plz || !art) { showOutput('sanitaer', '—', 'Bitte PLZ und Notfall-Art angeben.'); return; }
            var firstTwo = plz.substring(0, 2);
            var anrueck = ['70','71','72','73','74','75'].indexOf(firstTwo) >= 0 ? '25–35 Min' :
                          ['10','11','12','13','20','21','22'].indexOf(firstTwo) >= 0 ? '40–55 Min' : '50–75 Min';
            var dringend = art === 'rohrbruch' || art === 'leck' ? 'sofort' : 'in den nächsten 90 Minuten';
            showOutput('sanitaer',
                anrueck + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">· Notdienst ' + dringend + '</span>',
                'Region ' + plz.substring(0,3) + 'xx · ' + art + '. Echte Demo zeigt Live-Status der Flotte mit Disponenten-Map.'
            );
        });
    }

    // === Restaurant · AI-Sommelier ===
    function attachRestaurant() {
        var f = document.querySelector('[data-kr-tool-form="restaurant"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var gericht = fd.get('gericht'), preis = fd.get('preis');
            if (!gericht) { showOutput('restaurant', '—', 'Bitte Hauptgericht wählen.'); return; }
            var pairings = {
                'rind': ['Barolo "Cannubi" 2019 (kräftig, gerbsäurereich)', 'Toskanischer Sangiovese 2020 (würzig, mittlere Tannine)', 'Spätburgunder Pfalz "GG" 2021 (elegant)'],
                'lamm': ['Rioja Reserva 2018 (vanillig, weich)', 'Syrah Côtes-du-Rhône 2020 (würzig, pfeffrig)', 'Cabernet Franc Loire 2019'],
                'fisch': ['Riesling Mosel Kabinett 2022 (frisch, mineralisch)', 'Sancerre Sauvignon Blanc 2021', 'Albariño Rías Baixas 2022'],
                'pasta': ['Chianti Classico 2020 (klassisch, leicht)', 'Vermentino Ligurien 2022', 'Soave Classico 2021'],
                'gefluegel': ['Burgunder weiß 2021 (cremig)', 'Grüner Veltliner Reserve 2020', 'Champagner Blanc de Blancs (festlich)']
            };
            var wines = pairings[gericht] || [];
            var html = '<ol style="text-align:left; padding-left: 20px; margin: 0;">' +
                wines.map(function (w) { return '<li style="font-size: 15px; line-height: 1.5; margin-bottom: 4px;">' + w + '</li>'; }).join('') +
                '</ol>';
            showOutput('restaurant', html,
                'Auswahl optimiert für ' + (preis === '60+' ? 'Premium-Range >60 €' : preis === '30-60' ? 'Mittel-Range 30–60 €' : 'Einsteiger-Range <30 €') + '. Echte Demo greift auf die Karte des Restaurants zu.'
            );
        });
    }

    // === Spedition · Quote ===
    function attachSpedition() {
        var f = document.querySelector('[data-kr-tool-form="spedition"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var von = (fd.get('von') || '').toString();
            var bis = (fd.get('bis') || '').toString();
            var kg = parseInt(fd.get('gewicht'), 10) || 0;
            var distance = Math.abs(parseInt(von, 10) - parseInt(bis, 10));
            var km = Math.max(80, Math.round(distance / 5));
            var preis = km * 0.65 + kg * 0.18;
            var etaHours = Math.ceil(km / 60) + 6;
            var fahrzeug = kg < 100 ? 'Sprinter' : kg < 1000 ? 'Wechselbrücke' : kg < 5000 ? '7,5-Tonner' : 'Sattelzug';
            showOutput('spedition',
                formatEUR(preis) + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">· ETA ' + etaHours + ' h · ' + fahrzeug + '</span>',
                '~' + km + ' km · ' + kg + ' kg. Echte Demo prüft Live-Flotten-Auslastung und schließt im Backend-CRM direkt ab.'
            );
        });
    }

    // === Init ===
    function init() {
        attachDachdecker();
        attachImmobilien();
        attachPraxis();
        attachFriseur();
        attachSanitaer();
        attachRestaurant();
        attachSpedition();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
