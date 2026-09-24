/* Each demonstration has a function that belongs to that person's work. */
const atlas = document.querySelector('[data-atlas]');
if (atlas) {
  const observations = {
    heat: ['01 / 03 · STADTKLIMA', 'Wo Schatten fehlt.', 'Die versiegelte Fläche wird zur Frage: Wo könnte ein Baum den Weg tatsächlich angenehmer machen?'],
    water: ['02 / 03 · WASSER', 'Wohin der Regen fließt.', 'Die Karte zeigt, wo Wasser heute abläuft und wo eine kleine Versickerungsfläche denkbar wäre.'],
    route: ['03 / 03 · WEGE', 'Wer den Ort nutzt.', 'Eine gute Lösung beginnt nicht bei der Zeichnung, sondern bei den Wegen der Menschen vor Ort.']
  };
  atlas.querySelectorAll('[data-atlas-point]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.atlasPoint;
      const [count, title, copy] = observations[key];
      atlas.dataset.view = key;
      atlas.querySelectorAll('[data-atlas-point]').forEach(point => point.setAttribute('aria-pressed', String(point === button)));
      document.getElementById('ab-map-count').textContent = count;
      document.getElementById('ab-map-title').textContent = title;
      document.getElementById('ab-map-copy').textContent = copy;
    });
  });
}

