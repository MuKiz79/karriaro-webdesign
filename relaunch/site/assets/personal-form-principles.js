/* Biography-specific demonstrations: the content remains usable without JS. */
const story = document.querySelector('[data-felix-story]');
if (story && 'IntersectionObserver' in window) {
  const chapters = [...document.querySelectorAll('[data-felix-chapter]')];
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) story.dataset.chapter = visible[0].target.dataset.felixChapter;
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  chapters.forEach(chapter => observer.observe(chapter));
}

const network = document.querySelector('[data-aylin-network]');
if (network) {
  const views = {
    heat: ['01 / AUSGANGSPUNKT', 'Wo Schatten fehlt.', 'Eine Beobachtung im Stadtraum führt zur Frage, welche Wege am Nachmittag Schutz brauchen.', 'Kartierung und Zeitvergleich', 'Fiktive Modellstraße / Verschattung', 'Wo wäre ein Eingriff tatsächlich möglich?'],
    water: ['02 / AUSGANGSPUNKT', 'Wenn Regen bleibt.', 'Ein Starkregen wird zur Systemfrage: Wohin fließt das Wasser, und wo könnte der Boden es aufnehmen?', 'Szenarienskizze und Flächenvergleich', 'Fiktives Campusmodell / Regenwasser', 'Welche Annahmen brauchen echte Messdaten?'],
    route: ['03 / AUSGANGSPUNKT', 'Der Weg zählt.', 'Nicht jede grüne Fläche hilft den Menschen, die den Ort täglich queren. Die Nutzung verändert die Priorität.', 'Beobachtete Wege und Kartenskizze', 'Fiktive Modellstraße / Laufweg', 'Wer nutzt den Ort zu welcher Tageszeit?'],
    method: ['04 / METHODE', 'Sehen. Prüfen. Zeigen.', 'Die Methode verbindet alle drei Fragen: Beobachtung, Karte und offengelegte Annahmen.', 'Kartierung · Protokoll · Szenario', 'Zwei fiktive Studienarbeiten', 'Was ist Beobachtung, was ist noch Hypothese?'],
    project: ['05 / ARBEITSPROBE', 'Eine Frage wird Form.', 'Die Feldnotiz zeigt, wie eine offene Frage zu einer lesbaren Untersuchung wird – samt Grenzen.', 'Messpunkt A–C und Verschattungsskizze', 'Modellstraße / Feldnotiz 07', 'Welche Daten würden die Skizze widerlegen?'],
    question: ['06 / NÄCHSTER SCHRITT', 'Offen ist kein Fehler.', 'Eine gute Studie zeigt auch, was noch nicht belegt ist. Genau dort beginnt die nächste Zusammenarbeit.', 'Annahmen markieren und vor Ort prüfen', 'Praxissemester / mögliche Vertiefung', 'Was muss das Planungsteam zuerst wissen?']
  };
  network.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => {
    const content = views[button.dataset.node];
    if (!content) return;
    network.dataset.focus = button.dataset.node;
    network.querySelectorAll('[data-node]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    ['index', 'title', 'description', 'method', 'work', 'next'].forEach((part, index) => {
      document.getElementById(`ab-network-${part}`).textContent = content[index];
    });
  }));
}
