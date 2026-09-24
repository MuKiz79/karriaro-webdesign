(() => {
  'use strict';
  const stage = document.querySelector('#design-stage');
  if (!stage) return;
  const tabs = [...document.querySelectorAll('[data-design-choice]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const labels = { editorial: 'Editorial', expressive: 'Expressiv', atmospheric: 'Atmosphärisch' };
  const descriptions = {
    editorial: 'Warme Materialien. Großzügige Räume. Eine ruhige, persönliche Erzählung.',
    expressive: 'Mutige Typografie. Klare Kontraste. Ein Auftritt mit eigener Haltung.',
    atmospheric: 'Bildfüllende Atmosphäre. Licht und Tiefe. Ein Moment zum Eintauchen.'
  };
  let current = 'editorial';
  function selectDesign(value, deliberate = true) {
    if (!Object.hasOwn(labels, value)) return;
    current = value;
    stage.dataset.design = value;
    stage.setAttribute('aria-labelledby', 'design-' + value);
    tabs.forEach(tab => {
      const selected = tab.dataset.designChoice === value;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelector('#design-description').textContent = descriptions[value];
    document.querySelector('#design-counter').textContent = '0' + (tabs.findIndex(tab => tab.dataset.designChoice === value) + 1);
    document.querySelectorAll('[data-current-direction]').forEach(node => node.textContent = labels[value]);
    const field = document.querySelector('#design-direction');
    if (field && deliberate) field.value = labels[value];
    document.querySelector('#direction-note').hidden = !field?.value;
    if (deliberate) document.querySelector('#design-announcement').textContent = labels[value] + '. ' + descriptions[value];
    if (deliberate) document.dispatchEvent(new Event('karriaro:interest-change'));
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectDesign(tab.dataset.designChoice));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectDesign(tabs[next].dataset.designChoice);
      tabs[next].focus();
    });
  });
  document.querySelector('[data-design-inquiry]').addEventListener('click', () => selectDesign(current));
  document.querySelector('#remove-direction').addEventListener('click', () => {
    document.querySelector('#design-direction').value = '';
    document.querySelector('#direction-note').hidden = true;
    document.dispatchEvent(new Event('karriaro:interest-change'));
  });
  document.querySelector('#contact-form').addEventListener('reset', () => {
    document.querySelector('#direction-note').hidden = true;
  });
  selectDesign(current, false);
  document.documentElement.classList.add('design-ready');

  // A restrained change in viewpoint follows the mouse, without affecting touch or scrolling.
  const frame = document.querySelector('.design-frame');
  let raf = 0;
  let point = null;
  const clearView = () => {
    point = null;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    frame.style.setProperty('--view-x', '0deg');
    frame.style.setProperty('--view-y', '0deg');
  };
  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || motion.matches) return;
    const box = stage.getBoundingClientRect();
    point = {x: (event.clientX - box.left) / box.width - .5, y: (event.clientY - box.top) / box.height - .5};
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      if (!point) return;
      frame.style.setProperty('--view-x', (point.y * -1.2).toFixed(2) + 'deg');
      frame.style.setProperty('--view-y', (point.x * 1.2).toFixed(2) + 'deg');
    });
  });
  stage.addEventListener('pointerleave', clearView);
  motion.addEventListener('change', clearView);
})();
