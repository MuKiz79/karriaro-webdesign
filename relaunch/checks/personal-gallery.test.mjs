import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');

async function landing(url = 'http://localhost/persoenliche-websites.html') {
  const window = new Window({
    url,
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
  });
  const markup = await readFile(new URL('../site/persoenliche-websites.html', import.meta.url), 'utf8');
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  return { window, document: window.document };
}

test('the two finished works lead four curated, complete conceptual websites', async () => {
  const { window, document } = await landing();
  const works = [...document.querySelectorAll('.pl-edition')];
  assert.equal(works.length, 4);
  assert.deepEqual(works.map(item => item.querySelector('h3')?.textContent), ['Aylin Berger.', 'Noah Yilmaz.', 'Felix Brandt.', 'Mina Aydin.']);
  assert.ok(document.querySelector('.pl-real-muammer a[href="https://muammerkizilaslan.com/"]'));
  assert.ok(document.querySelector('.pl-real-anonymous a[href="/personen/unternehmerprofil.html"]'));
  assert.ok(document.querySelector('details.pl-editions-archive'));
  for (const work of works) {
    const href = work.querySelector('.pl-edition-main-link')?.getAttribute('href');
    assert.equal(href, work.querySelector('.pl-edition-overlay')?.getAttribute('href'));
    assert.equal(href, work.querySelector('iframe')?.getAttribute('src'));
    assert.ok(work.querySelector('[data-example]'));
    const page = await readFile(new URL('../site' + href, import.meta.url), 'utf8');
    assert.match(page, /name="robots" content="noindex,follow"/);
    assert.ok((page.match(/<section\b/g) || []).length >= 5, href + ' needs a full visitor journey');
    assert.match(page, /FIKTIVES, BEDIENBARES WEBSITE-KONZEPT|FIKTIVES KONZEPT/);
  }
  assert.match(document.querySelector('#angebot').textContent, /2\.990 €/);
  assert.match(document.querySelector('#ablauf').textContent, /Fragebogen[\s\S]*bedienbaren Entwurf/i);
  const hero = document.querySelector('.pl-hero');
  assert.match(hero.textContent, /Sie können mehr,[\s\S]*als Ihr Profil zeigt/);
  assert.match(hero.textContent, /Bewerbung[\s\S]*beruflichen Wechsel[\s\S]*eigene Kunden/);
  const heroDirections = [...hero.querySelectorAll('.pl-mh-page')];
  assert.deepEqual(heroDirections.map(item => item.getAttribute('href')), ['/personen/muammer-fuehrung.html', '/personen/muammer-technologie.html', '/personen/muammer-gruendung.html']);
  assert.match(hero.textContent, /Drei vollständige Designstudien/);
  const why = document.querySelector('#warum');
  assert.match(why.textContent, /Deutungshoheit über Ihren Werdegang nicht dem Zufall/);
  assert.equal(why.querySelectorAll('.pl-clarity-benefits li').length, 3);
  assert.match(why.textContent, /20 Jahren in Technologie und Führung[\s\S]*beruflicher Positionierung[\s\S]*KI-Praxis/);
  assert.ok(why.compareDocumentPosition(document.querySelector('#arbeiten')) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  await window.happyDOM.close();
});

test('three full design directions use the same real profile and carry into the inquiry', async () => {
  const { window, document } = await landing('http://localhost/persoenliche-websites.html?beispiel=muammer-technologie#anfrage');
  const directions = [...document.querySelectorAll('.pl-variant')];
  assert.equal(directions.length, 3);
  for (const direction of directions) {
    const href = direction.querySelector('.pl-v-open')?.getAttribute('href');
    assert.equal(href, direction.querySelector('iframe')?.getAttribute('src'));
    assert.ok(direction.querySelector('[data-example]'));
    const page = await readFile(new URL('../site' + href, import.meta.url), 'utf8');
    assert.match(page, /name="robots" content="noindex,follow"/);
    assert.match(page, /DESIGNSTUDIE/);
    assert.match(page, /muammerkizilaslan.com/);
    assert.ok((page.match(/<section\b/g) || []).length >= 5);
    assert.match(page, /data-mv-group/);
    assert.doesNotMatch(page, /Ilyas|Kablan|fiktive Kundenergebnisse/i);
  }
  window.eval(await readFile(new URL('../site/assets/personal-inquiry.js', import.meta.url), 'utf8'));
  assert.equal(document.getElementById('pl-example-input').value, 'Designrichtung Technologie');
  document.querySelector('[data-example="muammer-gruendung"]').click();
  assert.equal(document.getElementById('pl-example-input').value, 'Designrichtung Beruf & Gründung');
  await window.happyDOM.close();
});

test('each profile variant has a working, keyboard-native perspective choice', async () => {
  const interaction = await readFile(new URL('../site/assets/muammer-variants.js', import.meta.url), 'utf8');
  for (const slug of ['muammer-fuehrung', 'muammer-technologie', 'muammer-gruendung']) {
    const page = await readFile(new URL(`../site/personen/${slug}.html`, import.meta.url), 'utf8');
    const window = new Window({
      url: `http://localhost/personen/${slug}.html`,
      settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
    });
    window.document.write(page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
    window.eval(interaction);
    const buttons = [...window.document.querySelectorAll('[data-mv-select]')];
    const panels = [...window.document.querySelectorAll('[data-mv-panel]')];
    assert.ok(buttons.length >= 2, slug);
    assert.equal(panels.filter(panel => !panel.hidden).length, 1);
    buttons[1].click();
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
    assert.equal(panels.find(panel => !panel.hidden)?.dataset.mvPanel, buttons[1].dataset.mvSelect);
    await window.happyDOM.close();
  }
});

test('the real design case is reachable and each topic reveals its own evidence', async () => {
  const home = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const offer = await readFile(new URL('../site/persoenliche-websites.html', import.meta.url), 'utf8');
  assert.match(home, /href="\/einblick-muammer\.html"/);
  assert.match(offer, /href="\/einblick-muammer\.html"/);
  const window = new Window({ url: 'http://localhost/einblick-muammer.html', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  const html = await readFile(new URL('../site/einblick-muammer.html', import.meta.url), 'utf8');
  window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.eval(await readFile(new URL('../site/assets/muammer-case.js', import.meta.url), 'utf8'));
  const buttons = [...window.document.querySelectorAll('[data-mk-topic]')];
  const panels = [...window.document.querySelectorAll('[data-mk-panel]')];
  assert.equal(buttons.length, 3);
  assert.equal(panels.length, 3);
  assert.equal(panels.filter(panel => !panel.hidden).length, 1);
  buttons[1].click();
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(panels.filter(panel => !panel.hidden)[0].dataset.mkPanel, 'fuehrung');
  assert.ok(window.document.querySelector('a[href="https://muammerkizilaslan.com/"]'));
  await window.happyDOM.close();
});

test('the anonymized work contains no personal trace or outbound link to the original', async () => {
  const page = await readFile(new URL('../site/personen/unternehmerprofil.html', import.meta.url), 'utf8');
  assert.match(page, /Anonymisierte Projektadaption/);
  assert.match(page, /noindex,follow/);
  assert.doesNotMatch(page, /Ilyas|Kablan|ilyaskablan|120 Objekte|28 Tage|Stuttgart|Waiblingen/i);
  assert.ok((page.match(/<section\b/g) || []).length >= 5);
});

test('a chosen example carries into the real inquiry without inventing a customer outcome', async () => {
  const { window, document } = await landing('http://localhost/persoenliche-websites.html?beispiel=felix-brandt#anfrage');
  const script = await readFile(new URL('../site/assets/personal-inquiry.js', import.meta.url), 'utf8');
  window.eval(script);
  assert.equal(document.getElementById('pl-example-input').value, 'Felix Brandt · Berufswechsel');
  assert.equal(document.getElementById('pl-selected-example').hidden, false);
  assert.deepEqual(
    [...document.querySelectorAll('.pl-editions-work .pl-edition:not([hidden])')].map(item => item.dataset.editionPanel),
    ['aylin']
  );
  document.querySelector('[data-edition="mina"]').click();
  assert.deepEqual(
    [...document.querySelectorAll('.pl-editions-work .pl-edition:not([hidden])')].map(item => item.dataset.editionPanel),
    ['mina']
  );
  assert.equal(document.querySelector('[data-edition="mina"]').getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-example="mina-aydin"]').click();
  assert.equal(document.getElementById('pl-example-input').value, 'Mina Aydin · Selbstständigkeit');
  assert.equal(document.querySelector('#contact-form').getAttribute('action'), 'https://formspree.io/f/mjggbdre');
  await window.happyDOM.close();
});

test('each demonstrated interaction changes content and the established cases return to the right inquiry', async () => {
  const script = await readFile(new URL('../site/assets/persona-editions.js', import.meta.url), 'utf8');
  for (const [pageName, button, heading, expected] of [
    ['felix-brandt', '[data-felix="systems"]', '#fb-strength-title', 'Das Ganze braucht einen Plan.'],
    ['mina-aydin', '[data-mina="ruhe"]', '#ma-stage-title', 'Die Pause ist Teil des Bildes.'],
    ['unternehmerprofil', '[data-up-mode="wissen"]', '#up-mode-title', 'Vom Fachbegriff zum eigenen Urteil.']
  ]) {
    const window = new Window({ url: 'http://localhost/personen/' + pageName + '.html', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
    window.document.write((await readFile(new URL('../site/personen/' + pageName + '.html', import.meta.url), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
    window.eval(script);
    window.document.querySelector(button).click();
    assert.equal(window.document.querySelector(heading).textContent, expected);
    assert.equal(window.document.querySelector(button).getAttribute('aria-pressed'), 'true');
    await window.happyDOM.close();
  }
  for (const key of ['aylin-berger', 'noah-yilmaz']) {
    const page = await readFile(new URL('../site/personen/' + key + '.html', import.meta.url), 'utf8');
    assert.match(page, new RegExp('/persoenliche-websites\\.html\\?beispiel=' + key + '#anfrage'));
    assert.match(page, /versendet keine Nachricht/);
  }
});
