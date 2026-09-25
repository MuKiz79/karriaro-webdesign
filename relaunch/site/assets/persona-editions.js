/* Interactions on the three portfolio demonstrations stay local. */
const felixCopy = {
  precision: ['VON DER TOLERANZ ZUR BENUTZBARKEIT', 'Präzision ist eine Haltung.', 'Im Maschinenbau entscheidet ein Millimeter. Im Interface kann ein unklarer Zustand denselben Unterschied machen. Ich prüfe beides dort, wo es benutzt wird.'],
  systems: ['VON BAUTEILEN ZU ZUSAMMENHÄNGEN', 'Das Ganze braucht einen Plan.', 'Eine gute Lösung entsteht, wenn Teile, Abläufe und Menschen zusammen gedacht werden. Ich zeichne Beziehungen, bevor ich Oberflächen zeichne.'],
  testing: ['VOM PRÜFSTAND ZUM PROTOTYP', 'Behaupten reicht nicht.', 'Ein Modell macht Annahmen überprüfbar. Ich beobachte, wo etwas klemmt, passe an und teste erneut – bevor aus einer Idee ein festes Produkt wird.']
};
document.querySelectorAll('[data-felix]').forEach(button => button.addEventListener('click', () => {
  const selected = felixCopy[button.dataset.felix];
  if (!selected) return;
  document.querySelectorAll('[data-felix]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.getElementById('fb-strength-label').textContent = selected[0];
  document.getElementById('fb-strength-title').textContent = selected[1];
  document.getElementById('fb-strength-copy').textContent = selected[2];
  document.querySelector('.fb-bridge-drawing span').textContent = 'F/B / TRANSFER 0' + ([...document.querySelectorAll('[data-felix]')].indexOf(button) + 1);
}));

const minaCopy = {
  winter: ['/assets/personas-media/mina-citrus.webp', 'Blutorange, Radicchio und Keramik im Winterlicht', 'STUDIE 01 / WINTERLICHT', 'Ein Akzent trägt das Bild.', 'Das dunkle Blatt hält die Komposition zusammen; die Orange setzt einen warmen Gegenpunkt. Links bleibt Raum für eine eigene Geschichte.'],
  ruhe: ['/assets/personas-media/mina-pears.webp', 'Birnen auf Keramik im warmen Spätnachmittagslicht', 'STUDIE 02 / SPÄTNACHMITTAG', 'Die Pause ist Teil des Bildes.', 'Die Birnen stehen eng beieinander. Der freie Raum daneben lässt Material und Licht wirken, ohne das Objekt zu überreden.']
};
document.querySelectorAll('[data-mina]').forEach(button => button.addEventListener('click', () => {
  const selected = minaCopy[button.dataset.mina];
  if (!selected) return;
  document.querySelectorAll('[data-mina]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  const image = document.getElementById('ma-stage-img');
  image.src = selected[0]; image.alt = selected[1];
  document.getElementById('ma-stage-index').textContent = selected[2];
  document.getElementById('ma-stage-title').textContent = selected[3];
  document.getElementById('ma-stage-copy').textContent = selected[4];
}));

const upCopy = {
  auftrag: ['WEG A / ZUSAMMENARBEIT', 'Von der Frage zur Entscheidung.', 'Zuerst wird sichtbar, wie eine Aufgabe eingeordnet wird: Ausgangspunkt, Abwägung und ein begründeter Vorschlag. Danach folgen Erfahrung und Gespräch.'],
  wissen: ['WEG B / WISSEN', 'Vom Fachbegriff zum eigenen Urteil.', 'Zuerst führt eine verständliche Erklärung ins Thema. Beispiele und Hintergründe folgen, damit Besucher eine Entscheidung selbst einordnen können.']
};
document.querySelectorAll('[data-up-mode]').forEach(button => button.addEventListener('click', () => {
  const selected = upCopy[button.dataset.upMode];
  if (!selected) return;
  document.querySelectorAll('[data-up-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.getElementById('up-mode-label').textContent = selected[0];
  document.getElementById('up-mode-title').textContent = selected[1];
  document.getElementById('up-mode-copy').textContent = selected[2];
}));
