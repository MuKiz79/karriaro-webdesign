(() => {
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
