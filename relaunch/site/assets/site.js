(() => {
  'use strict';
  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  const setMenu = (open, restoreFocus = false) => {
    if (!menuButton || !mobileNav) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    mobileNav.hidden = !open;
    if (restoreFocus) menuButton.focus();
  };
  menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  mobileNav?.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    setMenu(false);
    const url = new URL(link.href, location.href);
    const target = url.pathname === location.pathname && url.hash ? document.querySelector(url.hash) : null;
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (mobileNav && !mobileNav.hidden && !event.target.closest('.site-header')) setMenu(false);
  });
  const desktop = window.matchMedia('(min-width: 761px)');
  desktop.addEventListener('change', event => { if (event.matches) setMenu(false); });

  const form = document.querySelector('#contact-form');
  if (!form) return;
  document.querySelectorAll('[data-interest]').forEach(link => {
    link.addEventListener('click', () => {
      const value = link.dataset.interest;
      const input = [...form.querySelectorAll('[name="vorhaben"]')].find(field => field.value === value);
      if (input) input.checked = true;
    });
  });
  const submitButton = form.querySelector('[type="submit"]');
  const submitLabel = form.querySelector('.submit-label');
  const status = document.querySelector('#form-status');
  let submitting = false;
  let completed = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || completed || !form.reportValidity()) return;
    if (form.querySelector('[name="_gotcha"]').value.trim()) return;
    submitting = true;
    submitButton.disabled = true;
    submitLabel.textContent = 'Wird gesendet …';
    status.textContent = '';
    status.removeAttribute('data-state');
    form.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(form.action, {
        method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error('submission_failed');
      completed = true;
      form.reset();
      submitLabel.textContent = 'Anfrage gesendet';
      status.dataset.state = 'success';
      status.textContent = 'Vielen Dank. Ihre Anfrage ist eingegangen. Ich melde mich persönlich bei Ihnen.';
      // An integrator can count confirmed submissions without exposing the form contents.
      document.dispatchEvent(new CustomEvent('karriaro:inquiry-sent'));
    } catch (error) {
      submitLabel.textContent = 'Erneut versuchen';
      status.dataset.state = 'error';
      status.textContent = error.name === 'AbortError'
        ? 'Der Versand dauert zu lange. Ihre Eingaben bleiben erhalten. Bitte versuchen Sie es später erneut oder schreiben Sie an kontakt@karriaro.de.'
        : 'Die Anfrage konnte nicht gesendet werden. Ihre Eingaben bleiben erhalten. Bitte versuchen Sie es erneut oder schreiben Sie an kontakt@karriaro.de.';
    } finally {
      window.clearTimeout(timeout);
      submitting = false;
      submitButton.disabled = completed;
      form.removeAttribute('aria-busy');
      status.focus({ preventScroll: true });
    }
  });
})();
