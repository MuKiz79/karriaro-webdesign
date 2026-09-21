import {renderModel} from './pavilion.mjs?v=d8658afc6d30';
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const contact=q('#sig-contact');
all('[data-contact]').forEach(b=>{if(contact)b.addEventListener('click',()=>contact.showModal())});
contact?.addEventListener('click',e=>{if(e.target!==contact)return;const r=contact.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)contact.close()});
function keys(group){if(!group)return;const buttons=[...group.querySelectorAll('button')];group.addEventListener('keydown',e=>{const i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(['ArrowRight','ArrowDown'].includes(e.key))next=(i+1)%buttons.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))next=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next].focus();buttons[next].click()})}
all('.lw-track,.ns-frame-nav,.ns-week-choices').forEach(keys);

const sun=q('#dk-sun');
if(sun){
 const aperture=q('#dk-aperture'),model=q('#model-geometry');let frame=0;
 const paint=()=>{frame=0;const s=Number(sun.value),a=Number(aperture.value),time=s<30?'Morgen':s>70?'Abend':'Mittag';model.innerHTML=renderModel(s,a);q('#dk-sun-value').textContent=time;sun.setAttribute('aria-valuetext',`${time}, Position ${s} von 100`);q('#dk-aperture-value').textContent=a+' %';aperture.setAttribute('aria-valuetext',a+' Prozent Öffnungsweite');q('#dk-insight').textContent=a<35?'Eine schmale Öffnung setzt einen konzentrierten Lichtakzent.':s<30?'Das Licht fällt von der Seite ein. Der helle Bereich wandert zum Rand.':s>70?'Mit dem Abend wandert das Licht auf die andere Seite des Raums.':'Das Licht sammelt sich in der Mitte. Die Ränder bleiben ruhiger.';q('#model-description').textContent=`Schnittmodell mit ${a} Prozent Öffnungsweite. Sonnenstand: ${time}. Der helle Bereich auf dem Boden folgt der Öffnung und dem Sonnenstand.`;};
 
 sun.addEventListener('input',paint);aperture.addEventListener('input',paint);q('#dk-reset').addEventListener('click',()=>{sun.value=45;aperture.value=65;cancelAnimationFrame(frame);paint()});paint();
}

const task=q('#lw-task');
if(task){
 let step=0;const demo=q('#lw-demo'),steps=all('[data-flow-step]'),next=q('#lw-next');
 const names=['Offen','In Arbeit','Erledigt'],descriptions=['Die Aufgabe ist notiert. Jetzt kann jemand den ersten Schritt übernehmen.','Die Aufgabe wird bearbeitet. Der aktuelle Stand ist für das Team sichtbar.','Abgeschlossen. Aufgabe, Ergebnis und Dateiname sind für die Übergabe zusammengeführt.'];
 function filename(text){return text.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'meine-aufgabe'}
 function paint(){const title=task.value.trim()||'Deine nächste Aufgabe';demo.dataset.step=String(step);q('#lw-task-title').textContent=title;q('#lw-filename').textContent=filename(title)+'.pdf';q('#lw-description').textContent=descriptions[step];q('#lw-receipt-label').textContent=['AUFGABE ANGELEGT','IN BEARBEITUNG','BEREIT ZUR ÜBERGABE'][step];q('.receipt-symbol').textContent=['↗','→','✓'][step];q('#lw-receipt-foot').textContent=['Noch offen / bereit für den Anfang','In Arbeit / der nächste Schritt läuft','Erledigt / alles an einem Ort'][step];q('#lw-step-number').textContent='0'+(step+1);q('#lw-status').textContent=`0${step+1} / ${names[step]} — ${title}`;steps.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===step)));next.replaceChildren(document.createTextNode(['In Arbeit nehmen','Als erledigt markieren','Abgeschlossen'][step]));const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent=step===2?'✓':'→';next.append(arrow);next.disabled=step===2;}
 steps.forEach((b,i)=>b.addEventListener('click',()=>{step=i;paint()}));next.addEventListener('click',()=>{step=Math.min(2,step+1);paint()});q('#lw-reset').addEventListener('click',()=>{step=0;task.value='Website veröffentlichen';paint()});task.addEventListener('input',paint);paint();
}

