const examples = {
  'unternehmerprofil': 'Anonymisierte Projektadaption',
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
