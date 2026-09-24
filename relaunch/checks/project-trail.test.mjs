import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {Window} = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const key = 'karriaro-project-trail-v1';

async function page(filename, saved) {
  const w = new Window({url: 'http://localhost/' + filename, settings: {disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true}});
  const html = await readFile(new URL('../site/' + filename, import.meta.url), 'utf8');
  w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  if (saved) w.sessionStorage.setItem(key, saved);
  w.eval(await readFile(new URL('../site/assets/project-trail.js', import.meta.url), 'utf8'));
  return {w, q: selector => w.document.querySelector(selector)};
}

test('A visitor can collect, remove, and carry design qualities into the inquiry', async () => {
  const {w, q} = await page('index.html');
  q('[data-trail-project="kante"]').click();
  q('[data-trail-project="waldruehe"]').click();
  assert.match(q('#project-interest').value, /KANTE.*WALDRUHE/);
  assert.equal(q('#project-trail').hidden, false);
  assert.equal(q('#brief-heading').hidden, false);
  assert.equal(q('#project-trail-list').children.length, 2);
  q('#project-trail-list li button').click();
  assert.doesNotMatch(q('#project-interest').value, /KANTE/);
  assert.match(q('#project-interest').value, /WALDRUHE/);
  q('#design-direction').value = 'Expressiv';
  q('#capability-interest').value = 'Wöchentlicher Website-Bericht';
  w.document.dispatchEvent(new w.Event('karriaro:interest-change'));
  assert.equal(q('#project-trail-list').children.length, 3);
  assert.equal(q('#direction-note').hidden, false);
  assert.equal(q('#capability-interest-note').hidden, false);
  w.document.dispatchEvent(new w.CustomEvent('karriaro:interest-change', {detail: {legacyProject: 'FORM · Onlineshop'}}));
  assert.match(q('#project-interest').value, /WALDRUHE.*FORM/);
  assert.equal(q('#project-trail-list').children.length, 4);
  const saved = w.sessionStorage.getItem(key);
  assert.deepEqual(JSON.parse(saved).projects, ['waldruehe']);
  const other = await page('arbeiten.html', saved);
  assert.match(other.q('#project-trail-list').textContent, /WALDRUHE/);
  other.q('[data-trail-project="raum"]').click();
  assert.match(other.q('#project-trail-list').textContent, /RAUM/);
  await other.w.happyDOM.close();
  q('#contact-form').reset();
  await Promise.resolve();
  assert.equal(q('#project-interest').value, '');
  assert.equal(q('#project-trail').hidden, true);
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem(key)).projects, []);
  await w.happyDOM.close();
});
