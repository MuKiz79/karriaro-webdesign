(() => {
  const press = (buttons, current) => buttons.forEach(button => button.setAttribute('aria-pressed', String(button === current)));

  const raum = document.querySelector('[data-raum-widget]');
  if (raum) {
    const state = { topic: 'Vorsorge', time: 'Vormittag' };
    const render = () => { document.querySelector('#raum-result').textContent = `${state.topic} / ${state.time}`; };
    raum.querySelectorAll('[data-raum-choice]').forEach(button => button.addEventListener('click', () => {
      const group = button.dataset.raumChoice;
      state[group] = button.dataset.value;
      press(raum.querySelectorAll(`[data-raum-choice="${group}"]`), button);
      render();
    }));
    document.querySelectorAll('[data-raum-topic]').forEach(link => link.addEventListener('click', () => {
      state.topic = link.dataset.raumTopic;
      const button = raum.querySelector(`[data-raum-choice="topic"][data-value="${state.topic}"]`);
      if (button) press(raum.querySelectorAll('[data-raum-choice="topic"]'), button);
      render();
    }));
  }

  const moodCard = document.querySelector('[data-ton-card]');
  if (moodCard) {
    const moods = {
      klar: ['Klar in der Form.', 'Eine ruhige Kontur und eine klare Schnittkante geben der Form Haltung.', 'SCHNITTLINIE / KONTUR'],
      weich: ['Weich in Bewegung.', 'Fließende Linien zeigen, wie sich Länge und Bewegung verbinden können.', 'HAARFALL / BEWEGUNG'],
      mutig: ['Mutig im Akzent.', 'Eine asymmetrische Schnittlinie setzt einen bewussten Kontrast.', 'SCHNITTLINIE / ASYMMETRIE']
    };
    document.querySelectorAll('[data-ton-mood]').forEach(button => button.addEventListener('click', () => {
      press(document.querySelectorAll('[data-ton-mood]'), button);
      moodCard.dataset.mood = button.dataset.tonMood;
      document.querySelector('#ton-mood-title').textContent = moods[button.dataset.tonMood][0];
      document.querySelector('#ton-mood-copy').textContent = moods[button.dataset.tonMood][1];
      document.querySelector('#ton-mood-art-label').textContent = moods[button.dataset.tonMood][2];
      moodCard.querySelector(':scope > span').textContent = `HALO / STILKARTE 0${[...button.parentNode.children].indexOf(button) + 1}`;
    }));
    const service = document.querySelector('#ton-service');
    let time = 'Vormittag';
    const render = () => { document.querySelector('#ton-result').textContent = `${service.value} / ${time}`; };
    service.addEventListener('change', render);
    document.querySelectorAll('[data-ton-service]').forEach(link => link.addEventListener('click', () => { service.value = link.dataset.tonService; render(); }));
    document.querySelectorAll('[data-ton-time]').forEach(button => button.addEventListener('click', () => {
      time = button.dataset.tonTime;
      press(document.querySelectorAll('[data-ton-time]'), button);
      render();
    }));
  }

  const vecto = document.querySelector('.vecto-finder');
  if (vecto) {
    const state = { application: 'Gehäuse', material: 'Edelstahl' };
    const parts = { Gehäuse: 'Gehäusering', Verbindung: 'Verbindungsstück', Führung: 'Führungsbuchse' };
    const render = () => {
      const part = parts[state.application];
      document.querySelector('#vecto-part').textContent = part;
      document.querySelector('#vecto-application').textContent = state.application;
      document.querySelector('#vecto-material').textContent = state.material;
      document.querySelector('#vecto-summary').textContent = `${part} · ${state.application} · ${state.material}`;
      document.querySelector('.vecto-spec').dataset.application = state.application;
      document.querySelector('.vecto-spec').dataset.material = state.material;
    };
    vecto.querySelectorAll('[data-vecto-choice]').forEach(button => button.addEventListener('click', () => {
      const group = button.dataset.vectoChoice;
      state[group] = button.dataset.value;
      press(vecto.querySelectorAll(`[data-vecto-choice="${group}"]`), button);
      render();
    }));
    document.querySelector('#vecto-copy').addEventListener('click', async () => {
      const note = document.querySelector('#vecto-copy-status');
      const value = document.querySelector('#vecto-summary').textContent;
      try { await navigator.clipboard.writeText(value); note.textContent = 'Projektangaben kopiert.'; }
      catch { note.textContent = 'Kopieren war nicht möglich. Die Angaben stehen oben zum Markieren.'; }
    });
  }
})();
