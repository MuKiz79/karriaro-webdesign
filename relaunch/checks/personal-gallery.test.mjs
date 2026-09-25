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

test('the new showroom presents one published work and retains offer and inquiry compatibility', async () => {
  const {window, document}=await landing();
  assert.ok(document.querySelector('#arbeiten a[href="https://muammerkizilaslan.com/"]'));
  assert.equal(document.querySelectorAll('iframe, .pl-edition, a[href^="/personen/"]').length,0);
  assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length,1);
  assert.ok(document.getElementById('varianten')); assert.ok(document.getElementById('beispiele'));
  assert.match(document.querySelector('h1').textContent,/Ihr Werdegang.*Ihr eigener Auftritt/);
  assert.match(document.querySelector('#angebot').textContent,/Individuell kalkuliert/);
  assert.doesNotMatch(document.body.textContent,/2[.,]990|7[.,]336|Ilyas|Kablan/);
  assert.match(document.querySelector('#ablauf').textContent,/Fragebogen/);
  assert.equal(document.querySelector('#contact-form').action,'https://formspree.io/f/mjggbdre');
  assert.equal(document.querySelectorAll('.pg-evidence article').length,3);
  await window.happyDOM.close();
});

test('legacy example links remain recognized without featuring their studies',async()=>{
  const {window,document}=await landing('http://localhost/persoenliche-websites.html?beispiel=muammer-technologie#anfrage');
  window.eval(await readFile(new URL('../site/assets/personal-inquiry.js',import.meta.url),'utf8'));
  assert.equal(document.getElementById('pl-example-input').value,'Designrichtung Technologie');
  assert.equal(document.getElementById('pg-selected-example').hidden,false);
  for(const slug of ['tarek-demir','aylin-berger','noah-yilmaz','felix-brandt','mina-aydin']) assert.ok(await readFile(new URL('../site/personen/'+slug+'.html',import.meta.url),'utf8'));
  await window.happyDOM.close();
});

test('each profile variant has a working, keyboard-native perspective choice', async () => {
  const interaction = await readFile(new URL('../site/assets/muammer-variants.js', import.meta.url), 'utf8');
  for (const slug of ['muammer-fuehrung', 'muammer-technologie']) {
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
  const founder = await readFile(new URL('../site/personen/muammer-gruendung.html', import.meta.url), 'utf8');
  assert.equal((founder.match(/<details>/g) || []).length, 3);
  assert.match(founder, /mv-braid-professional[\s\S]*mv-braid-own/);
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

test('a published work carries into the inquiry, can be removed, and resets after success',async()=>{
  const {window,document}=await landing('http://localhost/persoenliche-websites.html?beispiel=unknown#anfrage');
  window.eval(await readFile(new URL('../site/assets/personal-inquiry.js',import.meta.url),'utf8'));
  const input=document.getElementById('pl-example-input'),box=document.getElementById('pg-selected-example');
  assert.equal(input.value,'');assert.equal(box.hidden,true);
  document.getElementById('pl-goal').value='Mein bestehender Entwurf';
  document.querySelector('[data-example="muammer-original"]').click();
  assert.match(input.value,/Muammer Kizilaslan/);assert.equal(box.hidden,false);
  assert.equal(document.getElementById('pl-goal').value,'Mein bestehender Entwurf');
  document.getElementById('pg-remove-example').click();assert.equal(input.value,'');assert.equal(box.hidden,true);
  assert.equal(document.activeElement.id,'pl-name');
  document.querySelector('[data-example="muammer-original"]').click();document.getElementById('contact-form').reset();assert.equal(input.value,'');assert.equal(box.hidden,true);
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

test('the adapted personal forms express different biographies and the field network is usable', async () => {
  const felix = await readFile(new URL('../site/personen/felix-brandt.html', import.meta.url), 'utf8');
  assert.equal((felix.match(/data-felix-chapter="[1-4]"/g) || []).length, 4);
  assert.match(felix, /KONSTRUIEREN[\s\S]*BEOBACHTEN[\s\S]*ÜBERSETZEN[\s\S]*GESTALTEN/);
  assert.doesNotMatch(felix, /Ilyas|Kablan|ilyaskablan|Fußball/i);

  const window = new Window({ url: 'http://localhost/personen/aylin-berger.html', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  const aylin = await readFile(new URL('../site/personen/aylin-berger.html', import.meta.url), 'utf8');
  window.document.write(aylin.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.eval(await readFile(new URL('../site/assets/personal-form-principles.js', import.meta.url), 'utf8'));
  const network = window.document.querySelector('[data-aylin-network]');
  assert.equal(network.querySelectorAll('[data-node]').length, 6);
  network.querySelector('[data-node="water"]').click();
  assert.equal(network.dataset.focus, 'water');
  assert.equal(window.document.querySelector('#ab-network-title').textContent, 'Wenn Regen bleibt.');
  assert.equal(network.querySelector('[data-node="water"]').getAttribute('aria-pressed'), 'true');
  assert.equal(network.querySelector('[data-node="heat"]').getAttribute('aria-pressed'), 'false');
  await window.happyDOM.close();
});
