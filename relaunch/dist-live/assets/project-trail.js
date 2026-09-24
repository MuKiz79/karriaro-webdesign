(() => {
  'use strict';
  const key = 'karriaro-project-trail-v1';
  const ideas = {
    kante: ['KANTE', 'Klarheit und Präzision'],
    waldruehe: ['WALDRUHE', 'Ruhe und Atmosphäre'],
    tischundton: ['TISCH & TON', 'Produkte als Erlebnis'],
    raum: ['RAUM', 'Orientierung und Vertrauen'],
    halo: ['HALO', 'Stil und Persönlichkeit'],
    vecto: ['VECTO', 'Komplexes verständlich machen']
  };
  const aside = document.querySelector('#project-trail');
  if (!aside) return;
  const showFloating = /^\/(?:|index\.html|arbeiten(?:\.html)?|einblick-(?:kante|tischundton)(?:\.html)?)$/.test(location.pathname);
  const toggle = aside.querySelector('.project-trail-toggle');
  const panel = aside.querySelector('#project-trail-panel');
  const list = aside.querySelector('#project-trail-list');
  const form = document.querySelector('#contact-form');
  const projectField = document.querySelector('#project-interest');
  const directionField = document.querySelector('#design-direction');
  const capabilityField = document.querySelector('#capability-interest');

  const safeRead = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
      return {
        projects: Array.isArray(saved.projects) ? [...new Set(saved.projects.filter(slug => Object.hasOwn(ideas, slug)))].slice(0, 6) : [],
        legacy: typeof saved.legacy === 'string' ? saved.legacy.slice(0, 150) : '',
        direction: ['Editorial', 'Expressiv', 'Atmosphärisch'].includes(saved.direction) ? saved.direction : '',
        capability: typeof saved.capability === 'string' ? saved.capability.slice(0, 150) : ''
      };
    } catch (_) { return {projects: [], legacy: '', direction: '', capability: ''}; }
  };
  const state = safeRead();
  const query = new URLSearchParams(location.search).get('beispiel');
  if (Object.hasOwn(ideas, query) && !state.projects.includes(query)) state.projects.push(query);
  else if (projectField?.value) state.legacy = projectField.value;

  const save = () => {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* Browsing still works without storage. */ }
  };
  const setOpen = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  const line = (kind, value, slug) => {
    const item = document.createElement('li');
    const copy = document.createElement('span');
    const category = document.createElement('small');
    category.textContent = kind;
    const strong = document.createElement('strong');
    strong.textContent = value;
    copy.append(category, strong);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${kind} ${value} aus der Projektspur entfernen`);
    remove.addEventListener('click', () => {
      if (slug) state.projects = state.projects.filter(project => project !== slug);
      else if (kind === 'Website-Beispiel') state.legacy = '';
      else if (kind === 'Gestaltungsrichtung') state.direction = '';
      else state.capability = '';
      render();
    });
    item.append(copy, remove);
    return item;
  };
  const render = () => {
    const names = state.projects.map(slug => `${ideas[slug][0]} · ${ideas[slug][1]}`);
    const projectText = [...names, state.legacy].filter(Boolean).join(' | ');
    if (projectField) projectField.value = projectText;
    const projectLabel = document.querySelector('#project-interest-label');
    if (projectLabel) projectLabel.textContent = projectText;
    const projectNote = document.querySelector('#project-interest-note');
    if (projectNote) projectNote.hidden = !projectText;
    if (directionField) directionField.value = state.direction;
    const directionLabel = document.querySelector('[data-current-direction]');
    if (directionLabel && state.direction) directionLabel.textContent = state.direction;
    const directionNote = document.querySelector('#direction-note');
    if (directionNote) directionNote.hidden = !state.direction;
    if (capabilityField) capabilityField.value = state.capability;
    const capabilityLabel = document.querySelector('#capability-interest-label');
    if (capabilityLabel) capabilityLabel.textContent = state.capability;
    const capabilityNote = document.querySelector('#capability-interest-note');
    if (capabilityNote) capabilityNote.hidden = !state.capability;

    const count = state.projects.length + Number(Boolean(state.legacy)) + Number(Boolean(state.direction)) + Number(Boolean(state.capability));
    aside.hidden = count === 0 || !showFloating;
    document.querySelector('#brief-heading')?.toggleAttribute('hidden', count === 0);
    aside.querySelector('#project-trail-count').textContent = String(count).padStart(2, '0');
    list.replaceChildren(...state.projects.map(slug => line('Website-Qualität', `${ideas[slug][0]} / ${ideas[slug][1]}`, slug)));
    if (state.legacy) list.append(line('Website-Beispiel', state.legacy));
    if (state.direction) list.append(line('Gestaltungsrichtung', state.direction));
    if (state.capability) list.append(line('Gewünschte Funktion', state.capability));
    document.querySelectorAll('[data-trail-project]').forEach(button => {
      const selected = state.projects.includes(button.dataset.trailProject);
      button.setAttribute('aria-pressed', String(selected));
      if (button.id === 'preview-save') button.textContent = selected ? 'Für Ihr Projekt gemerkt ✓' : 'Qualität für mein Projekt merken +';
      else {
        const mark = button.querySelector('b');
        if (mark) mark.textContent = selected ? '✓' : '+';
      }
    });
    if (!count) setOpen(false);
    save();
  };
  const addProject = slug => {
    if (!Object.hasOwn(ideas, slug)) return false;
    if (!state.projects.includes(slug)) state.projects.push(slug);
    render();
    return true;
  };
  window.KarriaroTrail = {
    supports: slug => Object.hasOwn(ideas, slug),
    hasProject: slug => state.projects.includes(slug),
    addProject
  };
  document.querySelectorAll('[data-trail-project]').forEach(button => button.addEventListener('click', () => {
    const slug = button.dataset.trailProject;
    if (!Object.hasOwn(ideas, slug)) return;
    if (state.projects.includes(slug)) state.projects = state.projects.filter(project => project !== slug);
    else state.projects.push(slug);
    render();
    if (button.id !== 'preview-save' && !aside.hidden) setOpen(true);
  }));
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  aside.querySelector('#project-trail-close').addEventListener('click', () => { setOpen(false); toggle.focus(); });
  aside.querySelector('.project-trail-link').addEventListener('click', () => setOpen(false));
  const contact = document.querySelector('#kontakt');
  if (contact && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      const inContact = entries[0]?.isIntersecting || false;
      aside.classList.toggle('is-at-contact', inContact);
      if (inContact) setOpen(false);
    }, {rootMargin: '0px 0px -15% 0px'}).observe(contact);
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
  });
  document.querySelector('#remove-project-interest')?.addEventListener('click', () => {
    state.projects = [];
    state.legacy = '';
    render();
  });
  document.addEventListener('karriaro:interest-change', event => {
    if (directionField) state.direction = directionField.value;
    if (capabilityField) state.capability = capabilityField.value;
    if (event.detail && Object.hasOwn(event.detail, 'legacyProject')) state.legacy = event.detail.legacyProject;
    render();
  });
  form?.addEventListener('reset', () => queueMicrotask(() => {
    state.projects = [];
    state.legacy = '';
    state.direction = '';
    state.capability = '';
    render();
  }));
  render();
})();
