(() => {
 const names={interior:'Mila Hartmann · Interior Design',kulinarik:'Matteo Rossi · Private Dining',shop:'FORM · Onlineshop',fotografie:'Elena Voss · Fotografie',architektur:'David Kern · Architektur',schmuck:'Sofia Brandt · Schmuckgestaltung',immobilien:'Clara Winter · Immobilien',software:'Leon Weber · Software',training:'Nora Seidel · Training',beratung:'Jonas Bergmann · Beratung',klang:'Ada Lind · Klang'};
 const field=document.querySelector('#project-interest'), note=document.querySelector('#project-interest-note'),label=document.querySelector('#project-interest-label');
 const choose=slug=>{if(!field||!names[slug])return;field.value=names[slug];label.textContent=names[slug];note.hidden=false;if(slug==='shop'){const radio=document.querySelector('input[value="Ein Onlineshop"]');if(radio)radio.checked=true;}};
 const link=document.querySelector('#preview-inquiry');
 link?.addEventListener('click',event=>{const slug=link.dataset.project;if(!names[slug])return;if(!field){link.href='/?beispiel='+slug+'#kontakt';return;}event.preventDefault();document.querySelector('#work-preview')?.close();choose(slug);document.querySelector('#kontakt').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.querySelector('#name').focus({preventScroll:true});});
 const reset=()=>{if(!field)return;field.value='';label.textContent='';note.hidden=true;};
 document.querySelector('#remove-project-interest')?.addEventListener('click',reset);
 document.querySelector('#contact-form')?.addEventListener('reset',()=>queueMicrotask(reset));
 const incoming=new URLSearchParams(location.search).get('beispiel');choose(incoming);
})();
