import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const personalHTML = await readFile(new URL('../site/persoenliche-websites.html', import.meta.url), 'utf8');

function setup(fetch) {
  const window = new Window({url: 'http://localhost:4319/', settings: {
    disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
    enableJavaScriptEvaluation: true, disableComputedStyleRendering: true
  }});
  window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.fetch = fetch || (async () => ({ok:true}));
  window.eval(script);
  const doc = window.document;
  const form = doc.querySelector('#contact-form');
  doc.querySelector('#name').value = 'Lokaler Test';
  doc.querySelector('#email').value = 'local-test@example.invalid';
  doc.querySelector('#message').value = 'Diese Anfrage bleibt im lokalen Test.';
  return { window, doc, form, submit: () => form.dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true})) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Successful inquiry uses existing endpoint, confirms receipt and blocks duplicates', async () => {
  const requests=[];
  const t=setup(async (url, options)=>{requests.push({url,options});return {ok:true};});
  let conversions=0;
  t.doc.addEventListener('karriaro:inquiry-sent',()=>conversions++);
  t.submit();t.submit();await tick();
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://formspree.io/f/mjggbdre');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.body.get('email'),'local-test@example.invalid');
  assert.equal(t.doc.querySelector('#form-status').dataset.state,'success');
  assert.equal(conversions,1);
  assert.equal(t.doc.querySelector('#name').value,'');
  t.submit();await tick();assert.equal(requests.length,1);
  await t.window.happyDOM.close();
});
test('HTTP rejection preserves inputs and allows a successful retry', async () => {
  let count=0;
  const t=setup(async()=>({ok:++count>1}));
  let conversions=0;t.doc.addEventListener('karriaro:inquiry-sent',()=>conversions++);
  t.submit();await tick();
  assert.equal(t.doc.querySelector('#form-status').dataset.state,'error');
  assert.equal(t.doc.querySelector('#name').value,'Lokaler Test');
  assert.equal(t.doc.querySelector('[type="submit"]').disabled,false);
  assert.equal(conversions,0);
  t.submit();await tick();assert.equal(conversions,1);
  await t.window.happyDOM.close();
});
test('Network failure keeps the message and shows an alternative contact', async () => {
  const t=setup(async()=>{throw new TypeError('offline')});
  t.submit();await tick();
  assert.equal(t.doc.querySelector('#message').value,'Diese Anfrage bleibt im lokalen Test.');
  assert.match(t.doc.querySelector('#form-status').textContent,/kontakt@karriaro.de/);
  assert.equal(t.form.hasAttribute('aria-busy'),false);
  await t.window.happyDOM.close();
});
test('Slow requests are aborted and never shown as confirmed', async () => {
  let capturedTimeout;
  const t=setup((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
  const original=t.window.setTimeout.bind(t.window);
  t.window.setTimeout=(callback,delay)=>{if(delay===20000){capturedTimeout=callback;return 55;}return original(callback,delay)};
  t.submit();capturedTimeout();await tick();
  assert.equal(t.doc.querySelector('#form-status').dataset.state,'error');
  assert.match(t.doc.querySelector('#form-status').textContent,/dauert zu lange/);
  assert.equal(t.doc.querySelector('[type="submit"]').disabled,false);
  await t.window.happyDOM.close();
});
test('Invalid addresses and honeypot entries are not sent', async () => {
  let count=0;const t=setup(async()=>{count++;return {ok:true}});
  t.doc.querySelector('#email').value='invalid';t.submit();await tick();assert.equal(count,0);
  t.doc.querySelector('#email').value='valid@example.invalid';t.doc.querySelector('[name="_gotcha"]').value='robot';
  t.submit();await tick();assert.equal(count,0);
  await t.window.happyDOM.close();
});
test('Service links select the matching request type', async () => {
  const t=setup();
  t.doc.querySelector('[data-interest="Meine Website überarbeiten"]').click();
  assert.equal(t.form.querySelector('[name="vorhaben"]:checked').value,'Meine Website überarbeiten');
  await t.window.happyDOM.close();
});
test('Mobile menu closes with Escape and returns keyboard focus', async () => {
  const t=setup();const button=t.doc.querySelector('.menu-toggle');button.click();
  assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(t.doc.querySelector('#mobile-nav').hidden,false);
  t.doc.dispatchEvent(new t.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(t.doc.activeElement,button);
  await t.window.happyDOM.close();
});
test('Personal website landing page sends its inquiry with the chosen service and confirms it inline', async () => {
  const requests = [];
  const window = new Window({url: 'http://localhost:4319/persoenliche-websites.html', settings: {
    disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
    enableJavaScriptEvaluation: true, disableComputedStyleRendering: true
  }});
  window.document.write(personalHTML.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  window.fetch = async (url, options) => { requests.push({url, options}); return {ok: true}; };
  window.eval(script);
  const doc = window.document;
  doc.querySelector('#pl-name').value = 'Lokaler Test';
  doc.querySelector('#pl-email').value = 'local-test@example.invalid';
  doc.querySelector('#pl-goal').value = 'Eine persönliche Website für meine Arbeit.';
  doc.querySelector('#contact-form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://formspree.io/f/mjggbdre');
  assert.equal(requests[0].options.body.get('vorhaben'), 'Persönliche Website');
  assert.equal(doc.querySelector('#form-status').dataset.state, 'success');
  await window.happyDOM.close();
});
