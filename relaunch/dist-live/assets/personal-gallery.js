(() => {
  const group = document.querySelector('.pl-filter');
  if (!group) return;
  const buttons = [...group.querySelectorAll('[data-level-filter]')];
  const profiles = [...document.querySelectorAll('.pl-persona[data-level]')];
  buttons.forEach(button => button.addEventListener('click', () => {
    const level = button.dataset.levelFilter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    profiles.forEach(profile => { profile.hidden = level !== 'all' && profile.dataset.level !== level; });
  }));
})();
