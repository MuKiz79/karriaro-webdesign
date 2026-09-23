import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const script = await readFile(new URL('../site/studien/market-concepts.js', import.meta.url), 'utf8');

async function setup(slug) {
  const window = new Window({
    url: 'http://localhost/studien/' + slug + '.html',
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true
    }
  });
  const html = await readFile(new URL('../site/studien/' + slug + '.html', import.meta.url), 'utf8');
  window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  let requests = 0;
  window.fetch = () => { requests++; throw Error('Unexpected network request'); };
  window.matchMedia = () => ({ matches: true });
  for (const dialog of window.document.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
  }
  window.eval(script);
  return {
    window,
    doc: window.document,
    q: selector => window.document.querySelector(selector),
    requests: () => requests
  };
}

test('KANTE service choice, material and goal produce a coherent local project brief', async () => {
  const { window, q, requests } = await setup('kante');
  q('[data-kante-pick="fassade"]').addEventListener('click', event => event.preventDefault());
  q('[data-kante-pick="fassade"]').click();
  q('[data-kante-material="holz"]').click();
  q('[data-kante-goal="ruhe"]').click();
  assert.equal(q('[data-kante-choice="fassade"]').getAttribute('aria-pressed'), 'true');
  assert.equal(q('[data-kante-material="holz"]').getAttribute('aria-pressed'), 'true');
  assert.match(q('#kante-result').textContent, /Fassade.*Holz.*Mehr Ruhe/s);
  assert.equal(q('#kante-cutaway').dataset.choice, 'fassade');
  assert.equal(q('#kante-cutaway').dataset.material, 'holz');
  assert.equal(q('#kante-cutaway').dataset.goal, 'ruhe');
  assert.equal(requests(), 0);
  await window.happyDOM.close();
});

test('WALDRUHE forms a dated trip idea and rejects reversed dates without a booking request', async () => {
  const { window, q, requests } = await setup('waldruehe');
  q('#stay-arrival').value = '2026-10-10';
  q('#stay-arrival').dispatchEvent(new window.Event('change'));
  q('#stay-departure').value = '2026-10-13';
  q('#stay-departure').dispatchEvent(new window.Event('change'));
  q('#stay-guests').value = '3';
  q('#stay-guests').dispatchEvent(new window.Event('change'));
  q('[data-wald-choice="wege"]').click();
  assert.match(q('#wald-result').textContent, /3 Nächte · 3 Personen/);
  assert.match(q('#wald-result').textContent, /Weg vor der Tür/);
  q('#stay-arrival').value = '2026-10-15';
  q('#stay-arrival').dispatchEvent(new window.Event('change'));
  assert.equal(q('#stay-departure').value, '');
  assert.equal(requests(), 0);
  await window.happyDOM.close();
});

test('WALDRUHE day rhythm changes the scene and carries its mood into the trip idea', async () => {
  const { window, q, requests } = await setup('waldruehe');
  q('button[data-wald-time="abend"]').click();
  assert.equal(q('#wald-time-interaction').dataset.waldTime, 'abend');
  assert.equal(q('#wald-time-display').textContent, '20:15');
  assert.equal(q('button[data-wald-time="abend"]').getAttribute('aria-pressed'), 'true');
  q('#wald-time-plan').addEventListener('click', event => event.preventDefault());
  q('#wald-time-plan').click();
  assert.equal(q('[data-wald-choice="zeit"]').getAttribute('aria-pressed'), 'true');
  assert.match(q('#wald-result').textContent, /Zeit für zwei/);
  assert.equal(requests(), 0);
  await window.happyDOM.close();
});

test('TISCH & TON filters products, adjusts quantities and ends checkout as a local demo', async () => {
  const { window, doc, q, requests } = await setup('tischundton');
  q('[data-filter="geschenk"]').click();
  assert.equal(q('[data-id="oil"]').hidden, true);
  assert.equal(q('[data-id="pear"]').hidden, false);
  q('#product-search').value = 'Schale';
  q('#product-search').dispatchEvent(new window.Event('input'));
  assert.equal(q('#product-count').textContent.startsWith('1 Produkt'), true);
  q('[data-detail="bowl"]').click();
  assert.equal(q('#detail-title').textContent, 'Die kleine Schale');
  q('#detail-add').click();
  assert.equal(q('#cart-count').textContent, '1');
  q('[data-cart-action="Mehr"]').click();
  assert.equal(q('#cart-total').textContent, '58,00 €');
  q('#open-checkout').click();
  q('input[value="shipping"]').checked = true;
  q('input[value="shipping"]').dispatchEvent(new window.Event('change'));
  assert.equal(q('#checkout-total').textContent, '58,00 €');
  q('#finish-demo').click();
  assert.equal(q('#checkout-confirmation').hidden, false);
  assert.equal(q('#checkout-flow').hidden, true);
  assert.equal(requests(), 0);
  await window.happyDOM.close();
});

test('TISCH & TON occasion changes the table composition and adds exactly its three products', async () => {
  const { window, q, requests } = await setup('tischundton');
  q('[data-table-choice="morgen"]').click();
  assert.equal(q('#tischprobe').dataset.tableScene, 'morgen');
  assert.equal(q('[data-table-choice="morgen"]').getAttribute('aria-pressed'), 'true');
  assert.match(q('#table-scene-title').textContent, /Morgen/);
  assert.match(q('#table-products').textContent, /Morgengold.*Birne.*Schale/s);
  assert.equal(q('#table-total').textContent, '55,00 €');
  q('#table-add').click();
  assert.equal(q('#cart-count').textContent, '3');
  assert.equal(q('#cart-total').textContent, '55,00 €');
  assert.equal(q('#demo-cart').open, true);
  assert.equal(requests(), 0);
  await window.happyDOM.close();
});
