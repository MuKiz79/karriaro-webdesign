import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../site/assets/object-motion.mjs', import.meta.url), 'utf8'))
  .replace(/import\('\.\.\/studien\/three-studies\.mjs(?:\?v=[\w.-]+)?'\)/, 'window.__loadModels()');
async function setup({ reduced = false, fails = false } = {}) {
  const w = new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
  w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
  const observers = [], frames = new Map(), updates = [];
  let next = 0, now = 100, loads = 0;
  w.matchMedia = () => ({matches:reduced,addEventListener(){}});
  w.IntersectionObserver = class { constructor(cb){this.cb=cb;observers.push(this)} observe(){} disconnect(){} };
  w.requestAnimationFrame = cb => {frames.set(++next,cb);return next};
  w.cancelAnimationFrame = id => frames.delete(id);
  w.__loadModels = async () => {
    loads++;
    if(fails) throw new Error('WebGL unavailable');
    const mount = (canvas,fallback) => {canvas.dataset.ready='true';fallback.hidden=true;return {update(...values){updates.push(values)}}};
    return {mountHouse:mount,mountJewel:mount};
  };
  w.eval(source);
  const visibility = async value => observers[0].cb([{isIntersecting:value,intersectionRatio:value?1:0}]);
  const advance = ms => {for(let i=0;i<ms;i+=40){now+=40;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(now))}};
  return {w,frames,updates,visibility,advance,loads:()=>loads,button:w.document.querySelector('.object-toggle'),card:w.document.querySelector('[data-object]')};
}
test('Visible models autoplay continuously and resume after returning to view',async()=>{
  const s=await setup(); assert.equal(s.loads(),0);
  await s.visibility(true); assert.equal(s.loads(),1);assert.equal(s.button.getAttribute('aria-pressed'),'true');
  s.advance(12000);assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.equal(s.frames.size,1);
  const before=s.updates.at(-1)[0];s.advance(1000);assert.notEqual(s.updates.at(-1)[0],before);
  await s.visibility(false);assert.equal(s.frames.size,0);
  await s.visibility(true);assert.equal(s.frames.size,1);assert.equal(s.loads(),1);
  await s.w.happyDOM.close();
});
test('An explicit pause survives scrolling away and back until playback is requested',async()=>{
  const s=await setup();await s.visibility(true);
  s.button.click();assert.equal(s.button.getAttribute('aria-pressed'),'false');
  const count=s.updates.length;s.advance(1000);assert.equal(s.updates.length,count);
  await s.visibility(false);await s.visibility(true);assert.equal(s.frames.size,0);
  s.button.click();assert.equal(s.button.getAttribute('aria-pressed'),'true');s.advance(1200);
  assert.ok(s.updates.length>count);assert.equal(s.w.document.querySelector('dialog').open,false);
  await s.w.happyDOM.close();
});
test('Reduced motion renders a static model until explicitly started',async()=>{
  const s=await setup({reduced:true});await s.visibility(true);
  assert.equal(s.card.dataset.objectReady,'true');assert.equal(s.frames.size,0);
  s.button.click();assert.equal(s.button.getAttribute('aria-pressed'),'true');
  await s.visibility(false);assert.equal(s.frames.size,0);assert.equal(s.button.getAttribute('aria-pressed'),'false');
  await s.w.happyDOM.close();
});
test('Opening a project pauses models and closing it resumes autoplay',async()=>{
  const s=await setup();await s.visibility(true);const dialog=s.w.document.querySelector('dialog');
  dialog.setAttribute('open','');await s.w.happyDOM.waitUntilComplete();
  assert.equal(s.frames.size,0);assert.equal(s.button.getAttribute('aria-pressed'),'false');
  dialog.removeAttribute('open');await s.w.happyDOM.waitUntilComplete();
  assert.equal(s.frames.size,1);assert.equal(s.button.getAttribute('aria-pressed'),'true');
  s.button.click();dialog.setAttribute('open','');await s.w.happyDOM.waitUntilComplete();
  dialog.removeAttribute('open');await s.w.happyDOM.waitUntilComplete();assert.equal(s.frames.size,0);
  await s.w.happyDOM.close();
});
test('Hidden tabs stop rendering and visible tabs resume without a click',async()=>{
  const s=await setup();await s.visibility(true);
  Object.defineProperty(s.w.document,'hidden',{value:true,configurable:true});
  s.w.document.dispatchEvent(new s.w.Event('visibilitychange'));assert.equal(s.frames.size,0);
  Object.defineProperty(s.w.document,'hidden',{value:false,configurable:true});
  s.w.document.dispatchEvent(new s.w.Event('visibilitychange'));assert.equal(s.frames.size,1);
  await s.w.happyDOM.close();
});
test('A failed 3D load retains the photo and removes unavailable controls',async()=>{
  const s=await setup({fails:true});await s.visibility(true);
  assert.equal(s.card.dataset.objectReady,'fallback');assert.equal(s.card.querySelector('.object-fallback').hidden,false);
  assert.equal(s.card.querySelector('canvas').hidden,true);assert.equal(s.button.hidden,true);
  await s.w.happyDOM.close();
});
