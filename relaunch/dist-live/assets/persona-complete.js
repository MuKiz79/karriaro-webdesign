/* Local-only interactions on fictional personal-site demonstrations. */
const booking = document.querySelector('[data-booking]');
if (booking) {
  let selected = '';
  const label = document.getElementById('ny-slot-label');
  const hint = document.getElementById('ny-slot-hint');
  const confirm = document.getElementById('ny-booking-confirm');
  const status = document.getElementById('ny-booking-state');
  booking.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.slot;
    booking.querySelectorAll('[data-slot]').forEach(slot => slot.setAttribute('aria-pressed', String(slot === button)));
    label.textContent = selected;
    hint.textContent = '30 Minuten · Campusberatung · fiktiver Termin';
    status.textContent = '';
    confirm.disabled = false;
  }));
  confirm.addEventListener('click', () => {
    status.textContent = `${selected} ist in dieser Demo ausgewählt. Es wurde nichts gebucht.`;
  });
}

document.querySelectorAll('.pc-demo-form').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  form.querySelector('.pc-demo-status').textContent = 'So würde Ihre Anfrage vorbereitet. Dies ist ein fiktives Profil; es wurde nichts versendet.';
}));
