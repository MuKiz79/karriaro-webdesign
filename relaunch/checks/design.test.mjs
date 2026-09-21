import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../site/assets/design-stage.js',import.meta.url),'utf8');
function setup(){
 const window=new Window({url:'http://localhost:4319/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true}});
 window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
 window.eval(script);
 return {window,doc:window.document};
}
test('Initial composition does not submit an unchosen design preference',async()=>{
 const {window,doc}=setup();
 assert.equal(doc.querySelector('#design-stage').dataset.design,'editorial');
 assert.equal(doc.querySelector('#design-direction').value,'');
 assert.equal(doc.querySelector('#direction-note').hidden,true);
 assert.equal(doc.querySelectorAll('[data-design-choice][aria-selected=true]').length,1);
 await window.happyDOM.close();
});
test('All three directions update the composition, accessible label and inquiry field',async()=>{
 const {window,doc}=setup();
 for(const [slug,label] of [['expressive','Expressiv'],['atmospheric','Atmosphärisch'],['editorial','Editorial']]){
  doc.querySelector('#design-'+slug).click();
  assert.equal(doc.querySelector('#design-stage').dataset.design,slug);
  assert.equal(doc.querySelector('#design-stage').getAttribute('aria-labelledby'),'design-'+slug);
  assert.equal(doc.querySelector('#design-direction').value,label);
  assert.equal(new window.FormData(doc.querySelector('#contact-form')).get('gestaltungsrichtung'),label);
  assert.equal(doc.querySelector('#direction-note').hidden,false);
  assert.equal(doc.querySelectorAll('[data-design-choice][aria-selected=true]').length,1);
  assert.match(doc.querySelector('#design-announcement').textContent,new RegExp(label));
 }
 await window.happyDOM.close();
});
test('Arrow keys wrap and Home/End move selection and focus together',async()=>{
 const {window,doc}=setup();
 const key=(id,key)=>doc.querySelector(id).dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 key('#design-editorial','ArrowLeft');
 assert.equal(doc.activeElement.id,'design-atmospheric');
 key('#design-atmospheric','ArrowRight');
 assert.equal(doc.activeElement.id,'design-editorial');
 key('#design-editorial','End');
 assert.equal(doc.activeElement.id,'design-atmospheric');
 key('#design-atmospheric','Home');
 assert.equal(doc.activeElement.id,'design-editorial');
 assert.equal(doc.querySelectorAll('[data-design-choice][tabindex="0"]').length,1);
 await window.happyDOM.close();
});
test('Inquiry link explicitly chooses the visible direction; preference can be removed',async()=>{
 const {window,doc}=setup();
 doc.querySelector('[data-design-inquiry]').click();
 assert.equal(doc.querySelector('#design-direction').value,'Editorial');
 doc.querySelector('#remove-direction').click();
 assert.equal(doc.querySelector('#design-direction').value,'');
 assert.equal(doc.querySelector('#direction-note').hidden,true);
 assert.equal(doc.querySelector('#design-stage').dataset.design,'editorial');
 await window.happyDOM.close();
});
test('Successful form reset removes the visible design note',async()=>{
 const {window,doc}=setup();
 doc.querySelector('#design-expressive').click();
 doc.querySelector('#contact-form').reset();
 assert.equal(doc.querySelector('#direction-note').hidden,true);
 await window.happyDOM.close();
});
