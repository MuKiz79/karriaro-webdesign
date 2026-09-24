import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');

test('the three selected stories and five optional examples all open complete sites', async () => {
  const window = new Window({
    url: 'http://localhost/persoenliche-websites.html',
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
  });
  const markup = await readFile(new URL('../site/persoenliche-websites.html', import.meta.url), 'utf8');
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  const document = window.document;
  const featured = [...document.querySelectorAll('.pl-persona')];
  const archive = [...document.querySelectorAll('.pl-archive-item')];
  assert.equal(featured.length, 3);
  assert.equal(archive.length, 5);
  for (const person of featured) {
    assert.equal(person.querySelector('.pl-persona-screen-open')?.getAttribute('href'), person.querySelector('.pl-persona-copy a')?.getAttribute('href'));
  }
  assert.ok(document.querySelector('#angebot').textContent.includes('2.990 €'));
  assert.match(document.querySelector('#ablauf').textContent, /Fragebogen[\s\S]*bedienbarer Website-Entwurf/i);
  assert.ok(document.querySelector('.pl-maker img'));
  for (const link of [...featured.map(person => person.querySelector('a[href^="/personen/"]')), ...archive]) {
    const href = link?.getAttribute('href');
    assert.ok(href, 'each example must open its website');
    const page = await readFile(new URL('../site' + href, import.meta.url), 'utf8');
    assert.match(page, /FIKTIVES, BEDIENBARES WEBSITE-KONZEPT|FIKTIVES KONZEPT/);
    assert.match(page, /name="robots" content="noindex,follow"/);
    assert.ok((page.match(/<section\b/g) || []).length >= 4, `${href} must be a complete page`);
  }
  const archiveDetails = document.querySelector('.pl-archive');
  assert.equal(archiveDetails.open, false);
  archiveDetails.querySelector('summary').click();
  assert.equal(archiveDetails.open, true);
  await window.happyDOM.close();
});
