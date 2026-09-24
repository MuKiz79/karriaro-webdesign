(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const railNumber = document.querySelector('#page-rail-current');
  const isHome = location.pathname === '/' || location.pathname === '/index.html';
  const chapters = isHome ? [
    ['arbeiten', '01', 'arbeiten'],
    ['handschrift', '02', ''],
    ['leistungen', '03', 'leistungen'],
    ['manufaktur', '04', 'manufaktur'],
    ['designrichtungen', '04', 'manufaktur'],
    ['erweiterungen', '05', 'leistungen'],
    ['fragen', '06', 'leistungen'],
    ['kontakt', '07', 'kontakt']
  ].map(([id, number, nav]) => ({ element: document.getElementById(id), number, nav })) : [];
  const links = [...header.querySelectorAll('.desktop-nav a, .mobile-nav a, .header-contact')];
  let frame = 0;

  const update = () => {
    frame = 0;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const progress = maxScroll ? Math.min(100, Math.max(0, scrollY / maxScroll * 100)) : 0;
    document.documentElement.style.setProperty('--reading-progress', `${progress}%`);
    header.classList.toggle('is-scrolled', scrollY > 20);

    let current = null;
    for (const chapter of chapters) {
      if (chapter.element && chapter.element.getBoundingClientRect().top <= innerHeight * .34) current = chapter;
    }
    if (railNumber) railNumber.textContent = current?.number || '00';
    for (const link of links) {
      const destination = link.getAttribute('href')?.split('#')[1];
      if (current?.nav && destination === current.nav) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  update();
})();
