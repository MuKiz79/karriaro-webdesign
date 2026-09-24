document.querySelectorAll('[data-tabs]').forEach(group => {
  const tabs = [...group.querySelectorAll('[role="tab"]')];
  const activate = next => {
    tabs.forEach(tab => {
      const active = tab === next;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    next.focus();
  };
  tabs.forEach((tab, index) => {
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[nextIndex]);
    });
  });
});

const details = {
  architecture: ['KNOTEN / 01', 'Architektur ist eine Entscheidung über Veränderung.', 'Klare Grenzen und verständliche Schnittstellen helfen Teams, neue Anforderungen einzuordnen, ohne jedes Mal das ganze System anzufassen.'],
  operation: ['KNOTEN / 02', 'Ein System beweist sich im Betrieb.', 'Signale, Fehlerwege und Verantwortungen müssen sichtbar sein. Ich entwerfe nicht nur für den Launch, sondern für den Montag danach.'],
  team: ['KNOTEN / 03', 'Wissen darf nicht an einer Person hängen.', 'Eine gute technische Entscheidung lässt sich erklären, prüfen und weitergeben. So bleibt das Team handlungsfähig, wenn sich Menschen und Aufgaben ändern.']
};
document.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-node]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  const [index, title, copy] = details[button.dataset.node];
  document.getElementById('td-detail-index').textContent = index;
  document.getElementById('td-detail-title').textContent = title;
  document.getElementById('td-detail-copy').textContent = copy;
}));
