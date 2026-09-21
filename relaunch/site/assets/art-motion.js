(() => {
  'use strict';
  // Eine Geste, dreimal: Bühne, Paneele, Wortmarke. Armiert nur, wenn beobachtet werden kann (Klasse kr-motion setzt der Kopf).
  if (!document.documentElement.classList.contains('kr-motion')) return;
  const els = [...document.querySelectorAll('.kr-reveal, .kr-rise')];
  if (!els.length || !('IntersectionObserver' in window)) { document.documentElement.classList.remove('kr-motion'); return; }
  const zeige = (el) => { el.classList.add('is-in'); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { zeige(e.target); io.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
  // Sicherheitsnetz: nur aufdecken, was erreichbar war (oberhalb oder im Fenster), danach im Takt nachziehen.
  const netz = () => {
    let offen = false;
    for (const el of els) {
      if (el.classList.contains('is-in')) continue;
      if (el.getBoundingClientRect().top < innerHeight + 40) { zeige(el); io.unobserve(el); } else offen = true;
    }
    if (offen) setTimeout(netz, 1500);
  };
  setTimeout(netz, 2500);
  // Film der Live-Seite auf der Bühne: Quelle nach Breite (H.264-MP4, spielt überall), Start im Sichtfeld, Pause außerhalb.
  const film = document.querySelector('.lead-film');
  if (film && film.canPlayType) {
    const basis = film.dataset[matchMedia('(max-width:760px)').matches ? 'mobil' : 'desktop'];
    const quelle = document.createElement('source'); quelle.src = basis + '.mp4'; quelle.type = 'video/mp4'; film.appendChild(quelle);
    film.addEventListener('playing', () => film.classList.add('is-playing'), { once: true });
    let geladen = false;
    const start = () => { if (!geladen) { geladen = true; film.load(); } const p = film.play(); if (p && p.catch) p.catch(() => {}); };
    const sicht = new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) { if (film.paused) start(); } else if (!film.paused) film.pause(); } }, { threshold: 0.05 });
    sicht.observe(film);
  }
})();
