/**
 * Jobsuche-v6-Mapping — lib/jobsuche-map.js
 *
 * Gegenprobe in beide Richtungen: das v6-Schema MUSS ins interne Format
 * abgebildet werden, und ein v4-Relikt (stellenangebote) darf NICHT still
 * als Treffer durchgehen — es war genau die Stille, die den Endpoint
 * monatelang tot erscheinen ließ, ohne dass es jemand sah.
 */
const test = require('node:test');
const assert = require('node:assert');
const { mapJobsucheV6 } = require('../lib/jobsuche-map.js');

test('v6-Schema wird vollständig gemappt (firma/Titel/Ort/Eintritt)', () => {
    const r = mapJobsucheV6({
        maxErgebnisse: 97,
        ergebnisliste: [
            {
                stellenangebotsTitel: 'Zahnmedizinische Fachangestellte (m/w/d)',
                firma: 'Dres. Henning Schlemme & Kollegen',
                stellenlokationen: [{ adresse: { ort: 'Stuttgart' } }],
                eintrittszeitraum: { von: '2026-09-01' }
            },
            { stellenangebotsTitel: 'ZFA', firma: 'ZTK Zahngesundheit GmbH', stellenlokationen: [] }
        ]
    });
    assert.equal(r.total, 97);
    assert.equal(r.jobs.length, 2);
    assert.deepEqual(r.jobs[0], {
        titel: 'Zahnmedizinische Fachangestellte (m/w/d)',
        arbeitgeber: 'Dres. Henning Schlemme & Kollegen',
        ort: 'Stuttgart',
        eintrittsdatum: '2026-09-01'
    });
    assert.deepEqual(r.employers, ['Dres. Henning Schlemme & Kollegen', 'ZTK Zahngesundheit GmbH']);
});

test('employers sind entdoppelt', () => {
    const r = mapJobsucheV6({ ergebnisliste: [{ firma: 'A GmbH' }, { firma: 'A GmbH' }, { firma: 'B' }] });
    assert.deepEqual(r.employers, ['A GmbH', 'B']);
});

test('v4-Relikt (stellenangebote) ergibt LEER, nicht stille Treffer', () => {
    const r = mapJobsucheV6({ stellenangebote: [{ titel: 'x', arbeitgeber: 'y' }], maxErgebnisse: 5 });
    assert.equal(r.jobs.length, 0);
    // total folgt maxErgebnisse, aber ohne jobs/employers kann deriveJobOpenings
    // keinen Betrieb matchen — der Ehrlichkeits-Pfad bleibt „ungeprüft".
    assert.deepEqual(r.employers, []);
});

test('robust gegen null/leer', () => {
    assert.deepEqual(mapJobsucheV6(null), { jobs: [], employers: [], total: 0 });
    assert.deepEqual(mapJobsucheV6({}), { jobs: [], employers: [], total: 0 });
});
