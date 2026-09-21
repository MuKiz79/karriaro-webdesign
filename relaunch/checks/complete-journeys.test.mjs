import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {Window}=await import(process.env.HAPPY_DOM_PACKAGE||'happy-dom');
async function setup(page,script,search=''){
 const w=new Window({url:'http://localhost/'+search,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 const html=await readFile(new URL('../site/'+page,import.meta.url),'utf8');
 w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
 let requests=0;w.fetch=()=>{requests++;throw Error('Unexpected request');};
 w.eval(await readFile(new URL('../site/'+script,import.meta.url),'utf8'));
 return {w,d:w.document,q:s=>w.document.querySelector(s),requests:()=>requests};
}
test('Shop keeps variant/size lines separate, calculates shipping, caps quantities and removes empty lines',async()=>{
 const {w,q,d,requests}=await setup('studien/shop.html','studien/shop.js');
 q('[data-product="poliert"]').click();q('#add-product').click();q('#product-size').value='S';q('#add-product').click();
 q('#product-finish').value='satiniert';q('#add-product').click();
 assert.equal(d.querySelectorAll('.cart-line').length,3);
 assert.match(q('#cart-summary').textContent,/555,00/);assert.match(q('#cart-summary').textContent,/Kostenlos/);
 for(let i=0;i<12;i++)q('#add-product').click();assert.equal(q('[data-cart-count]').textContent,'9');assert.equal(q('#add-product').disabled,true);
 q('[data-action="minus"][data-key="poliert-M"]').click();assert.equal(d.querySelectorAll('.cart-line').length,2);
 q('[data-action="remove"][data-key="satiniert-S"]').click();assert.match(q('#cart-summary').textContent,/185,90/);
 q('[data-action="remove"][data-key="poliert-S"]').click();assert.equal(q('#start-checkout').disabled,true);assert.equal(requests(),0);
 await w.happyDOM.close();
});
test('Shop checkout preserves selections when going back and finishes only a local demonstration',async()=>{
 const {w,q,requests}=await setup('studien/shop.html','studien/shop.js');
 q('[data-product="poliert"]').click();q('#add-product').click();q('[data-open-cart]').click();q('#start-checkout').click();
 q('input[value="express"]').checked=true;q('input[value="Karte"]').checked=true;q('#review-order').click();
 assert.equal(q('#checkout-review').hidden,false);assert.match(q('#order-summary').textContent,/192,90/);assert.match(q('#order-payment').textContent,/Karte/);
 q('#back-delivery').click();assert.equal(q('input[value="express"]').checked,true);
 q('#review-order').click();q('#complete-demo').click();assert.equal(q('#checkout-done').hidden,false);assert.equal(q('[data-cart-count]').textContent,'0');assert.equal(q('#start-checkout').disabled,true);assert.equal(requests(),0);
 await w.happyDOM.close();
});
test('Shop filters hide only the other finish and restore both products',async()=>{
 const {w,q,d}=await setup('studien/shop.html','studien/shop.js');q('[data-filter="satiniert"]').click();
 assert.equal(q('[data-finish="poliert"]').hidden,true);assert.equal(q('[data-finish="satiniert"]').hidden,false);
 q('[data-filter="all"]').click();assert.equal(d.querySelectorAll('[data-finish][hidden]').length,0);await w.happyDOM.close();
});
test('Preview inquiry preserves a draft, selects shop scope and can be removed/reset',async()=>{
 const {w,q}=await setup('index.html','assets/project-interest.js');q('#message').value='Vorhandener Entwurf';q('#name').value='Test';q('#preview-inquiry').dataset.project='shop';q('#preview-inquiry').click();
 assert.equal(q('#message').value,'Vorhandener Entwurf');assert.equal(q('#name').value,'Test');assert.match(q('#project-interest').value,/FORM/);assert.equal(q('input[value="Ein Onlineshop"]').checked,true);assert.equal(q('#project-interest-note').hidden,false);
 q('#remove-project-interest').click();assert.equal(q('#project-interest').value,'');assert.equal(q('#project-interest-note').hidden,true);
 q('#preview-inquiry').click();q('#contact-form').reset();await Promise.resolve();assert.equal(q('#project-interest').value,'');await w.happyDOM.close();
});
test('Only known project query parameters enter the real inquiry',async()=>{
 for(const slug of ['shop','interior','unknown<script>']){const {w,q}=await setup('index.html','assets/project-interest.js','?beispiel='+encodeURIComponent(slug));assert.equal(q('#project-interest-note').hidden,slug.startsWith('unknown'));assert.equal(q('#project-interest').value.includes('<script>'),false);await w.happyDOM.close();}
});
for(const slug of ['interior','kulinarik'])test(slug+' guided inquiry uses the selected service and clears outdated summaries',async()=>{
 const {w,q,requests}=await setup('studien/'+slug+'.html','studien/journey-request.js');const link=q('[data-demo-scope]');link.addEventListener('click',e=>e.preventDefault());link.click();q('[data-demo-request]').click();assert.ok(q('.demo-result').textContent.includes(link.dataset.demoScope));assert.match(q('.demo-result').textContent,/nicht versendet/);
 q('#demo-timing').dispatchEvent(new w.Event('change'));assert.equal(q('.demo-result').textContent,'');assert.equal(requests(),0);await w.happyDOM.close();
});
async function motionSetup(reduced=false){
 const w=new Window({url:'http://localhost/studien/schmuck.html',settings:{enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 w.document.write('<section><input id="jewel-light" type="range" value="35"></section>');
 const frames=new Map();let id=0,observe;
 w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};w.cancelAnimationFrame=id=>frames.delete(id);
 w.matchMedia=()=>({matches:reduced,addEventListener(){}});
 w.IntersectionObserver=class{constructor(fn){observe=fn}observe(){}disconnect(){}};
 w.eval(await readFile(new URL('../site/studien/polish.js',import.meta.url),'utf8'));
 const tick=t=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(t));};
 return {w,d:w.document,frames,tick,view:yes=>observe([{isIntersecting:yes}])};
}
test('Concept motion autoplays in view, pauses on manual interaction and requires explicit resume',async()=>{
 const {w,d,frames,tick,view}=await motionSetup();view(true);tick(1000);const first=d.querySelector('input').value;tick(4000);assert.notEqual(d.querySelector('input').value,first);
 d.querySelector('input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(frames.size,0);view(false);view(true);assert.equal(frames.size,0);
 d.querySelector('.motion-pause').click();assert.equal(frames.size,1);view(false);assert.equal(frames.size,0);await w.happyDOM.close();
});
test('Reduced motion never starts an automatic concept animation',async()=>{
 const {w,d,frames,view}=await motionSetup(true);view(true);assert.equal(frames.size,0);assert.equal(d.querySelector('input').value,'35');await w.happyDOM.close();
});
