import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');

test('all eight personal sites are reachable and career filters keep the right examples', async () => {
  const window = new Window({
    url: 'http://localhost/persoenliche-websites.html',
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true }
  });
  const markup = await readFile(new URL('../site/persoenliche-websites.html', import.meta.url), 'utf8');
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.eval(await readFile(new URL('../site/assets/personal-gallery.js', import.meta.url), 'utf8'));
  const document = window.document;
  const people = [...document.querySelectorAll('.pl-persona')];
  assert.equal(people.length, 8);
  assert.match(document.querySelector('#ablauf').textContent, /Fragebogen[\s\S]*erster bedienbarer Entwurf/i);
  for (const person of people) {
    const href = person.querySelector('a[href^="/personen/"]')?.getAttribute('href');
    assert.ok(href, 'each example must open its website');
    const page = await readFile(new URL('../site' + href, import.meta.url), 'utf8');
    assert.match(page, /FIKTIVES, BEDIENBARES WEBSITE-KONZEPT|FIKTIVES KONZEPT/);
    assert.match(page, /name="robots" content="noindex,follow"/);
    assert.ok((page.match(/<section\b/g) || []).length >= 4, `${href} must be a complete page`);
  }
  for (const [level, expected] of [['studium', 1], ['einstieg', 1], ['erfahren', 4], ['selbststaendig', 2], ['all', 8]]) {
    document.querySelector(`[data-level-filter="${level}"]`).click();
    assert.equal(people.filter(item => !item.hidden).length, expected, level);
  }
  await window.happyDOM.close();
});
