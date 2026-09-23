(() => {
  const setGroup = (buttons, active) => buttons.forEach(button => button.setAttribute('aria-pressed', String(button === active)));

  const kanteChoices = {
    fenster: 'Fenster: Welche Räume brauchen mehr Licht, Ruhe oder einen besseren Übergang nach draußen? Ein Aufmaß und die Nutzung der Räume bilden den Anfang.',
    fassade: 'Fassade: Was soll erhalten bleiben, was darf sich verändern? Material, Bestand und die Wirkung des Hauses gehören gemeinsam auf den Tisch.',
    innenraum: 'Innenraum: Welche Abläufe passen noch nicht? Wir beginnen mit Ihrem Alltag und betrachten Oberflächen, Licht und Einbauten als Ganzes.'
  };
  const kanteButtons = [...document.querySelectorAll('[data-kante-choice]')];
  kanteButtons.forEach(button => button.addEventListener('click', () => {
    setGroup(kanteButtons, button);
    document.querySelector('#kante-result p').textContent = kanteChoices[button.dataset.kanteChoice];
  }));

  const stays = {
    ruhe: ['Der stille Morgen.', 'Ein langsamer Start, ein Buch am Fenster und Raum für Ihren eigenen Rhythmus.'],
    wege: ['Der Weg vor der Tür.', 'Morgens direkt vom Haus losgehen und abends mit neuen Eindrücken zurückkehren.'],
    zeit: ['Zeit für zwei.', 'Ein gemeinsames Frühstück, ein weiter Blick und ein Abend ohne nächsten Termin.']
  };
  const stayButtons = [...document.querySelectorAll('[data-wald-choice]')];
  stayButtons.forEach(button => button.addEventListener('click', () => {
    setGroup(stayButtons, button);
    const [title, copy] = stays[button.dataset.waldChoice];
    document.querySelector('#wald-result h3').textContent = title;
    document.querySelector('#wald-result p').textContent = copy;
  }));

  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const products = [...document.querySelectorAll('#product-grid article')];
  filterButtons.forEach(button => button.addEventListener('click', () => {
    setGroup(filterButtons, button);
    const filter = button.dataset.filter;
    products.forEach(product => { product.hidden = filter !== 'alle' && !product.dataset.tags.split(' ').includes(filter); });
  }));

  const cart = document.querySelector('#demo-cart');
  if (cart) {
    const entries = [];
    const render = () => {
      document.querySelector('#cart-count').textContent = String(entries.length);
      document.querySelector('#cart-total').textContent = `${entries.reduce((sum, item) => sum + item.price, 0)} €`;
      const target = document.querySelector('#cart-items');
      target.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Hier ist noch Platz für etwas Gutes.';
        target.append(empty);
        return;
      }
      entries.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'cart-row';
        const name = document.createElement('span'); name.textContent = `${item.name} · ${item.price} €`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Entfernen';
        remove.setAttribute('aria-label', `${item.name} aus dem Demo-Warenkorb entfernen`);
        remove.addEventListener('click', () => { entries.splice(index, 1); render(); });
        row.append(name, remove); target.append(row);
      });
    };
    document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
      entries.push({name:button.dataset.add, price:Number(button.dataset.price)});
      render(); cart.showModal();
    }));
    document.querySelector('.cart-trigger').addEventListener('click', () => cart.showModal());
    document.querySelector('.cart-close').addEventListener('click', () => cart.close());
    cart.addEventListener('click', event => { if (event.target === cart) cart.close(); });
  }
})();
