(() => {
  const add = document.querySelector('#shop-demo-add');
  if (!add) return;
  const count = document.querySelector('#shop-demo-count');
  const clear = document.querySelector('#shop-demo-clear');
  const status = document.querySelector('#shop-demo-status');
  let quantity = 0;
  const render = () => {
    count.textContent = String(quantity);
    clear.disabled = quantity === 0;
    add.disabled = quantity >= 9;
    status.textContent = quantity
      ? `${quantity} ${quantity === 1 ? 'Objekt' : 'Objekte'} im Demo-Warenkorb. Hier ist kein Kauf möglich.`
      : 'Fiktives Produkt. Hier ist kein Kauf möglich.';
  };
  document.querySelector('.shop-demo-controls').hidden = false;
  add.addEventListener('click', () => { quantity = Math.min(9, quantity + 1); render(); });
  clear.addEventListener('click', () => { quantity = 0; render(); add.focus(); });

  const form = document.querySelector('#contact-form');
  const field = document.querySelector('#capability-interest');
  const note = document.querySelector('#capability-interest-note');
  const label = document.querySelector('#capability-interest-label');
  const reset = () => { field.value = ''; note.hidden = true; label.textContent = ''; };
  document.querySelectorAll('[data-capability]').forEach(link => {
    link.addEventListener('click', () => {
      field.value = link.dataset.capability;
      label.textContent = link.dataset.capability;
      note.hidden = false;
    });
  });
  document.querySelector('#remove-capability').addEventListener('click', reset);
  form.addEventListener('reset', () => queueMicrotask(reset));
})();
