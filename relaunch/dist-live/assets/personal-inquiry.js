(() => {
  'use strict';
  const examples = {
    'muammer-original': 'Muammer Kizilaslan · veröffentlichte persönliche Website',
    'unternehmerprofil': 'Anonymisierte Projektadaption',
    'muammer-fuehrung': 'Designrichtung Führung', 'muammer-technologie': 'Designrichtung Technologie',
    'muammer-gruendung': 'Designrichtung Beruf & Gründung', 'aylin-berger': 'Aylin Berger · Studium',
    'noah-yilmaz': 'Noah Yilmaz · Berufseinstieg', 'felix-brandt': 'Felix Brandt · Berufswechsel', 'mina-aydin': 'Mina Aydin · Selbstständigkeit'
  };
  const input = document.getElementById('pl-example-input');
  const note = document.getElementById('pl-selected-example');
  const box = document.getElementById('pg-selected-example');
  const remove = document.getElementById('pg-remove-example');
  function clearExample() {
    if (!input || !note || !box) return;
    input.value = ''; note.textContent = ''; box.hidden = true;
  }
  function chooseExample(key) {
    if (!input || !note || !box || !Object.hasOwn(examples,key)) return;
    input.value = examples[key];
    note.textContent = 'Ihr Gesprächsanlass: ' + examples[key] + '. Ihre Website wird individuell für Sie gestaltet.';
    box.hidden = false;
  }
  chooseExample(new URLSearchParams(location.search).get('beispiel'));
  document.querySelectorAll('[data-example]').forEach(link => link.addEventListener('click', () => chooseExample(link.dataset.example)));
  remove?.addEventListener('click', () => { clearExample(); document.getElementById('pl-name')?.focus(); });
  const form = document.getElementById('contact-form');
  form?.addEventListener('reset', clearExample);
  form?.addEventListener('submit', () => {
    form.querySelectorAll('input[required],textarea[required]').forEach(field => field.setCustomValidity(field.value.trim() ? '' : 'Bitte füllen Sie dieses Feld aus.'));
  });
  form?.addEventListener('input', event => { if(event.target.setCustomValidity) event.target.setCustomValidity(''); });

  const video = document.getElementById('pg-preview-video');
  const toggle = document.getElementById('pg-preview-toggle');
  const state = document.getElementById('pg-preview-state');
  if (!video || !toggle || !state) return;
  const screen = video.closest('.pg-film-screen');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width:700px)');
  let visible = false, userPaused = false, explicitPlay = false, failed = false, source = '';
  function setLabel() {
    toggle.textContent = video.paused ? 'Vorschau abspielen' : 'Vorschau pausieren';
    toggle.setAttribute('aria-pressed', String(!video.paused));
    state.textContent = failed ? 'VORSCHAU NICHT VERFÜGBAR · ORIGINAL ÖFFNEN' : video.paused ? 'ORIGINAL-WEBSITE / STANDANSICHT' : 'ORIGINAL-WEBSITE / FILM & ANSICHTEN';
    screen.classList.toggle('is-playing', !video.paused);
  }
  function ensureSource() {
    const wanted = mobile.matches ? video.dataset.mobile : video.dataset.desktop;
    if (wanted === source) return;
    source = wanted; failed = false;
    screen.classList.remove('has-frame');
    video.src = wanted;
    video.load();
  }
  function sync() {
    if (!visible || document.hidden || userPaused || (reduced.matches && !explicitPlay) || failed) { video.pause(); setLabel(); return; }
    ensureSource();
    video.play().catch(() => { userPaused = true; setLabel(); });
  }
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    if (!video.paused) { userPaused = true; explicitPlay = false; video.pause(); }
    else { visible = true; userPaused = false; explicitPlay = true; failed = false; sync(); }
    setLabel();
  });
  video.addEventListener('playing', () => { screen.classList.add('has-frame'); setLabel(); });
  video.addEventListener('pause', setLabel);
  video.addEventListener('error', () => { failed = true; video.pause(); screen.classList.remove('has-frame','is-playing'); setLabel(); });
  reduced.addEventListener('change', () => { explicitPlay = false; sync(); });
  mobile.addEventListener('change', () => {
    video.pause(); source = ''; screen.classList.remove('has-frame','is-playing'); video.removeAttribute('src'); video.load(); sync();
  });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); },{threshold:.12});
    observer.observe(video);
  } else { visible = true; sync(); }
  setLabel();
})();