const motion=q('#ns-motion');
if(motion){
 const buttons=all('[data-moment]'),frames=all('[data-motion-frame]'),play=q('#ns-play'),names=['Ankommen.','Raum nehmen.','Aufrichten.'];let current=0,playing=false,timer=null,tick=0,drag=null;
 const paint=()=>{motion.dataset.frame=String(current);frames.forEach((f,i)=>{f.toggleAttribute('hidden',i!==current);f.setAttribute('aria-hidden',String(i!==current))});buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===current)));q('#ns-moment-number').textContent='0'+(current+1);q('#ns-moment-title').textContent=names[current];};
 const stop=()=>{clearTimeout(timer);timer=null;playing=false;motion.classList.remove('is-playing');play.setAttribute('aria-pressed','false');play.innerHTML='Sequenz ansehen <span aria-hidden="true">▷</span>';};
 buttons.forEach((b,i)=>b.addEventListener('click',()=>{stop();current=i;paint()}));
 play.addEventListener('click',()=>{if(playing){stop();return}playing=true;tick=0;motion.classList.add('is-playing');play.setAttribute('aria-pressed','true');play.innerHTML='Pausieren <span aria-hidden="true">Ⅱ</span>';const next=()=>{if(!playing)return;current=tick%3;paint();tick++;if(tick<6)timer=setTimeout(next,1400);else timer=setTimeout(stop,1400)};next()});
 const film=q('#ns-film');film.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,start:current,horizontal:false};});
 film.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.horizontal&&Math.abs(dy)>Math.abs(dx)+8){drag=null;return}if(Math.abs(dx)>18){drag.horizontal=true;film.setPointerCapture(e.pointerId);stop();current=Math.max(0,Math.min(2,drag.start+Math.round(dx/Math.max(65,film.clientWidth/3))));paint()}});
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>film.addEventListener(type,()=>drag=null));film.addEventListener('dragstart',e=>e.preventDefault());
 new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop()},{threshold:.1}).observe(motion);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});reduced.addEventListener('change',stop);paint();
 const week=[['KLEIN ANFANGEN','Was passt zwischen deine Termine?','Wir schauen zuerst nach einem Zeitfenster, das wirklich dir gehört. Ein überschaubarer Einstieg darf reichen.'],['NEUGIER MITBRINGEN','Was würdest du gern wieder ausprobieren?','Wir sprechen darüber, welche Bewegung dir einmal Freude gemacht hat. Daraus kann ein erster gemeinsamer Versuch werden.'],['BEWEGLICH BLEIBEN','Was bleibt, wenn sich die Woche ändert?','Wir suchen nach einem verlässlichen Anker und lassen Spielraum für alles, was dazwischenkommt.']];
 const choices=all('[data-week]');choices.forEach((b,i)=>b.addEventListener('click',()=>{choices.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));q('#ns-week-tag').textContent=week[i][0];q('#ns-week-title').textContent=week[i][1];q('#ns-week-copy').textContent=week[i][2]}));
}

// Small collection demonstrations, activated by deliberate hover or keyboard focus.
all('[data-preview-model]').forEach(el=>{el.innerHTML=`<svg viewBox="0 0 960 630" aria-hidden="true"><defs><filter id="model-shadow"><feGaussianBlur stdDeviation="12"/></filter></defs><g>${renderModel()}</g></svg>`;const card=el.closest('a'),group=el.querySelector('g');let frame=0;const move=e=>{if(reduced.matches)return;const r=el.getBoundingClientRect(),sun=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{group.innerHTML=renderModel(sun,65)})};card.addEventListener('pointermove',move);card.addEventListener('focus',()=>{group.innerHTML=renderModel(80,65)});const reset=()=>{cancelAnimationFrame(frame);group.innerHTML=renderModel()};card.addEventListener('pointerleave',reset);card.addEventListener('blur',reset)});
all('.sig-preview-paper').forEach(el=>{const card=el.closest('a');const set=n=>{el.dataset.demoStep=n;el.querySelector('.preview-ticket-status').textContent=n==='2'?'03 / ERLEDIGT':'01 / OFFEN'};card.addEventListener('pointerenter',()=>set('2'));card.addEventListener('focus',()=>set('2'));card.addEventListener('pointerleave',()=>set('0'));card.addEventListener('blur',()=>set('0'))});
