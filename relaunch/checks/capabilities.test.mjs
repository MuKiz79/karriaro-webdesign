import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const html = await readFile(new URL('../site/index.html',import.meta.url),'utf8');
const script = await readFile(new URL('../site/assets/capabilities.js',import.meta.url),'utf8');
function setup(){
 const w=new Window({url:'http://localhost/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
 let requests=0;w.fetch=()=>{requests++;throw new Error('No external demo requests allowed')};
 w.eval(script);return {w,d:w.document,requests:()=>requests};
}
test('Three distinct example routes lead to complete concept websites',async()=>{
 const {w,d,requests}=setup();
 const paths=[...d.querySelectorAll('.outcome-card')].map(link=>new URL(link.href).pathname);
 assert.deepEqual(paths,['/studien/tischundton.html','/studien/raum.html','/studien/vecto.html']);
 assert.match(d.querySelector('.outcome-disclosure').textContent,/fiktive Betriebe/);
 assert.equal(requests(),0);
 await w.happyDOM.close();
});
test('Feature inquiries preserve existing form input and add only the chosen interest',async()=>{
 const {w,d}=setup();d.querySelector('#message').value='Meine bisherige Idee';
 for(const link of d.querySelectorAll('[data-capability]')){
  link.addEventListener('click',e=>e.preventDefault());link.click();
  assert.equal(new w.FormData(d.querySelector('form#contact-form')).get('gewuenschte_funktion'),link.dataset.capability);
  assert.equal(d.querySelector('#capability-interest-label').textContent,link.dataset.capability);
  assert.equal(d.querySelector('#capability-interest-note').hidden,false);
  assert.equal(d.querySelector('#message').value,'Meine bisherige Idee');
 }
 d.querySelector('#remove-capability').click();assert.equal(d.querySelector('#capability-interest').value,'');
 assert.equal(d.querySelector('#capability-interest-note').hidden,true);
 await w.happyDOM.close();
});
test('Form reset removes the optional feature and its visible note',async()=>{
 const {w,d}=setup();const link=d.querySelector('[data-capability]');link.addEventListener('click',e=>e.preventDefault());link.click();
 d.querySelector('#contact-form').reset();await Promise.resolve();
 assert.equal(d.querySelector('#capability-interest').value,'');assert.equal(d.querySelector('#capability-interest-note').hidden,true);
 await w.happyDOM.close();
});
