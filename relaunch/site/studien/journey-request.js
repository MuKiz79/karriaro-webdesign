(() => {
 const section=document.querySelector('#projektanfrage');if(!section)return;
 const scope=document.querySelector('#demo-scope'),timing=document.querySelector('#demo-timing'),result=document.querySelector('.demo-result');
 document.querySelectorAll('header [data-contact], main [data-contact]').forEach(button=>button.addEventListener('click',event=>{event.stopImmediatePropagation();section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});scope.focus({preventScroll:true});},true));
 document.querySelectorAll('[data-demo-scope]').forEach(link=>link.addEventListener('click',()=>{scope.value=link.dataset.demoScope;result.textContent='';}));
 [scope,timing].forEach(input=>input.addEventListener('change',()=>result.textContent=''));
 document.querySelector('[data-demo-request]').addEventListener('click',()=>{result.textContent='Ihre Beispielanfrage: '+scope.value+' · '+timing.value+'. Im echten Auftritt folgt jetzt die persönliche Abstimmung. Diese Demonstration wurde nicht versendet.';});
})();
