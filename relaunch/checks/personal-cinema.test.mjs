import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {Window}=await import(process.env.HAPPY_DOM_PACKAGE||'happy-dom');
const markup=await readFile(new URL('../site/persoenliche-websites.html',import.meta.url),'utf8');
const behavior=await readFile(new URL('../site/assets/personal-inquiry.js',import.meta.url),'utf8');
const shared=await readFile(new URL('../site/assets/site.js',import.meta.url),'utf8');
async function setup({reduce=false,mobile=false,rejectPlay=false,response=true}={}) {
 const w=new Window({url:'https://example.test/persoenliche-websites',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 w.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
 const d=w.document,video=d.getElementById('pg-preview-video');let paused=true,visibleCallback;const requests=[];
 const reduced={matches:reduce,addEventListener(_e,cb){this.change=cb;}};
 const narrow={matches:mobile,addEventListener(_e,cb){this.change=cb;}};
 w.matchMedia=q=>q.includes('reduced-motion')?reduced:q.includes('700')?narrow:{matches:false,addEventListener(){}};
 Object.defineProperty(video,'paused',{get:()=>paused});video.load=()=>{};
 video.play=async()=>{if(rejectPlay)throw new Error('Autoplay rejected');paused=false;video.dispatchEvent(new w.Event('playing'));};
 video.pause=()=>{if(!paused){paused=true;video.dispatchEvent(new w.Event('pause'));}};
 w.IntersectionObserver=class{constructor(cb){visibleCallback=cb;}observe(){}disconnect(){}};
 w.fetch=async(url,options)=>{requests.push({url,options});return {ok:response};};
 w.eval(behavior);w.eval(shared);
 return {w,d,video,reduced,narrow,requests,view:v=>visibleCallback([{isIntersecting:v}])};
}
test('film autoplays in view, pauses out of view and remembers an explicit pause',async()=>{
 const x=await setup();const {w,d,video}=x;assert.equal(video.getAttribute('src'),null);
 x.view(true);assert.equal(video.paused,false);assert.match(video.src,/desktop/);
 x.view(false);assert.equal(video.paused,true);x.view(true);assert.equal(video.paused,false);
 d.getElementById('pg-preview-toggle').click();x.view(false);x.view(true);assert.equal(video.paused,true);
 d.getElementById('pg-preview-toggle').click();assert.equal(video.paused,false);
 x.narrow.matches=true;x.narrow.change();assert.match(video.src,/mobile/);
 await w.happyDOM.close();
});
test('reduced motion stays on the responsive poster without downloading video',async()=>{
 const {w,d,video,view}=await setup({reduce:true,mobile:true});view(true);assert.equal(video.getAttribute('src'),null);assert.equal(video.paused,true);assert.equal(d.querySelector('picture source').media,'(max-width:700px)');
 d.getElementById('pg-preview-toggle').click();assert.equal(video.paused,false);assert.match(video.src,/mobile/);await w.happyDOM.close();
});
test('autoplay rejection and media errors retain the poster and the original-site link',async()=>{
 const {w,d,video,view}=await setup({rejectPlay:true});view(true);await new Promise(r=>setTimeout(r,0));assert.equal(video.paused,true);assert.equal(d.querySelector('.pg-film-screen').classList.contains('has-frame'),false);
 video.dispatchEvent(new w.Event('error'));assert.match(d.getElementById('pg-preview-state').textContent,/NICHT VERFÜGBAR/);assert.ok(d.querySelector('.pg-film-caption a[href="https://muammerkizilaslan.com/"]'));await w.happyDOM.close();
});
test('form failure retains the draft and example, success sends them and clears the example',async()=>{
 for(const response of [false,true]){
  const {w,d,requests}=await setup({response});d.querySelector('[data-example]').click();
  d.getElementById('pl-name').value='Lokale Prüfung';d.getElementById('pl-email').value='test@example.invalid';d.getElementById('pl-goal').value='Berufliche Entwicklung';
  d.getElementById('contact-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));
  assert.equal(requests.length,1);assert.match(requests[0].options.body.get('beispiel'),/Muammer/);
  assert.equal(d.getElementById('form-status').dataset.state,response?'success':'error');
  assert.equal(d.getElementById('pg-selected-example').hidden,response);
  if(!response)assert.equal(d.getElementById('pl-goal').value,'Berufliche Entwicklung');
  await w.happyDOM.close();
 }
});
test('whitespace-only inputs never reach the form endpoint',async()=>{
 const {w,d,requests}=await setup();d.getElementById('pl-name').value='   ';d.getElementById('pl-email').value='test@example.invalid';d.getElementById('pl-goal').value='  ';
 d.getElementById('contact-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(requests.length,0);await w.happyDOM.close();
});
