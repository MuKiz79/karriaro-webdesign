for (const group of document.querySelectorAll('[data-mv-group]')) {
  const buttons = [...group.querySelectorAll('[data-mv-select]')];
  const panels = [...group.querySelectorAll('[data-mv-panel]')];
  if (!buttons.length || !panels.length) continue;
  const select = key => {
    group.dataset.active = key;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mvSelect === key)));
    panels.forEach(panel => { panel.hidden = panel.dataset.mvPanel !== key; });
  };
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.mvSelect)));
  select(buttons[0].dataset.mvSelect);
}
