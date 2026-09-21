(()=>{
  'use strict';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
  const arrive=el=>{if(!el||reduced.matches)return;el.classList.remove('craft-arrive');void el.offsetWidth;el.classList.add('craft-arrive')};
  const groupKeys=group=>{if(!group)return;const buttons=[...group.querySelectorAll('button')];group.addEventListener('keydown',e=>{const i=buttons.indexOf(document.activeElement);if(i<0)return;let n=i;if(['ArrowRight','ArrowDown'].includes(e.key))n=(i+1)%buttons.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))n=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=buttons.length-1;else return;e.preventDefault();buttons[n].focus();buttons[n].click()})};
  all('.material-select,.cinema-selector,.object-focus,.dish-notes,.sound-presets,.s-layer-group').forEach(groupKeys);

  const leaves=all('[data-leaf]');
  if(leaves.length){const page=q('#journal-page'),titles=['DIE ADRESSE','DAS GEFÜHL','DER MENSCH'];let selected=0;
    leaves.forEach((b,i)=>b.addEventListener('click',()=>{selected=i;page.textContent=`0${i+1} / ${titles[i]}`;arrive(q('#leaf-'+i))}));
    q('#journal-prev').addEventListener('click',()=>leaves[(Number(q('.atlas-spreads').dataset.open)+leaves.length-1)%leaves.length].click());
    q('#journal-next').addEventListener('click',()=>leaves[(Number(q('.atlas-spreads').dataset.open)+1)%leaves.length].click());
    new MutationObserver(()=>{selected=Number(q('.atlas-spreads').dataset.open);page.textContent=`0${selected+1} / ${titles[selected]}`}).observe(q('.atlas-spreads'),{attributes:true,attributeFilter:['data-open']});
  }

  const constellation=q('.network-field');
  if(constellation){const context=q('#network-context'),defaults=context.textContent;all('.network-node').forEach(node=>{const enter=()=>{context.textContent=node.querySelector('small').textContent.replace(' ↗','');node.classList.add('is-active')};const leave=()=>{context.textContent=defaults;node.classList.remove('is-active')};node.addEventListener('pointerenter',enter);node.addEventListener('pointerleave',leave);node.addEventListener('focus',enter);node.addEventListener('blur',leave)});}

  const material=q('.material-stage');
  if(material){const image=q('#material-cover-image'),caption=q('#material-cover-caption'),copy=q('#material-cover-note'),buttons=all('.material-select button');
    const studies=[['assets/living.webp','Fiktive Wohnraumstudie mit warmem Holz und ruhigen Naturtönen','01 / DER RAUM','Ein Lieblingsplatz entsteht aus dem Zusammenspiel.'],['assets/mila-materials.webp','KI-generierte Materialstudie aus Eiche, Leinen und Kalkstein','02 / DAS MATERIAL','Holz, Leinen, Stein. Drei Oberflächen, eine gemeinsame Sprache.'],['assets/living.webp','Licht und Schatten in einem Ausschnitt der fiktiven Wohnraumstudie','03 / DAS LICHT','Derselbe Raum. Ein anderer Blick auf Licht und Proportion.']];
    buttons.forEach((b,i)=>b.addEventListener('click',()=>{buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));material.dataset.material=String(i);image.src=studies[i][0];image.alt=studies[i][1];caption.textContent=studies[i][2];copy.textContent=studies[i][3];arrive(image)}));
    material.addEventListener('pointermove',e=>{if(reduced.matches||!fine.matches||e.target.closest('button'))return;const r=material.getBoundingClientRect();material.style.setProperty('--material-x',((e.clientX-r.left)/r.width-.5)*3+'deg');material.style.setProperty('--material-y',((e.clientY-r.top)/r.height-.5)*-2+'deg')},{passive:true});
    const reset=()=>{material.style.setProperty('--material-x','0deg');material.style.setProperty('--material-y','0deg')};material.addEventListener('pointerleave',reset);reduced.addEventListener('change',reset);
  }

  const score=q('.score-bars');
  if(score){const beats=all('[data-beat]'),bars=[...score.children];const paint=()=>{bars.forEach((bar,i)=>{const beat=beats[Math.floor(i/8)],type=Number(beat.dataset.type),heights=type===0?[8,12,18,25,25,18,12,8]:type===1?[15,30,40,18,30,45,22,12]:[5,5,5,5,5,5,5,5];bar.style.setProperty('--score-h',heights[i%8]+'px');bar.classList.toggle('is-current',beat.classList.contains('is-beat'))})};new MutationObserver(paint).observe(q('.beat-sequence'),{subtree:true,attributes:true,attributeFilter:['class','data-type']});paint();}

  const cinema=q('.cinema-selector');
  if(cinema){const buttons=all('[data-cinema]'),image=q('#cinema-image');const data=[['assets/elena-coast.webp','Eine kleine Figur an einer dunklen Küste mit silbrigem Meer','AM RAND DER STILLE / 01'],['assets/elena-glass.webp','Orangefarbenes Glas auf ultramarinblauer Fläche','LICHT BLEIBT / 02']];buttons.forEach((b,i)=>b.addEventListener('click',()=>{buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));image.src=data[i][0];image.alt=data[i][1];q('#cinema-caption').textContent=data[i][2];arrive(image)}));}

  const reveal=q('#arch-reveal');
  if(reveal){const exhibit=q('#arch-exhibit'),buttons=all('[data-arch-view]');const paint=()=>{const value=Number(reveal.value);exhibit.style.setProperty('--reveal',value+'%');exhibit.style.setProperty('--seam-visible',value>0&&value<100?'1':'0');exhibit.style.setProperty('--guides',String(value/100));q('#arch-reveal-value').textContent=value+' %';reveal.setAttribute('aria-valuetext',value+' Prozent Proportionsebene');buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.archView===(value===0?'image':'structure'))));exhibit.dataset.view=value===0?'image':'structure'};reveal.addEventListener('input',paint);buttons.forEach(b=>b.addEventListener('click',()=>{reveal.value=b.dataset.archView==='image'?'0':'65';paint()}));
    let dragging=false;const move=e=>{const r=exhibit.getBoundingClientRect();reveal.value=String(Math.round(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100))));paint()};exhibit.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.arch-exhibit-controls'))return;dragging=true;exhibit.setPointerCapture(e.pointerId);move(e);e.preventDefault()});exhibit.addEventListener('pointermove',e=>{if(dragging)move(e)});['pointerup','pointercancel','lostpointercapture'].forEach(name=>exhibit.addEventListener(name,()=>dragging=false));exhibit.addEventListener('dragstart',e=>e.preventDefault());paint();}

  const object=q('#j-object-image');
  if(object){const zoom=q('#object-zoom'),buttons=all('[data-object-focus]');let x=50,y=50,drag=null;
    const paint=()=>{object.style.setProperty('--focus-x',x+'%');object.style.setProperty('--focus-y',y+'%');object.classList.toggle('is-zoomed',Number(zoom.value)>100)};
    buttons.forEach((b,i)=>b.addEventListener('click',()=>{const views=[[100,50,50],[160,33,58],[185,66,65]];[zoom.value,x,y]=views[i];buttons.forEach(other=>other.setAttribute('aria-pressed',String(other===b)));zoom.dispatchEvent(new Event('input',{bubbles:true}));paint()}));
    zoom.addEventListener('input',paint);q('#zoom-reset').addEventListener('click',()=>{x=y=50;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0)));paint()});
    object.addEventListener('pointerdown',e=>{if(Number(zoom.value)<=100||e.button!==0)return;drag={px:e.clientX,py:e.clientY,x,y};object.setPointerCapture(e.pointerId);object.classList.add('is-dragging');e.preventDefault()});
    object.addEventListener('pointermove',e=>{if(!drag)return;const r=object.getBoundingClientRect();x=Math.max(0,Math.min(100,drag.x-(e.clientX-drag.px)/r.width*180));y=Math.max(0,Math.min(100,drag.y-(e.clientY-drag.py)/r.height*180));paint()});
    const stop=()=>{drag=null;object.classList.remove('is-dragging')};object.addEventListener('pointerup',stop);object.addEventListener('pointercancel',stop);object.addEventListener('lostpointercapture',stop);object.addEventListener('dragstart',e=>e.preventDefault());paint();
  }

  const ingredients=all('[data-ingredient]');
  if(ingredients.length){const texts=['ERDIG. SÜSS. DER ANFANG EINER IDEE.','SANFT. FRISCH. EIN HELLER GEGENPOL.','GRÜN. DUFTEND. DER LETZTE AKZENT.'];ingredients.forEach((b,i)=>b.addEventListener('click',()=>{ingredients.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));q('#dish-note').textContent=texts[i]}));all('[data-menu]').forEach(b=>b.addEventListener('click',()=>arrive(q('.c-menu-paper'))));}

  const instrument=q('.s-instrument');
  if(instrument){const presets=all('[data-sound-preset]'),layers=all('[data-layer]'),space=q('#sound-space'),play=q('#sound-start'),time=q('#sound-time');let started=0,timer=null;const settings=[[[true,false,true],30],[[true,true,false],15],[[true,true,true],85]];
    presets.forEach((b,i)=>b.addEventListener('click',()=>{settings[i][0].forEach((on,j)=>{if((layers[j].getAttribute('aria-pressed')==='true')!==on)layers[j].click()});space.value=String(settings[i][1]);space.dispatchEvent(new Event('input',{bubbles:true}));presets.forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
    layers.forEach(b=>b.addEventListener('click',()=>presets.forEach(p=>p.setAttribute('aria-pressed','false'))));space.addEventListener('input',()=>presets.forEach(p=>p.setAttribute('aria-pressed','false')));
    const display=()=>{const remaining=Math.max(0,30-Math.floor((Date.now()-started)/1000));time.textContent='00:'+String(remaining).padStart(2,'0');instrument.style.setProperty('--time-left',remaining/30*100+'%')};
    new MutationObserver(()=>{clearInterval(timer);timer=null;if(play.getAttribute('aria-pressed')==='true'){started=Date.now();display();timer=setInterval(display,1000)}else{time.textContent='00:30';instrument.style.setProperty('--time-left','100%')}}).observe(play,{attributes:true,attributeFilter:['aria-pressed']});window.addEventListener('pagehide',()=>clearInterval(timer));
  }

  // Every added interaction has a direct keyboard equivalent. Motion is optional.
  const navs=all('.t-nav nav a[href^="#"],.edition-nav nav a[href^="#"]');
  if(navs.length){const sections=navs.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);const seen=new Map();const observer=new IntersectionObserver(entries=>{entries.forEach(e=>seen.set(e.target,e.isIntersecting));const active=sections.find(s=>seen.get(s));navs.forEach(a=>{if(active&&a.hash==='#'+active.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})},{rootMargin:'-5% 0px -45% 0px'});sections.forEach(s=>observer.observe(s));}
})();
