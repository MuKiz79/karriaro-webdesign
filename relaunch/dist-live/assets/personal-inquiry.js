const examples = {
  'unternehmerprofil': 'Anonymisierte Projektadaption',
  'muammer-fuehrung': 'Designrichtung Führung',
  'muammer-technologie': 'Designrichtung Technologie',
  'muammer-gruendung': 'Designrichtung Beruf & Gründung',
  'aylin-berger': 'Aylin Berger · Studium',
  'noah-yilmaz': 'Noah Yilmaz · Berufseinstieg',
  'felix-brandt': 'Felix Brandt · Berufswechsel',
  'mina-aydin': 'Mina Aydin · Selbstständigkeit'
};
const exampleInput = document.getElementById('pl-example-input');
const selectedExample = document.getElementById('pl-selected-example');
function chooseExample(key) {
  if (!exampleInput || !selectedExample || !Object.hasOwn(examples, key)) return;
  exampleInput.value = examples[key];
  selectedExample.textContent = 'Ihr Ausgangspunkt: ' + examples[key] + '. Ihre Website wird individuell gestaltet.';
  selectedExample.hidden = false;
}
const fromUrl = new URLSearchParams(location.search).get('beispiel');
if (fromUrl) chooseExample(fromUrl);
document.querySelectorAll('[data-example]').forEach(link => link.addEventListener('click', () => chooseExample(link.dataset.example)));

const editionButtons = [...document.querySelectorAll('.pl-editions-switch [data-edition]')];
const editionPanels = [...document.querySelectorAll('.pl-editions-work [data-edition-panel]')];
if (editionButtons.length && editionButtons.length === editionPanels.length) {
  const showEdition = key => {
    for (const button of editionButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.edition === key));
    }
    for (const panel of editionPanels) {
      panel.hidden = panel.dataset.editionPanel !== key;
    }
  };
  editionButtons.forEach(button => button.addEventListener('click', () => showEdition(button.dataset.edition)));
  showEdition(editionButtons[0].dataset.edition);
  document.querySelector('.pl-editions-switch').classList.add('is-ready');
}

const previewVideo = document.querySelector('[data-personal-preview]');
const previewToggle = document.querySelector('.pl-preview-toggle');
if (previewVideo && previewToggle) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const updatePreviewToggle = () => {
    const paused = previewVideo.paused;
    previewToggle.textContent = paused ? 'Abspielen' : 'Pause';
    previewToggle.setAttribute('aria-label', paused ? 'Vorschau abspielen' : 'Vorschau pausieren');
    previewToggle.setAttribute('aria-pressed', String(!paused));
  };
  const startPreview = () => {
    if (reducedMotion.matches) return;
    previewVideo.play().catch(() => updatePreviewToggle());
  };
  previewToggle.addEventListener('click', () => {
    if (previewVideo.paused) previewVideo.play().catch(() => updatePreviewToggle());
    else previewVideo.pause();
  });
  previewVideo.addEventListener('play', updatePreviewToggle);
  previewVideo.addEventListener('pause', updatePreviewToggle);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) previewVideo.pause();
    else startPreview();
  });
  updatePreviewToggle();
  startPreview();
}
