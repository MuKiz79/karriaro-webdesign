(() => {
  const setGroup = (buttons, active) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button === active)));
  };

  // KANTE: three considered decisions form one readable project brief.
  const kanteCopy = {
    fenster: 'Fenster und Übergänge für Räume, die mehr können sollen.',
    fassade: 'Eine Fassade, die Bestand und neue Nutzung zusammenführt.',
    innenraum: 'Innenräume, deren Details den Alltag wirklich verbessern.'
  };
  const kanteMaterial = { bronze: 'Bronze', holz: 'Holz', stahl: 'Stahl' };
  const kanteGoal = { licht: 'Mehr Licht', ruhe: 'Mehr Ruhe', bestand: 'Den Bestand achten' };
  const kanteGroups = {
    choice: [...document.querySelectorAll('[data-kante-choice]')],
    material: [...document.querySelectorAll('[data-kante-material]')],
    goal: [...document.querySelectorAll('[data-kante-goal]')]
  };
  if (kanteGroups.choice.length) {
    const selected = { choice: null, material: 'bronze', goal: 'licht' };
    const render = () => {
      const result = document.querySelector('#kante-result');
      result.querySelector('p').textContent = selected.choice
        ? kanteCopy[selected.choice] + ' ' + kanteMaterial[selected.material] + ' setzt den Ton; das Ziel „' + kanteGoal[selected.goal] + '“ gibt die Richtung vor.'
        : 'Wählen Sie zuerst einen Bereich. Material und Ziel können Sie bereits verändern.';
      result.querySelector('small').textContent = kanteMaterial[selected.material] + ' · ' + kanteGoal[selected.goal];
      const cutaway = document.querySelector('#kante-cutaway');
      cutaway.dataset.material = selected.material;
      cutaway.dataset.goal = selected.goal;
      cutaway.dataset.choice = selected.choice || 'fenster';
    };
    document.querySelectorAll('[data-kante-pick]').forEach(link => link.addEventListener('click', () => {
      document.querySelector('[data-kante-choice="' + link.dataset.kantePick + '"]').click();
    }));
    Object.entries(kanteGroups).forEach(([key, buttons]) => {
      buttons.forEach(button => button.addEventListener('click', () => {
        selected[key] = button.dataset['kante' + key[0].toUpperCase() + key.slice(1)];
        setGroup(buttons, button);
        render();
      }));
    });
  }

  // WALDRUHE: a local trip idea, deliberately without inventory or booking.
  const stays = {
    ruhe: ['Der stille Morgen.', 'Ein langsamer Start, ein Buch am Fenster und Raum für Ihren eigenen Rhythmus.'],
    wege: ['Der Weg vor der Tür.', 'Morgens direkt vom Haus losgehen und abends mit neuen Eindrücken zurückkehren.'],
    zeit: ['Zeit für zwei.', 'Ein gemeinsames Frühstück, ein weiter Blick und ein Abend ohne nächsten Termin.']
  };
  const stayButtons = [...document.querySelectorAll('[data-wald-choice]')];
  if (stayButtons.length) {
    const arrival = document.querySelector('#stay-arrival');
    const departure = document.querySelector('#stay-departure');
    const guests = document.querySelector('#stay-guests');
    let mood = 'ruhe';
    const today = new Date();
    const localToday = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    arrival.min = localToday;
    departure.min = localToday;
    const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
    const render = () => {
      const [title, copy] = stays[mood];
      const result = document.querySelector('#wald-result');
      result.querySelector('h3').textContent = title;
      result.querySelector('p').textContent = copy;
      const personCount = Number(guests.value);
      let text = 'Wählen Sie An- und Abreise für eine vollständige Skizze.';
      if (arrival.value && !departure.value) text = 'Ergänzen Sie noch Ihre Abreise.';
      if (!arrival.value && departure.value) text = 'Ergänzen Sie noch Ihre Anreise.';
      if (arrival.value && departure.value) {
        const nights = Math.round((Date.parse(departure.value + 'T00:00:00Z') - Date.parse(arrival.value + 'T00:00:00Z')) / 86400000);
        text = nights > 0
          ? dateLabel(arrival.value) + ' – ' + dateLabel(departure.value) + ' · ' + nights + (nights === 1 ? ' Nacht' : ' Nächte')
          : 'Die Abreise muss nach der Anreise liegen.';
      }
      result.querySelector('.stay-summary').textContent = text + ' · ' + personCount + (personCount === 1 ? ' Person' : ' Personen');
    };
    stayButtons.forEach(button => button.addEventListener('click', () => {
      mood = button.dataset.waldChoice;
      setGroup(stayButtons, button);
      render();
    }));
    arrival.addEventListener('change', () => {
      departure.min = arrival.value || localToday;
      if (departure.value && departure.value <= arrival.value) departure.value = '';
      render();
    });
    departure.addEventListener('change', render);
    guests.addEventListener('change', render);
  }

  const times = {
    morgen: { time: '07:30', kicker: 'DER ERSTE BLICK', title: 'Der Morgen gehört Ihnen.', copy: 'Nebel zwischen den Bäumen. Ein Kaffee am Fenster. Kein Termin, der den Tag vorgibt.', mood: 'ruhe' },
    mittag: { time: '14:00', kicker: 'EIN WEG HINAUS', title: 'Draußen wird der Kopf frei.', copy: 'Die Tür fällt zu, der Wald beginnt. Wie weit der Weg führt, entscheiden nur Sie.', mood: 'wege' },
    abend: { time: '20:15', kicker: 'WIEDER HIER', title: 'Das Licht wartet schon.', copy: 'Ein warmes Fenster im Dunkel. Der Tag darf enden, ohne dass etwas fehlen muss.', mood: 'zeit' }
  };
  const timeButtons = [...document.querySelectorAll('button[data-wald-time]')];
  if (timeButtons.length) {
    let activeTime = 'morgen';
    timeButtons.forEach(button => button.addEventListener('click', () => {
      activeTime = button.dataset.waldTime;
      setGroup(timeButtons, button);
      const scene = times[activeTime];
      document.querySelector('#wald-time-interaction').dataset.waldTime = activeTime;
      document.querySelector('#wald-time-display').textContent = scene.time;
      document.querySelector('#wald-time-kicker').textContent = scene.kicker;
      document.querySelector('#wald-time-title').textContent = scene.title;
      document.querySelector('#wald-time-copy').textContent = scene.copy;
    }));
    document.querySelector('#wald-time-plan').addEventListener('click', () => {
      document.querySelector('[data-wald-choice="' + times[activeTime].mood + '"]').click();
    });
  }

  // TISCH & TON: a complete, local-only shop demonstration.
  const catalog = {
    oil: { name: 'Goldener Anfang', category: 'Olivenöl · 500 ml', description: 'Ein vollmundiges Öl für Brot, Gemüse und alles, was nur wenig braucht, um gut zu sein.', cents: 1800, image: 'a', panel: 'one' },
    bread: { name: 'Der große Laib', category: 'Sauerteigbrot · ein Stück', description: 'Kräftige Kruste, weiche Mitte. Am besten geteilt, solange der Tisch noch voll ist.', cents: 800, image: 'a', panel: 'two' },
    pear: { name: 'Birne & Balsam', category: 'Fruchtaufstrich · 220 g', description: 'Fruchtig und leise herb. Für Käse, Brot und einen unerwartet guten Abschluss.', cents: 1200, image: 'a', panel: 'three' },
    coffee: { name: 'Morgengold', category: 'Kaffeebohnen · 250 g', description: 'Ein dunkler, runder Kaffee für den ersten ruhigen Moment des Tages.', cents: 1400, image: 'b', panel: 'one' },
    bowl: { name: 'Die kleine Schale', category: 'Keramik · handgeformt', description: 'Ein bewusst schlichtes Stück für Oliven, Nüsse und die Dinge dazwischen.', cents: 2900, image: 'b', panel: 'two' },
    chocolate: { name: 'Später Abend', category: 'Dunkle Schokolade · 80 g', description: 'Ein kleines Stück nach dem Essen. Mehr braucht ein langer Abend manchmal nicht.', cents: 700, image: 'b', panel: 'three' }
  };
  const cart = document.querySelector('#demo-cart');
  if (!cart) return;
  const money = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const order = new Map();
  const detail = document.querySelector('#product-detail');
  const checkout = document.querySelector('#demo-checkout');
  let detailId = 'oil';
  const count = () => [...order.values()].reduce((sum, quantity) => sum + quantity, 0);
  const subtotal = () => [...order].reduce((sum, [id, quantity]) => sum + catalog[id].cents * quantity, 0);
  const selectedDelivery = () => document.querySelector('input[name="delivery"]:checked').value;
  const deliveryCost = () => selectedDelivery() === 'shipping' && subtotal() < 5000 ? 590 : 0;
  const updateCheckout = () => { document.querySelector('#checkout-total').textContent = money(subtotal() + deliveryCost()); };
  const makeButton = (label, action, id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', action + ' ' + catalog[id].name);
    button.dataset.cartAction = action;
    button.dataset.id = id;
    return button;
  };
  const renderCart = () => {
    document.querySelector('#cart-count').textContent = String(count());
    document.querySelector('#cart-total').textContent = money(subtotal());
    document.querySelector('#open-checkout').disabled = !count();
    const target = document.querySelector('#cart-items');
    target.replaceChildren();
    if (!count()) {
      const empty = document.createElement('p');
      empty.textContent = 'Hier ist noch Platz für etwas Gutes.';
      target.append(empty);
    }
    for (const [id, quantity] of order) {
      const row = document.createElement('div');
      row.className = 'cart-row';
      const name = document.createElement('div');
      name.innerHTML = '<strong></strong><span></span>';
      name.querySelector('strong').textContent = catalog[id].name;
      name.querySelector('span').textContent = money(catalog[id].cents) + ' / Stück';
      const controls = document.createElement('div');
      controls.className = 'cart-quantity';
      controls.append(makeButton('−', 'Weniger', id));
      const amount = document.createElement('span');
      amount.textContent = String(quantity);
      controls.append(amount, makeButton('+', 'Mehr', id));
      const remove = makeButton('Entfernen', 'Entfernen', id);
      remove.className = 'remove-item';
      row.append(name, controls, remove);
      target.append(row);
    }
    updateCheckout();
  };
  const add = id => {
    order.set(id, Math.min((order.get(id) || 0) + 1, 20));
    renderCart();
    if (detail.open) detail.close();
    if (!cart.open) cart.showModal();
  };
  const tableScenes = {
    abend: { kicker: 'FÜR HEUTE ABEND', title: 'Ein Abend, der bleiben darf.', copy: 'Brot brechen, Öl teilen, noch ein bisschen sitzen bleiben.', ids: ['bread', 'oil', 'bowl'], number: '01 — 03' },
    morgen: { kicker: 'FÜR MORGEN FRÜH', title: 'Der Morgen hat Zeit.', copy: 'Kaffee aufsetzen, die Schale füllen, langsam anfangen.', ids: ['coffee', 'pear', 'bowl'], number: '02 — 03' },
    geschenk: { kicker: 'ZUM MITBRINGEN', title: 'Ein guter Grund, vorbeizukommen.', copy: 'Drei kleine Dinge, die einen Abend besonders machen.', ids: ['pear', 'chocolate', 'oil'], number: '03 — 03' }
  };
  const table = document.querySelector('#tischprobe');
  let tableScene = 'abend';
  const tableButtons = [...document.querySelectorAll('[data-table-choice]')];
  const renderTable = () => {
    const scene = tableScenes[tableScene];
    table.dataset.tableScene = tableScene;
    document.querySelector('#table-scene-kicker').textContent = scene.kicker;
    document.querySelector('#table-scene-title').textContent = scene.title;
    document.querySelector('#table-scene-copy').textContent = scene.copy;
    document.querySelector('#table-scene-number').textContent = scene.number;
    const list = document.querySelector('#table-products');
    list.replaceChildren();
    scene.ids.forEach(id => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const price = document.createElement('strong');
      name.textContent = catalog[id].name;
      price.textContent = money(catalog[id].cents);
      item.append(name, price);
      list.append(item);
    });
    document.querySelector('#table-total').textContent = money(scene.ids.reduce((sum, id) => sum + catalog[id].cents, 0));
  };
  tableButtons.forEach(button => button.addEventListener('click', () => {
    tableScene = button.dataset.tableChoice;
    setGroup(tableButtons, button);
    renderTable();
  }));
  document.querySelector('#table-add').addEventListener('click', () => {
    tableScenes[tableScene].ids.forEach(id => order.set(id, Math.min((order.get(id) || 0) + 1, 20)));
    renderCart();
    if (!cart.open) cart.showModal();
  });
  const showDetail = id => {
    detailId = id;
    const product = catalog[id];
    document.querySelector('#detail-title').textContent = product.name;
    document.querySelector('#detail-category').textContent = product.category;
    document.querySelector('#detail-description').textContent = product.description;
    document.querySelector('#detail-price').textContent = money(product.cents);
    const photo = document.querySelector('#detail-photo');
    photo.className = 'detail-photo shot-' + product.image + ' shot-' + product.panel;
    document.querySelector('#detail-image').src = '/studien/assets/tischundton-products-' + product.image + '-v2.webp';
    detail.showModal();
  };
  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('#product-grid article')];
  const search = document.querySelector('#product-search');
  let filter = 'alle';
  const renderProducts = () => {
    const query = search.value.trim().toLocaleLowerCase('de-DE');
    let visible = 0;
    cards.forEach(card => {
      const product = catalog[card.dataset.id];
      const categoryMatch = filter === 'alle' || card.dataset.tags.split(' ').includes(filter);
      const searchMatch = !query || (product.name + ' ' + product.category).toLocaleLowerCase('de-DE').includes(query);
      card.hidden = !(categoryMatch && searchMatch);
      if (!card.hidden) visible += 1;
    });
    document.querySelector('#product-count').textContent = visible + (visible === 1 ? ' Produkt' : ' Produkte') + ' · fiktives Sortiment';
  };
  filters.forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    setGroup(filters, button);
    renderProducts();
  }));
  search.addEventListener('input', renderProducts);
  document.querySelector('#gift-filter').addEventListener('click', () => {
    document.querySelector('[data-filter="geschenk"]').click();
    document.querySelector('#auswahl').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.detail)));
  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => add(button.dataset.add)));
  document.querySelector('#detail-add').addEventListener('click', () => add(detailId));
  document.querySelector('[data-close="detail"]').addEventListener('click', () => detail.close());
  document.querySelector('.cart-trigger').addEventListener('click', () => cart.showModal());
  document.querySelector('.cart-close').addEventListener('click', () => cart.close());
  document.querySelector('#cart-items').addEventListener('click', event => {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;
    const id = button.dataset.id;
    const current = order.get(id) || 0;
    if (button.dataset.cartAction === 'Mehr') order.set(id, Math.min(current + 1, 20));
    if (button.dataset.cartAction === 'Weniger') current <= 1 ? order.delete(id) : order.set(id, current - 1);
    if (button.dataset.cartAction === 'Entfernen') order.delete(id);
    renderCart();
  });
  document.querySelector('#open-checkout').addEventListener('click', () => {
    if (!count()) return;
    cart.close();
    document.querySelector('#checkout-flow').hidden = false;
    document.querySelector('#checkout-confirmation').hidden = true;
    updateCheckout();
    checkout.showModal();
  });
  document.querySelectorAll('input[name="delivery"]').forEach(input => input.addEventListener('change', updateCheckout));
  document.querySelector('#finish-demo').addEventListener('click', () => {
    document.querySelector('#checkout-flow').hidden = true;
    document.querySelector('#checkout-confirmation').hidden = false;
  });
  document.querySelector('#checkout-back').addEventListener('click', () => checkout.close());
  document.querySelector('[data-close="checkout"]').addEventListener('click', () => checkout.close());
  [detail, cart, checkout].forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  }));
  renderCart();
})();
