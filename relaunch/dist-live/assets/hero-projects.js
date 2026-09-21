(() => {
  'use strict';
  const panel = document.querySelector('#hero-project-panel');
  if (!panel) return;
  const projects = {
    interior: {name:'Mila Hartmann',category:'Interior',description:'Räume entdecken. Materialien selbst zusammenstellen.'},
    kulinarik: {name:'Matteo Rossi',category:'Kulinarik',description:'Den Abend entdecken. Anlass und Menü auswählen.'},
    shop: {name:'FORM / Objekte',category:'Onlineshop',description:'Kollektion, Produktwahl und Checkout selbst ausprobieren.'}
  };
  const tabs = [...document.querySelectorAll('[data-project]')];
  const image = document.querySelector('#hero-project-image');
  const link = document.querySelector('#hero-project-link');
  const select = (key, announce = true) => {
    const project = projects[key];
    if (!project) return;
    tabs.forEach(tab => {
      const active = tab.dataset.project === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', 'project-' + key);
    image.src = '/assets/websites/' + key + '.png';
    image.alt = 'Startseitenansicht der Website ' + project.name;
    link.href = '/studien/' + key + '.html';
    link.setAttribute('aria-label', 'Website ' + project.name + ' öffnen');
    document.querySelector('#hero-project-name').textContent = project.name;
    document.querySelector('#hero-project-description').textContent = project.description;
    if (announce) document.querySelector('#hero-project-status').textContent = project.category + ': ' + project.name + '. Website zum Öffnen ausgewählt.';
  };
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => select(tab.dataset.project));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next].dataset.project);
      tabs[next].focus();
    });
  });
  select('shop',false);
})();