const planner = document.querySelector('[data-planner]');
if (planner) {
  const key = 'karriaro-noah-planner-v1';
  const form = document.getElementById('ny-form');
  const field = document.getElementById('ny-task');
  const list = document.getElementById('ny-tasks');
  const progress = document.getElementById('ny-progress');
  const label = document.getElementById('ny-progress-label');
  let tasks = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) tasks = saved.filter(item => item && typeof item.text === 'string' && item.text.length <= 80 && typeof item.done === 'boolean').slice(0, 12);
  } catch { /* A blocked or malformed local store leaves the prototype usable. */ }
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(tasks)); } catch { /* Private browsing can deny storage. */ } };
  const render = () => {
    list.replaceChildren();
    tasks.forEach((task, index) => {
      const row = document.createElement('li');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ny-task-toggle';
      toggle.setAttribute('aria-pressed', String(task.done));
      toggle.setAttribute('aria-label', `${task.done ? 'Als offen markieren' : 'Als erledigt markieren'}: ${task.text}`);
      toggle.textContent = task.done ? '✓' : '○';
      toggle.addEventListener('click', () => { task.done = !task.done; persist(); render(); });
      const copy = document.createElement('span');
      copy.textContent = task.text;
      if (task.done) copy.className = 'is-done';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ny-task-remove';
      remove.setAttribute('aria-label', `Schritt entfernen: ${task.text}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => { tasks.splice(index, 1); persist(); render(); });
      row.append(toggle, copy, remove);
      list.append(row);
    });
    if (!tasks.length) {
      const empty = document.createElement('li');
      empty.className = 'ny-tasks-empty';
      empty.textContent = 'Noch keine Schritte. Beginnen Sie mit einem kleinen Vorhaben.';
      list.append(empty);
    }
    const done = tasks.filter(task => task.done).length;
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    label.textContent = `${done} von ${tasks.length} Schritten erledigt`;
    progress.setAttribute('aria-valuenow', String(percent));
    progress.querySelector('i').style.width = `${percent}%`;
    field.disabled = tasks.length >= 12;
    form.querySelector('button').disabled = tasks.length >= 12;
    field.placeholder = tasks.length >= 12 ? 'Maximal 12 Schritte erreicht' : 'z. B. ein Formular mit Tastatur testen';
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = field.value.trim();
    if (!value || tasks.length >= 12) return;
    tasks.push({ text: value, done: false });
    field.value = '';
    persist();
    render();
    field.focus();
  });
  render();
}

const migration = document.querySelector('[data-migration]');
if (migration) {
  const stages = [
    ['00 / AUSGANGSLAGE', '100 % Verkehr', '0 % Verkehr', 'Zuerst wird eine klare Grenze definiert. Der laufende Betrieb bleibt unverändert.'],
    ['01 / SCHNITTSTELLE', '100 % Verkehr', '0 % Verkehr', 'Der neue Service erhält eine Schnittstelle und Tests. Noch geht kein Nutzerverkehr dorthin.'],
    ['02 / KLEINER TEST', '90 % Verkehr', '10 % Verkehr', 'Ein kleiner Teil des Verkehrs wechselt. Wir prüfen Fehler, Antwortzeiten und einen Weg zurück.'],
    ['03 / AUSWEITEN', '40 % Verkehr', '60 % Verkehr', 'Erst wenn die Signale tragen, wird weiter umgestellt. Der Bestand bleibt bis zum Abschluss verfügbar.']
  ];
  let stage = 0;
  const advance = document.getElementById('td-advance');
  const render = () => {
    const [name, oldShare, newShare, decision] = stages[stage];
    document.getElementById('td-stage').textContent = name;
    document.getElementById('td-old-share').textContent = oldShare;
    document.getElementById('td-new-share').textContent = newShare;
    document.getElementById('td-decision').textContent = decision;
    migration.dataset.stage = String(stage);
    advance.disabled = stage === stages.length - 1;
    advance.querySelector('span').textContent = stage === stages.length - 1 ? '✓' : '→';
  };
  advance.addEventListener('click', () => { stage = Math.min(stage + 1, stages.length - 1); render(); });
  document.getElementById('td-reset').addEventListener('click', () => { stage = 0; render(); });
  render();
}

const poster = document.querySelector('[data-poster]');
if (poster) {
  document.querySelectorAll('[data-poster-tone]').forEach(button => button.addEventListener('click', () => {
    poster.dataset.tone = button.dataset.posterTone;
    document.querySelectorAll('[data-poster-tone]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  const size = document.getElementById('mv-type-size');
  size.addEventListener('input', () => {
    poster.style.setProperty('--poster-size', size.value);
    document.getElementById('mv-size-label').textContent = { 1: 'Kompakt', 2: 'Mittel', 3: 'Groß' }[size.value];
  });
}

const woodSheet = document.querySelector('[data-wood-sheet]');
if (woodSheet) {
  const materials = {
    ash: ['Esche / geölt', 'Helle Maserung, ruhige Kante. Eine geölte Oberfläche lässt das Holz im Alltag spürbar bleiben.'],
    oak: ['Eiche / natur', 'Deutlichere Zeichnung, warmer Ton. Die Kante bleibt sichtbar und gibt der Fläche Gewicht.'],
    walnut: ['Nussbaum / matt', 'Tiefe Farbe, zurückhaltender Glanz. Ein bewusster Kontrast zu hellen Räumen.']
  };
  document.querySelectorAll('[data-wood]').forEach(button => button.addEventListener('click', () => {
    const [title, copy] = materials[button.dataset.wood];
    woodSheet.dataset.wood = button.dataset.wood;
    document.getElementById('br-wood-title').textContent = title;
    document.getElementById('br-wood-copy').textContent = copy;
    document.querySelectorAll('[data-wood]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
}

const visit = document.querySelector('[data-visit-card]');
if (visit) {
  const steps = {
    arrival: ['01 / ANKOMMEN', 'Erst einmal in Ruhe.', 'Sie erfahren, wie der erste Termin abläuft und welche Informationen für das Gespräch hilfreich sind. Ohne Fachwörter als Hürde.'],
    conversation: ['02 / VERSTEHEN', 'Ihr Alltag zählt.', 'Im Gespräch geht es darum, was Ihnen wichtig ist und welche Fragen Sie mitbringen. Nichts muss in eine Schablone passen.'],
    next: ['03 / WEITERGEHEN', 'Ein verständlicher nächster Schritt.', 'Am Ende wissen Sie, wie es weitergeht und welche Absprachen getroffen wurden. Sie können in Ruhe nachfragen.']
  };
  document.querySelectorAll('[data-visit]').forEach(button => button.addEventListener('click', () => {
    const [count, title, copy] = steps[button.dataset.visit];
    visit.dataset.visitCard = button.dataset.visit;
    document.getElementById('nf-visit-count').textContent = count;
    document.getElementById('nf-visit-title').textContent = title;
    document.getElementById('nf-visit-copy').textContent = copy;
    document.querySelectorAll('[data-visit]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
}

const dialogue = document.querySelector('[data-dialogue-card]');
if (dialogue) {
  const questions = {
    stuck: ['01', 'Worüber sprechen wir gerade nicht?', 'Erst die unausgesprochene Spannung benennen; dann Lösungen vergleichen.'],
    roles: ['02', 'Welche Entscheidung gehört heute zu wem?', 'Verantwortung wird erst leichter, wenn Zuständigkeiten ausgesprochen werden.'],
    decision: ['03', 'Was müssen wir wissen, um entscheiden zu können?', 'Die offene Frage wird sichtbar, bevor ein vorschnelles Ja oder Nein fällt.']
  };
  document.querySelectorAll('[data-dialogue]').forEach(button => button.addEventListener('click', () => {
    const [number, question, reason] = questions[button.dataset.dialogue];
    document.getElementById('mn-dialogue-number').textContent = number;
    document.getElementById('mn-dialogue-question').textContent = question;
    document.getElementById('mn-dialogue-reason').textContent = reason;
    document.querySelectorAll('[data-dialogue]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
}

const decisionBoard = document.querySelector('.la-decision-board');
if (decisionBoard) {
  const value = document.getElementById('la-value');
  const effort = document.getElementById('la-effort');
  const render = () => {
    const benefit = Number(value.value);
    const cost = Number(effort.value);
    document.getElementById('la-value-label').textContent = `${benefit} / 5`;
    document.getElementById('la-effort-label').textContent = `${cost} / 5`;
    const marker = document.getElementById('la-marker');
    marker.style.left = `${12 + (cost - 1) * 19}%`;
    marker.style.bottom = `${12 + (benefit - 1) * 19}%`;
    const outcome = benefit >= 4 && cost <= 3
      ? ['JETZT TESTEN', 'Ein klarer erster Weg.', 'Hoher Nutzen bei überschaubarem Aufwand: die Idee verdient einen kleinen, überprüfbaren Versuch.']
      : benefit <= 2 && cost >= 4
        ? ['ZURÜCKSTELLEN', 'Noch keine gute Wette.', 'Viel Aufwand für wenig erkennbaren Nutzen. Erst die zugrunde liegende Frage schärfen.']
        : ['WEITER KLÄREN', 'Eine Annahme fehlt noch.', 'Die Werte reichen noch nicht für eine sichere Richtung. Mit einem kleinen Test mehr lernen.'];
    document.getElementById('la-result-label').textContent = outcome[0];
    document.getElementById('la-result-title').textContent = outcome[1];
    document.getElementById('la-result-copy').textContent = outcome[2];
  };
  value.addEventListener('input', render);
  effort.addEventListener('input', render);
  render();
}
