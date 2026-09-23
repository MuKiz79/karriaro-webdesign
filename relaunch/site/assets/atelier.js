(() => {
  const peek = document.getElementById('atelierblick-kante');
  if (!peek) return;
  const revealLinkedPeek = () => {
    if (location.hash === '#atelierblick-kante') peek.open = true;
  };
  revealLinkedPeek();
  addEventListener('hashchange', revealLinkedPeek);
})();
