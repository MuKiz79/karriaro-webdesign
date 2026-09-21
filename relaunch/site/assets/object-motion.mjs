const cards = [...document.querySelectorAll('[data-object]')];
if (cards.length && 'IntersectionObserver' in window) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let modulePromise;
  const controllers = [];
  const loadModels = () => modulePromise ||= import('../studien/three-studies.mjs?v=92fb7f81fb25');

  for (const card of cards) {
    const canvas = card.querySelector('canvas');
    const fallback = card.querySelector('.object-fallback');
    const button = card.querySelector('.object-toggle');
    const label = button.querySelector('[data-motion-label]');
    const icon = button.querySelector('.object-toggle-icon');
    const house = card.dataset.object === 'house';
    const startLabel = house ? 'Schnitt bewegen' : 'Licht bewegen';
    let model, loading = false, visible = false, userPreference = null;
    let running = false, raf = 0, elapsed = 0, last = 0;
    // A complete outward-and-return movement, never a jump at the loop boundary.
    const draw = () => {
      const progress = (1 - Math.cos(elapsed / 8000 * Math.PI * 2)) / 2;
      const value = house ? 95 - progress * 55 : 18 + progress * 68;
      model?.update(value, house ? 'space' : 0, 0);
    };
    const blocked = () => document.hidden || !!document.querySelector('dialog[open]') || canvas.hidden;
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', startLabel);
      label.textContent = startLabel;
      icon.textContent = '↻';
    }
    function tick(now) {
      if (!running || !visible || blocked()) { stop(); return; }
      if (!last) last = now;
      const delta = now - last;
      // Cap drawing to 30 fps and avoid catching up after a backgrounded tab.
      if (delta >= 1000 / 30) {
        elapsed += Math.min(delta, 100);
        last = now;
        draw();
      }
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (!model || running || !visible || blocked()) return;
      running = true;
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', house ? 'Schnittbewegung anhalten' : 'Lichtbewegung anhalten');
      label.textContent = 'Anhalten';
      icon.textContent = 'Ⅱ';
      raf = requestAnimationFrame(tick);
    }
    function syncPlayback() {
      const wanted = userPreference ?? !reduced.matches;
      if (wanted && visible && !blocked()) start();
      else stop();
    }
    const observer = new IntersectionObserver(async entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .2;
      if (!visible) { stop(); return; }
      if (!model && !loading) {
        loading = true;
        try {
          const models = await loadModels();
          model = (house ? models.mountHouse : models.mountJewel)(canvas, fallback);
          draw();
          button.hidden = false;
          card.dataset.objectReady = 'true';
        } catch {
          canvas.hidden = true;
          fallback.hidden = false;
          button.hidden = true;
          card.dataset.objectReady = 'fallback';
          observer.disconnect();
          return;
        }
      }
      syncPlayback();
    }, { threshold: [0, .2] });
    observer.observe(card);
    button.addEventListener('click', () => {
      userPreference = !running;
      syncPlayback();
    });
    canvas.addEventListener('webglcontextlost', () => { stop(); button.hidden = true; });
    reduced.addEventListener('change', () => { userPreference = null; syncPlayback(); });
    controllers.push({ stop, syncPlayback });
  }
  const stopAll = () => controllers.forEach(controller => controller.stop());
  const syncAll = () => controllers.forEach(controller => controller.syncPlayback());
  document.addEventListener('visibilitychange', syncAll);
  window.addEventListener('pageshow', syncAll);
  window.addEventListener('pagehide', stopAll);
  // Reference dialogs pause home-page models even though the cards stay in view.
  for (const dialog of document.querySelectorAll('dialog')) {
    new MutationObserver(syncAll).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
}
