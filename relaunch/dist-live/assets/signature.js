(() => {
  const bridge = document.querySelector('.signature-bridge');
  if (!bridge || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('signature-ready');
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    bridge.classList.add('is-active');
    observer.disconnect();
  }, { threshold: 0.18 });
  observer.observe(bridge);
})();
