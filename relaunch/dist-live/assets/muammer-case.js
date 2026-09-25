const caseButtons = [...document.querySelectorAll('[data-mk-topic]')];
const casePanels = [...document.querySelectorAll('[data-mk-panel]')];
if (caseButtons.length === 3 && casePanels.length === 3) {
  const selectTopic = key => {
    caseButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mkTopic === key)));
    casePanels.forEach(panel => { panel.hidden = panel.dataset.mkPanel !== key; });
    document.querySelector('.mk-proof-stage').dataset.mkActive = key;
  };
  caseButtons.forEach(button => button.addEventListener('click', () => selectTopic(button.dataset.mkTopic)));
  selectTopic('ki');
  document.querySelector('.mk-proof-selector').classList.add('is-ready');
}
