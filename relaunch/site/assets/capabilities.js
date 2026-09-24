(() => {
  const form = document.querySelector('#contact-form');
  const field = document.querySelector('#capability-interest');
  const note = document.querySelector('#capability-interest-note');
  const label = document.querySelector('#capability-interest-label');
  if (!form || !field || !note || !label) return;
  const reset = () => { field.value = ''; note.hidden = true; label.textContent = ''; document.dispatchEvent(new Event('karriaro:interest-change')); };
  document.querySelectorAll('[data-capability]').forEach(link => {
    link.addEventListener('click', () => {
      field.value = link.dataset.capability;
      label.textContent = link.dataset.capability;
      note.hidden = false;
      document.dispatchEvent(new Event('karriaro:interest-change'));
    });
  });
  document.querySelector('#remove-capability').addEventListener('click', reset);
  form.addEventListener('reset', () => queueMicrotask(reset));
})();
