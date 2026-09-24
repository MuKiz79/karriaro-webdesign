(() => {
  'use strict';
  const dialog = document.querySelector('#work-preview');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const names = { kante:'KANTE · Handwerk', waldruehe:'WALDRUHE · Unterkunft', tischundton:'TISCH & TON · Lokaler Handel', shop:'FORM · Onlineshop', architektur:'David Kern · Architektur', schmuck:'Sofia Brandt · Schmuckdesign', fotografie:'Elena Voss · Fotografie', interior:'Mila Hartmann · Interior Design', immobilien:'Clara Winter · Immobilien', kulinarik:'Matteo Rossi · Kulinarik', software:'Leon Weber · Software', training:'Nora Seidel · Bewegung', beratung:'Jonas Bergmann · Beratung', klang:'Ada Lind · Klanggestaltung', raum:'RAUM · Zahnarztpraxis', halo:'HALO · Haaratelier', vecto:'VECTO · Technischer Zulieferer' };
  const frame = dialog.querySelector('iframe');
  const title = dialog.querySelector('#preview-title');
  const openLink = dialog.querySelector('#preview-open');
  const viewButtons = [...dialog.querySelectorAll('[data-preview-view]')];
  const status = dialog.querySelector('#preview-loading');
  let originLink;
  let oldOverflow = '';
  let loadTimer;
  const resetView = (view = 'desktop') => {
    dialog.dataset.view = view;
    viewButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.previewView === view)));
  };
  const updateTitle = path => {
    const page = new URL(path, location.href);
    const slug = page.pathname.split('/').pop().replace(/\.html$/,'');
    title.textContent = names[slug] || 'Karriaro · Website-Konzept';
    frame.title = title.textContent + ' — bedienbare Website';
    openLink.href = page.pathname + page.search + page.hash;
    const inquiry=dialog.querySelector('#preview-inquiry');
    inquiry.dataset.project=names[slug]?slug:'';
    inquiry.href='/?beispiel='+slug+'#kontakt';
  };
  const closePreview = () => dialog.close();
  dialog.querySelector('#preview-close').addEventListener('click',closePreview);
  dialog.addEventListener('click',event => { if(event.target === dialog) closePreview(); });
  dialog.addEventListener('close', () => {
    clearTimeout(loadTimer);
    document.body.style.overflow = oldOverflow;
    frame.src = 'about:blank';
    if(originLink?.isConnected) originLink.focus({preventScroll:true});
  });
  viewButtons.forEach(button => button.addEventListener('click', () => {
    dialog.dataset.view = button.dataset.previewView;
    viewButtons.forEach(item => item.setAttribute('aria-pressed',String(item === button)));
  }));
  frame.addEventListener('load', () => {
    if(!dialog.open) return;
    clearTimeout(loadTimer);
    status.hidden = true;
    try {
      const path = frame.contentWindow.location.pathname + frame.contentWindow.location.search + frame.contentWindow.location.hash;
      if(path.startsWith('/studien/')) updateTitle(path);
      const child = frame.contentDocument;
      child.querySelectorAll('[data-karriaro-inquiry]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();dialog.querySelector('#preview-inquiry').click();}));
      // The parent dialog provides the back route; it remains visible above the frame.
      child.querySelector('.karriaro-return')?.setAttribute('hidden','');
      child.addEventListener('keydown', event => {
        if(event.key === 'Escape' && !child.querySelector('dialog[open]')) {
          event.preventDefault();
          closePreview();
        }
      });
    } catch (_) {
      status.hidden = false;
      status.textContent = 'Diese Ansicht lässt sich separat öffnen.';
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if(!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.closest('dialog')) return;
    const url = new URL(link.href,location.href);
    if(url.origin !== location.origin || !/^\/studien\/(?:kante|waldruehe|tischundton|raum|halo|vecto|shop|architektur|schmuck|fotografie|interior|immobilien|kulinarik|software|training|beratung|klang)(?:\.html)?$/.test(url.pathname)) return;
    event.preventDefault();
    originLink = link;
    oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    resetView(link.dataset.previewInitial === 'mobile' ? 'mobile' : 'desktop');
    updateTitle(url.pathname + url.search + url.hash);
    status.textContent = 'Die Website wird geöffnet …';
    status.hidden = false;
    frame.src = url.pathname + url.search + url.hash;
    dialog.showModal();
    dialog.querySelector('#preview-close').focus({preventScroll:true});
    loadTimer = setTimeout(() => {
      if(!status.hidden) status.textContent = 'Das Laden dauert länger. Sie können die Website auch separat öffnen.';
    },12000);
  });
})();
