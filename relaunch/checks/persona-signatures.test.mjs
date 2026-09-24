import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const script = await readFile(new URL('../site/assets/persona-signatures.js', import.meta.url), 'utf8');
const completeScript = await readFile(new URL('../site/assets/persona-complete.js', import.meta.url), 'utf8');

async function page(slug) {
  const window = new Window({
    url: `http://localhost/personen/${slug}.html`,
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
  });
  const markup = await readFile(new URL(`../site/personen/${slug}.html`, import.meta.url), 'utf8');
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.eval(script);
  return { window, document: window.document };
}

test('the field atlas changes observation without leaving the page', async () => {
  const { window, document } = await page('aylin-berger');
  document.querySelector('[data-atlas-point="water"]').click();
  assert.equal(document.getElementById('ab-map-title').textContent, 'Wohin der Regen fließt.');
  assert.equal(document.querySelector('[data-atlas-point="water"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[data-atlas-point="heat"]').getAttribute('aria-pressed'), 'false');
  await window.happyDOM.close();
});

test('the working planner accepts a step, marks it complete and removes it', async () => {
  const { window, document } = await page('noah-yilmaz');
  document.getElementById('ny-task').value = 'Tastaturweg prüfen';
  document.getElementById('ny-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(document.getElementById('ny-tasks').textContent, /Tastaturweg prüfen/);
  document.querySelector('.ny-task-toggle').click();
  assert.equal(document.getElementById('ny-progress').getAttribute('aria-valuenow'), '100');
  document.querySelector('.ny-task-remove').click();
  assert.equal(document.getElementById('ny-progress').getAttribute('aria-valuenow'), '0');
  await window.happyDOM.close();
});

test('Noah’s second product demo lets a visitor choose and confirm a slot without booking', async () => {
  const { window, document } = await page('noah-yilmaz');
  window.eval(completeScript);
  assert.equal(document.getElementById('ny-booking-confirm').disabled, true);
  document.querySelector('[data-slot="Mi, 14:00 Uhr"]').click();
  assert.equal(document.getElementById('ny-slot-label').textContent, 'Mi, 14:00 Uhr');
  assert.equal(document.getElementById('ny-booking-confirm').disabled, false);
  document.getElementById('ny-booking-confirm').click();
  assert.match(document.getElementById('ny-booking-state').textContent, /nichts gebucht/);
  await window.happyDOM.close();
});

test('fictional profile contact closes the journey locally without a network endpoint', async () => {
  for (const slug of ['aylin-berger', 'noah-yilmaz', 'tarek-demir']) {
    const { window, document } = await page(slug);
    window.eval(completeScript);
    const form = document.querySelector('.pc-demo-form');
    assert.equal(form.getAttribute('action'), null);
    form.querySelector('[name="name"]').value = 'Test Person';
    form.querySelector('[name="email"]').value = 'test@example.org';
    form.querySelector('[name="message"]').value = 'Hallo';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert.match(form.querySelector('.pc-demo-status').textContent, /nichts versendet/);
    await window.happyDOM.close();
  }
});

test('the architecture sequence advances and resets to the starting state', async () => {
  const { window, document } = await page('tarek-demir');
  const next = document.getElementById('td-advance');
  next.click(); next.click(); next.click();
  assert.equal(document.getElementById('td-new-share').textContent, '60 % Verkehr');
  assert.equal(next.disabled, true);
  document.getElementById('td-reset').click();
  assert.equal(document.getElementById('td-new-share').textContent, '0 % Verkehr');
  await window.happyDOM.close();
});

test('the other profiles respond to their own design decisions', async () => {
  const actions = [
    ['lena-arendt', d => { const benefit = d.getElementById('la-value'); benefit.value = '1'; benefit.dispatchEvent(new d.defaultView.Event('input')); const effort = d.getElementById('la-effort'); effort.value = '5'; effort.dispatchEvent(new d.defaultView.Event('input')); return d.getElementById('la-result-label').textContent; }, 'ZURÜCKSTELLEN'],
    ['nora-feld', d => { d.querySelector('[data-visit="conversation"]').click(); return d.getElementById('nf-visit-title').textContent; }, 'Ihr Alltag zählt.'],
    ['benno-riedel', d => { d.querySelector('[data-wood="walnut"]').click(); return d.getElementById('br-wood-title').textContent; }, 'Nussbaum / matt'],
    ['mila-noor', d => { d.querySelector('[data-dialogue="roles"]').click(); return d.getElementById('mn-dialogue-number').textContent; }, '02'],
    ['mara-voss', d => { d.querySelector('[data-poster-tone="quiet"]').click(); return d.querySelector('[data-poster]').dataset.tone; }, 'quiet']
  ];
  for (const [slug, action, expected] of actions) {
    const { window, document } = await page(slug);
    assert.equal(action(document), expected, slug);
    await window.happyDOM.close();
  }
});
