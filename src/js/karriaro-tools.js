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

    // Sprint 63 — Frühvalidierung gegen NaN / negative Eingaben (User mit Hand-typed
    // Werten kann HTML min-Attribute umgehen).
    function getPositiveNumber(form, name, min, max) {
        var raw = parseFloat(form.querySelector('[name="' + name + '"]').value);
        if (!isFinite(raw) || raw < min) return null;
        if (max && raw > max) return null;
        return raw;
    }

    // === Dachdecker · BAFA-Förderrechner ===
    /* DEMO-NOTE: Förder-Math (80 €/m² Basis + 15 % iSFP + 50 €/m² Solar)
       sind Demo-Pauschalen. Reale Produktion: BAFA-XML-Tarif + iSFP-Aktor. */
    function attachDachdecker() {
        var f = document.querySelector('[data-kr-tool-form="dachdecker"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var flaeche = getPositiveNumber(f, 'flaeche', 20, 2000);
            if (flaeche === null) {
                showOutput('dachdecker', '—', 'Bitte gültige Fläche zwischen 20 und 2000 m² eingeben.');
                return;
            }
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
    /* DEMO-NOTE: Nur 4 PLZ-Regionen-Tiers (Berlin/München, SW/HH, Ost-DE, Default).
       Reale Produktion: BORIS-NRW + Boris-DE-PLZ-zu-Bodenrichtwert-Mapping. */
    function attachImmobilien() {
        var f = document.querySelector('[data-kr-tool-form="immobilien"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var plz = (fd.get('plz') || '').toString();
            var flaeche = getPositiveNumber(f, 'flaeche', 20, 800);
            if (flaeche === null) {
                showOutput('immobilien', '—', 'Bitte gültige Fläche zwischen 20 und 800 m² eingeben.');
                return;
            }
            var baujahr = getPositiveNumber(f, 'baujahr', 1850, 2026);
            if (baujahr === null) baujahr = 1990;
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
    /* DEMO-NOTE: Nur 7 hartcodierte Symptom-Kombinationen. Reale Produktion:
       SNOMED-CT-basiertes Triage-Mapping mit echtem MFA-Slot-API. */
    function attachPraxis() {
        var f = document.querySelector('[data-kr-tool-form="praxis"]');
        if (!f) return;
        // Sprint 63: Bei 3 ausgewählten werden weitere visuell disabled (statt nur silent ignored).
        function updateCheckboxStates() {
            var all = f.querySelectorAll('input[name="sym"]');
            var checked = f.querySelectorAll('input[name="sym"]:checked');
            all.forEach(function (cb) {
                if (!cb.checked && checked.length >= 3) cb.disabled = true;
                else cb.disabled = false;
            });
        }
        f.addEventListener('change', function (e) {
            if (e.target.name !== 'sym') return;
            var checked = f.querySelectorAll('input[name="sym"]:checked');
            if (checked.length > 3) e.target.checked = false;
            updateCheckboxStates();
        });
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var syms = Array.from(f.querySelectorAll('input[name="sym"]:checked')).map(function (c) { return c.value; });
            if (syms.length === 0) {
                showOutput('praxis', '—', 'Bitte mindestens ein Symptom auswählen.');
                return;
            }
            // Sprint 63 — Mapping-Keys müssen alphabetisch sortiert sein (matched gegen syms.sort().join).
            var mapping = {
                'fieber_kopfschmerz': { typ: 'Akutsprechstunde', slot: 'heute 14:30' },
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
    /* Sprint 84 — Slot + Preis rotieren jetzt pro Aufruf. Slot aus 8er-Pool
       via Date.now()-Modulo, Preis aus Style-Kategorie. Reale Produktion
       wuerde noch Treatwell/Shore-Slot-API anbinden. */
    var FRISEUR_SLOTS = [
        'Dienstag 9:30 bei Sara M.',
        'Dienstag 16:00 bei Yusuf',
        'Mittwoch 11:00 bei Mara',
        'Donnerstag 14:30 bei Sara M.',
        'Donnerstag 17:30 bei Yusuf',
        'Freitag 10:00 bei Mara',
        'Freitag 16:00 bei Yusuf',
        'Samstag 11:00 bei Sara M.'
    ];
    var FRISEUR_PREISE = {
        'Long-Bob mit weichen Layers': 65,
        'Klassischer Bob auf Kinnhöhe': 55,
        'Hollywood-Waves Halboffen': 85,
        'Stufenschnitt mit Volumen oben': 60,
        'Side-Part Lob mit Tiefe': 75,
        'Hochgesteckte Welle, asymmetrisch': 90,
        'Pony schräg, mittellang': 55,
        'Curtain-Bangs mit Bob': 70,
        'Knot mit Akzent-Strähnen': 85,
        'Soft-Layers, Mittellang': 60,
        'Stumpfer Schnitt, Schulterhöhe': 55,
        'Weiche Updo mit Locken': 95
    };
    // Sprint 84 — Style-Galerie-Vorschau: jeder Style mappt auf ein vorhandenes
    // Foto-Asset aus src/images/friseur/. Ersetzt das FAQ-versprochene "AR-Try-On".
    var FRISEUR_BILDER = {
        'Long-Bob mit weichen Layers': 'french-bob.jpg',
        'Klassischer Bob auf Kinnhöhe': 'french-bob.jpg',
        'Hollywood-Waves Halboffen': 'modern-shag.jpg',
        'Stufenschnitt mit Volumen oben': 'long-pixie.jpg',
        'Side-Part Lob mit Tiefe': 'caramel-highlights.jpg',
        'Hochgesteckte Welle, asymmetrisch': 'bridal-updo.jpg',
        'Pony schräg, mittellang': 'curtain-bangs.jpg',
        'Curtain-Bangs mit Bob': 'curtain-bangs.jpg',
        'Knot mit Akzent-Strähnen': 'bridal-updo.jpg',
        'Soft-Layers, Mittellang': 'honey-balayage.jpg',
        'Stumpfer Schnitt, Schulterhöhe': 'fade-cut.jpg',
        'Weiche Updo mit Locken': 'brautstyling.jpg'
    };
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
            var slot = FRISEUR_SLOTS[Math.floor(Date.now() / 1000) % FRISEUR_SLOTS.length];
            var preis = FRISEUR_PREISE[style] || 65;
            var bild = FRISEUR_BILDER[style];
            var bildHtml = bild
                ? '<img src="/images/friseur/' + bild + '" alt="Style-Vorschau ' + style + '" loading="lazy" width="180" height="180" style="float:left; width:90px; height:90px; object-fit:cover; border-radius:8px; margin:0 14px 8px 0;">'
                : '';
            showOutput('friseur',
                style,
                bildHtml + 'Nächster freier Slot: <strong>' + slot + '</strong> · ' + preis + ' €. Style-Vorschau aus unserer Galerie (echte Stylistinnen-Arbeit).<div style="clear:both;"></div>'
            );
        });
    }

    // === Sanitär · Notdienst-Pulse ===
    /* DEMO-NOTE: Nur 3 PLZ-Regionen-Tiers (SW, Berlin/HH, Default).
       Reale Produktion: echtes Service-Area-Polygon + Live-Flotten-Status. */
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
            if (!wines.length) {
                showOutput('restaurant', '—', 'Für die Auswahl gibt es keine Empfehlung. Bitte ein anderes Gericht wählen.');
                return;
            }
            var html = '<ol style="text-align:left; padding-left: 20px; margin: 0;">' +
                wines.map(function (w) { return '<li style="font-size: 15px; line-height: 1.5; margin-bottom: 4px;">' + w + '</li>'; }).join('') +
                '</ol>';
            showOutput('restaurant', html,
                'Auswahl optimiert für ' + (preis === '60+' ? 'Premium-Range >60 €' : preis === '30-60' ? 'Mittel-Range 30–60 €' : 'Einsteiger-Range <30 €') + '. Echte Demo greift auf die Karte des Restaurants zu.'
            );
        });
    }

    // === Spedition · Quote ===
    /* Sprint 84 — Distanz via PLZ-Region-Centroid-Mapping (10 deutsche
       Postleitregionen) + Haversine-Formel. Reale Spedition wuerde noch
       Google-Distance-Matrix oder PTV-xRoute hinzuziehen, aber die Werte
       sind jetzt im Bereich der realen Strassen-km (vorher: |20-80|/5 = 12 km
       fuer Hamburg-Muenchen statt ~775 km). */
    var PLZ_CENTROIDS = {
        '0': [51.05, 13.74],  // Sachsen/Brandenburg-Sued (Dresden)
        '1': [52.52, 13.40],  // Berlin/Brandenburg (Berlin)
        '2': [53.55, 9.99],   // Hamburg/Schleswig-Holstein (Hamburg)
        '3': [52.37, 9.73],   // Niedersachsen-Mitte (Hannover)
        '4': [51.51, 7.46],   // Nordrhein-Westfalen Nord (Dortmund)
        '5': [50.94, 6.96],   // NRW-Sued/Rheinland (Koeln)
        '6': [50.11, 8.68],   // Hessen/Rhein-Main (Frankfurt)
        '7': [48.78, 9.18],   // Baden-Wuerttemberg (Stuttgart)
        '8': [48.14, 11.58],  // Bayern-Sued (Muenchen)
        '9': [49.45, 11.08]   // Bayern-Nord/Franken (Nuernberg)
    };
    function plzDistanceKm(fromPlz, toPlz) {
        var a = PLZ_CENTROIDS[String(fromPlz)[0]] || PLZ_CENTROIDS['5'];
        var b = PLZ_CENTROIDS[String(toPlz)[0]]   || PLZ_CENTROIDS['5'];
        var R = 6371, toRad = function (x) { return x * Math.PI / 180; };
        var dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
              + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0]))
              * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        // Strassen-Aufschlag ~25% gegenueber Luftlinie (DACH-Median)
        return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 1.25);
    }
    function attachSpedition() {
        var f = document.querySelector('[data-kr-tool-form="spedition"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            var von = (fd.get('von') || '').toString();
            var bis = (fd.get('bis') || '').toString();
            var kg = getPositiveNumber(f, 'gewicht', 1, 24000);
            if (kg === null) {
                showOutput('spedition', '—', 'Bitte gültiges Gewicht zwischen 1 und 24000 kg eingeben.');
                return;
            }
            var km = Math.max(80, plzDistanceKm(von, bis));
            var preis = km * 0.65 + kg * 0.18;
            var etaHours = Math.ceil(km / 60) + 6;
            var fahrzeug = kg < 100 ? 'Sprinter' : kg < 1000 ? 'Wechselbrücke' : kg < 5000 ? '7,5-Tonner' : 'Sattelzug';
            showOutput('spedition',
                formatEUR(preis) + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">· ETA ' + etaHours + ' h · ' + fahrzeug + '</span>',
                '~' + km + ' km · ' + kg + ' kg. Demo-Schätzung über PLZ-Regionen-Centroide; echte Quote über Disponent.'
            );
        });
    }

    // === Coaching · Klarheits-Score (5 Fragen → Score + Empfehlung) ===
    function attachCoaching() {
        var f = document.querySelector('[data-kr-tool-form="coaching"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(f);
            // 5 Fragen, jede 1-5 — Score 5-25
            var keys = ['focus', 'team', 'time', 'energy', 'next-step'];
            var sum = 0;
            for (var i = 0; i < keys.length; i++) {
                var v = parseInt(fd.get(keys[i]), 10);
                if (!v) { showOutput('coaching', '—', 'Bitte alle 5 Fragen beantworten.'); return; }
                sum += v;
            }
            // 5 = sehr unklar, 25 = sehr klar
            var rec, level;
            if (sum <= 10) {
                level = 'Hoher Klärungsbedarf';
                rec = '6-Wochen-Intensiv-Coaching empfohlen. Erstgespräch mit Sarah Lehmann, wir definieren Top-3-Hebel und Roadmap.';
            } else if (sum <= 17) {
                level = 'Mittlerer Klärungsbedarf';
                rec = '90-Tage-Programm mit zweiwöchentlichen Sessions. Fokus auf Energie-Management und nächsten Karriere-Schritt.';
            } else if (sum <= 22) {
                level = 'Konkretisierungsbedarf';
                rec = 'Strategie-Sparring 4–6 Sessions. Sie wissen, wohin — wir helfen mit Geschwindigkeit und Stakeholder-Management.';
            } else {
                level = 'Reflexionsbedarf';
                rec = 'Sounding-Board-Format. 90-Minuten-Reflexionsgespräche bei Bedarf statt fester Roadmap.';
            }
            showOutput('coaching',
                level + ' <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">· Score ' + sum + '/25</span>',
                rec + ' Echte Demo aktiviert anschließend Calendly-Buchung für ein 30-Min-Erstgespräch.'
            );
        });
    }

    // === Immobilien · Hypothekenrechner (Annuitaeten-Formel) ===
    /* Sprint 84 — Standard-Annuitaeten-Berechnung. Inputs: Kaufpreis,
       Eigenkapital, Zins %, Tilgung %. Output: Monatsrate, Laufzeit,
       Restschuld nach 5/10/15 Jahren. */
    function annuitaet(kreditEUR, zinsProzent, tilgungProzent) {
        var r = zinsProzent / 100, t = tilgungProzent / 100;
        var monatsrate = kreditEUR * (r + t) / 12;
        var annuitaetJahr = kreditEUR * (r + t);
        function restschuld(n) {
            if (r === 0) return Math.max(0, Math.round(kreditEUR - annuitaetJahr * n));
            var faktor = Math.pow(1 + r, n);
            return Math.max(0, Math.round(kreditEUR * faktor - annuitaetJahr * (faktor - 1) / r));
        }
        var laufzeit;
        if (r === 0) {
            laufzeit = kreditEUR / annuitaetJahr;
        } else if (annuitaetJahr <= kreditEUR * r) {
            // Tilgung deckt nicht mal die Zinsen
            laufzeit = 999;
        } else {
            laufzeit = Math.log(annuitaetJahr / (annuitaetJahr - kreditEUR * r)) / Math.log(1 + r);
        }
        var laufzeitJahre = Math.round(laufzeit);
        return {
            monatsrate: Math.round(monatsrate),
            annuitaetJahr: Math.round(annuitaetJahr),
            laufzeitJahre: laufzeitJahre,
            zinslastGesamt: Math.max(0, Math.round(annuitaetJahr * laufzeitJahre - kreditEUR)),
            nach5: restschuld(5),
            nach10: restschuld(10),
            nach15: restschuld(15)
        };
    }
    function attachHypotheken() {
        var f = document.querySelector('[data-kr-tool-form="hypotheken"]');
        if (!f) return;
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var kaufpreis = getPositiveNumber(f, 'kaufpreis', 50000, 5000000);
            var eigenkapital = getPositiveNumber(f, 'eigenkapital', 0, 5000000);
            var zins = getPositiveNumber(f, 'zins', 0.1, 12);
            var tilgung = getPositiveNumber(f, 'tilgung', 0.5, 10);
            if (kaufpreis === null || eigenkapital === null || zins === null || tilgung === null) {
                showOutput('hypotheken', '—', 'Bitte alle Felder mit plausiblen Werten ausfüllen.');
                return;
            }
            if (eigenkapital >= kaufpreis) {
                showOutput('hypotheken', '—', 'Eigenkapital muss kleiner als Kaufpreis sein.');
                return;
            }
            var kredit = kaufpreis - eigenkapital;
            var r = annuitaet(kredit, zins, tilgung);
            if (r.laufzeitJahre >= 999) {
                showOutput('hypotheken', '—', 'Bei dieser Tilgungsrate würde der Kredit nie getilgt — bitte Tilgung erhöhen.');
                return;
            }
            var bigNum = '<strong style="font-size: 1.3em;">' + formatEUR(r.monatsrate) + '</strong> <span style="color:var(--color-graphite-soft,#525E6B); font-weight:300;">/ Monat · ' + r.laufzeitJahre + ' Jahre Laufzeit</span>';
            var details = 'Kredit: ' + formatEUR(kredit)
                + ' · Zinslast über Gesamtlaufzeit: ' + formatEUR(r.zinslastGesamt)
                + '. Restschuld nach 5 J.: ' + formatEUR(r.nach5)
                + ' · nach 10 J.: ' + formatEUR(r.nach10)
                + ' · nach 15 J.: ' + formatEUR(r.nach15)
                + '. Demo-Berechnung mit Standard-Annuitätenformel; echtes Angebot über Finanzierungsberater.';
            showOutput('hypotheken', bigNum, details);
        });
    }

    // === Init ===
    function init() {
        attachDachdecker();
        attachImmobilien();
        attachHypotheken();
        attachPraxis();
        attachFriseur();
        attachSanitaer();
        attachRestaurant();
        attachSpedition();
        attachCoaching();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
