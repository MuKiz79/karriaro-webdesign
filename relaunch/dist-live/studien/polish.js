(() => {
 const slug=location.pathname.split('/').pop().replace('.html','');
 // The prior collection now leads to the same public gallery as every return link.
 if(slug==='index')location.replace('/arbeiten');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const input=document.querySelector('#house-cut')||document.querySelector('#jewel-light');
 if(!input)return;
 let visible=false,manual=false,raf=0,last=0,elapsed=0;
 const button=document.createElement('button');button.type='button';button.className='motion-pause';button.textContent=reduced.matches?'Animation starten':'Animation anhalten';button.setAttribute('aria-pressed',String(!reduced.matches));input.closest('section').append(button);
 const stop=()=>{cancelAnimationFrame(raf);raf=0;last=0;};
 const frame=now=>{if(!visible||document.hidden||manual||reduced.matches)return;elapsed+=last?(now-last):0;last=now;const house=input.id==='house-cut';input.value=String(Math.round(house?55+27*Math.sin(elapsed/6500):50+35*Math.sin(elapsed/7000)));input.dispatchEvent(new Event('input',{bubbles:true}));raf=requestAnimationFrame(frame);};
 const start=()=>{stop();if(visible&&!document.hidden&&!manual&&!reduced.matches)raf=requestAnimationFrame(frame);};
 const pause=()=>{manual=true;stop();button.textContent='Animation fortsetzen';button.setAttribute('aria-pressed','false');};
 // Give user selections ownership; automatic movement never overwrites an active choice.
 input.closest('section').addEventListener('pointerdown',e=>{if(e.target!==button)pause();});
 input.addEventListener('keydown',pause);button.addEventListener('click',()=>{manual=!manual;if(manual){pause();return;}if(reduced.matches){input.value=input.id==='house-cut'?'78':'70';input.dispatchEvent(new Event('input',{bubbles:true}));button.textContent='Reduzierte Bewegung aktiv';button.setAttribute('aria-pressed','false');return;}button.textContent='Animation anhalten';button.setAttribute('aria-pressed','true');start();});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();},{threshold:.1}).observe(input.closest('section'));
 document.addEventListener('visibilitychange',start);reduced.addEventListener('change',()=>{button.textContent=reduced.matches?'Reduzierte Bewegung aktiv':'Animation fortsetzen';manual=true;stop();});window.addEventListener('pagehide',stop);
})();
