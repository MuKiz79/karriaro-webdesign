"""Generate secondary pages from the shared home-page shell; no network access."""
from pathlib import Path
import re
import html

ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'site'
home = (SITE / 'index.html').read_text()
head = home.split('<body>')[0]
header = re.search(r'<header class="site-header">.*?</header>', home, re.S).group()
header = re.sub(r'href="#(arbeiten|manufaktur|leistungen|preise|erweiterungen|kontakt)"', r'href="/#\1"', header)
footer = re.search(r'<footer class="site-footer.*?</footer>', home, re.S).group()
preview = re.search(r'<dialog id="work-preview".*?</dialog>', home, re.S).group()

def page(title, description, path, content, noindex=False):
    h = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)} — Karriaro</title>', head)
    h = re.sub(r'<meta name="description"[^>]*>', f'<meta name="description" content="{html.escape(description, quote=True)}">', h)
    h = re.sub(r'<link rel="canonical"[^>]*>', f'<link rel="canonical" href="https://karriaro-webdesign.de/{path}">', h)
    h = re.sub(r'<meta property="og:(title|description|url)"[^>]*>', '', h)
    h = re.sub(r'<script type="application/ld\+json">.*?</script>', '', h, flags=re.S)
    h = re.sub(r'\s*<link rel="preload" href="/(?:studien/)?assets/[^"]+" as="image"[^>]*>', '', h)  # Hero-Bild nur auf der Startseite vorladen
    if noindex: h = h.replace('</head>', '<meta name="robots" content="noindex,follow"></head>')
    return h + '<body><a class="skip-link" href="#inhalt">Zum Inhalt springen</a>' + header + '<main id="inhalt">' + content + '</main>' + footer + preview + '</body></html>\n'

projects = [
 ('kante','KANTE / Räume','Handwerk','kante-window-detail-v3.webp','Fenster, Fassade und Raum aus einer präzisen Idee. Mit Materialwahl und Projektskizze.'),
 ('waldruehe','WALDRUHE','Unterkunft','waldruehe-house.webp','Unterkunft entdecken: Bildgeschichte, Raumansicht und Reiseplaner mit Datum, Gästen und Stimmung.'),
 ('tischundton','TISCH & TON','Lokaler Handel','tischundton-brand-stilllife-v3.webp','Eine eigene Markenwelt mit Tischprobe und Demo-Shop: Produkte nach Anlass zusammenstellen und bis zur Kasse ausprobieren.'),
 ('shop','FORM / Objekte','Onlineshop','sofia-silver.webp','Eine Kollektion, Produktvarianten, Warenkorb und vollständiger Demo-Checkout: ein Shop zum Ausprobieren.'),
 ('interior','Mila Hartmann','Interior Design','mila-evening.webp','Leistungen, Materialauswahl und Projektanfrage: ein vollständiger Besucherweg für ein Interior-Studio.'),
 ('fotografie','Elena Voss','Fotografie','elena-coast.webp','Ein visueller Essay zwischen Küste und Stille. Mit Bildpaaren, Galerie und eigenen Zusammenstellungen.'),
 ('architektur','David Kern','Architektur','david-pavilion.webp','Ein Haus verstehen: das interaktive Schnittmodell macht eine räumliche Idee erfahrbar.'),
 ('schmuck','Sofia Brandt','Schmuckdesign','sofia-silver.webp','Die Form steht im Mittelpunkt. Materialstudien und ein drehbares Modell laden zum Entdecken ein.'),
 ('immobilien','Clara Winter','Immobilien','clara-interior09.webp','Ein bildgeführter Auftritt mit einer persönlichen Perspektive auf Räume und ihren Alltag.'),
 ('kulinarik','Matteo Rossi','Kulinarik','matteo-evening09.webp','Anlässe, Menüs und eine bedienbare Demo-Anfrage führen vom ersten Eindruck zur Planung eines Abends.'),
 ('software','Leon Weber','Software','software.webp','Eine klare, interaktive Arbeitsfläche macht Abläufe und Entscheidungen sichtbar.'),
 ('training','Nora Seidel','Bewegung','nora-movement.webp','Bewegung bekommt ihren eigenen Rhythmus. Eine ausdrucksstarke Gestaltung mit bedienbaren Sequenzen.'),
 ('beratung','Jonas Bergmann','Beratung','beratung.webp','Ein strukturierter Auftritt, der Gedanken ordnet und Entscheidungen nachvollziehbar macht.'),
 ('klang','Ada Lind','Klanggestaltung','ada-portrait.webp','Raum und Klang erkunden: eine interaktive Studie mit bewusst startbarer Audiowiedergabe.')
]
projects.sort(key=lambda p: ['kante','waldruehe','tischundton','shop','interior','kulinarik','fotografie','architektur','schmuck','immobilien','software','training','beratung','klang'].index(p[0]))
featured_slugs = ('kante', 'waldruehe', 'tischundton')
featured = {
    'kante': ('Handwerk · Fenster & Räume', 'Die Linie entscheidet.', 'Ein Handwerksbetrieb braucht einen Auftritt, der Präzision zeigt, bevor er sie behauptet.', 'Ein architektonischer Bildrhythmus führt von Material und Raum zur bedienbaren Projektskizze.', 'Material und Vorhaben wählen'),
    'waldruehe': ('Unterkunft · Rückzugsort', 'Ein Ort, der bleibt.', 'Eine Unterkunft wird erst interessant, wenn man sich einen Aufenthalt darin vorstellen kann.', 'Haus und Innenraum erzählen eine stille Geschichte; der Reiseplaner macht daraus eine persönliche Idee.', 'Aufenthalt zusammenstellen'),
    'tischundton': ('Handel · Feinkost & Tischkultur', 'Ein Tisch voller Möglichkeiten.', 'Ein kleiner Laden benötigt digital mehr als ein schönes Produktregal.', 'Eine eigene Verpackungswelt und die Tischprobe machen Anlässe erlebbar; der Demo-Shop führt die Auswahl bis zur Kasse.', 'Tischprobe ausprobieren'),
}

def project_url(slug):
    return f'/studien/{slug}.html' + ('?v=20260923c' if slug in featured_slugs else '')

intro = '<section class="page-hero gallery-hero wrap"><p class="eyebrow">Karriaro / Werkschau</p><h1>Jede Aufgabe<br><em>eine eigene Welt.</em></h1><p>Drei bedienbare Website-Konzepte zeigen, wie unterschiedlich Gestaltung und Funktion sein können. Dazu kommt mein veröffentlichter persönlicher Auftritt.</p><nav class="gallery-jump" aria-label="Bereiche der Werkschau"><a href="#konzepte">Konzepte ausprobieren ↘</a><a href="#veroeffentlicht">Veröffentlichte Website ↘</a></nav></section>'
published = '<section class="published-work wrap" id="veroeffentlicht" aria-labelledby="published-title"><a href="https://muammerkizilaslan.com/" aria-label="Veröffentlichte Website von Muammer Kizilaslan öffnen"><img src="/assets/projects/muammerkizilaslan-desktop-poster.webp" width="1920" height="862" alt="Die veröffentlichte persönliche Website von Muammer Kizilaslan mit ihrem Themen-Netz"></a><div><span class="work-type">Eigene Website · Veröffentlicht</span><h2 id="published-title">Kein Lebenslauf.<br>Eine Denkweise.</h2><p>Mein persönlicher Auftritt. Konzept, Gestaltung und technische Umsetzung aus einer Hand. Live unter muammerkizilaslan.com.</p><a class="text-link" href="https://muammerkizilaslan.com/">Veröffentlichte Website öffnen ↗</a></div></section>'

gallery = '<section class="gallery-featured" id="konzepte" aria-labelledby="featured-title"><div class="wrap gallery-section-intro"><p class="eyebrow">01 / Ausgewählte Konzepte</p><h2 id="featured-title">Drei Branchen.<br><em>Drei Ideen.</em></h2><p>Fiktive Betriebe. Jede Website lässt sich öffnen und ausprobieren.</p></div>'
for index, slug in enumerate(featured_slugs, start=1):
    _, name, kind, _, _ = next(project for project in projects if project[0] == slug)
    label, headline, task, decision, action = featured[slug]
    url = project_url(slug)
    gallery += f'<article class="gallery-feature gallery-feature--{slug}"><div class="wrap gallery-feature-inner"><div class="gallery-feature-top"><span>{index:02d} / {len(featured_slugs):02d}</span><span>Eigenes Website-Konzept · fiktiver Betrieb</span></div><div class="gallery-feature-layout"><div class="gallery-feature-copy"><p class="eyebrow">{label}</p><h3>{headline}</h3><p class="gallery-feature-name">{name}</p><dl><div><dt>Die Aufgabe</dt><dd>{task}</dd></div><div><dt>Die Idee</dt><dd>{decision}</dd></div></dl><a class="gallery-feature-cta" href="{url}">{action} <span aria-hidden="true">↗</span></a></div><a class="gallery-feature-screen" href="{url}" aria-label="Website-Konzept {name} öffnen"><span class="gallery-screen-bar"><span class="browser-dots" aria-hidden="true">● ● ●</span><span>{kind} / Website-Vorschau</span><span aria-hidden="true">↗</span></span><span class="website-live-frame" aria-hidden="true"><iframe src="{url}" title="Vorschau: {name}" tabindex="-1" loading="lazy" sandbox=""></iframe></span><span class="gallery-screen-foot">Website öffnen <span aria-hidden="true">↗</span></span></a></div></div></article>'
gallery += '</section>'
gallery += published

archive_projects = [project for project in projects if project[0] not in featured_slugs]
gallery += f'<section class="gallery-archive wrap" id="archiv" aria-labelledby="archive-title"><div class="gallery-archive-head"><div><p class="eyebrow">Weitere Entwürfe</p><h2 id="archive-title">Die Sammlung<br><em>wächst weiter.</em></h2></div><p>{len(archive_projects)} zusätzliche Entwürfe aus unterschiedlichen Bereichen. Die ausgewählten Arbeiten oben zeigen den aktuellen Gestaltungsanspruch.</p></div><details class="gallery-archive-details"><summary>Alle {len(archive_projects)} weiteren Entwürfe ansehen <span aria-hidden="true">+</span></summary><div class="gallery-index">'
for index, (slug, name, kind, image, description) in enumerate(archive_projects, start=1):
    gallery += f'<a class="gallery-index-row" href="{project_url(slug)}" aria-label="Website-Konzept {name} öffnen"><span class="gallery-index-number">{index:02d}</span><strong>{name}</strong><span class="gallery-index-kind">{kind}</span><span class="gallery-index-action" aria-hidden="true">↗</span></a>'
gallery += '</div></details></section><div class="wrap"><p class="collection-note">Die Konzeptwebsites sind eigene Entwürfe mit fiktiven Betrieben, Personen oder Produkten und teils KI-generierten Bildmotiven. Sie zeigen Gestaltung und technische Umsetzung, keine Kundenaufträge oder Geschäftsergebnisse. Kontakt- und Geschäftsvorgänge sind Demos.</p><section class="simple-cta" aria-label="Projektanfrage"><h2>Und Ihr <em>Auftritt?</em></h2><a class="button button-dark" href="/#kontakt">Projekt besprechen <span aria-hidden="true">↗</span></a></section></div>'
gallery_page = page('Webdesign-Beispiele und Website-Konzepte', 'Entdecken Sie Karriaros veröffentlichte Website und bedienbare Webdesign-Konzepte für Handwerk, Unterkunft, Handel und weitere Branchen.', 'arbeiten', intro+gallery)
gallery_page = gallery_page.replace('</head>', '<link rel="stylesheet" href="/assets/gallery.css?v=20260923d"></head>')
(SITE/'arbeiten.html').write_text(gallery_page)

# Keep the existing legal wording in local source files for independent review.
for slug,title in [('impressum','Impressum'),('datenschutz','Datenschutzerklärung'),('agb','Allgemeine Geschäftsbedingungen')]:
    source = ROOT/'legal-source'/(slug+'.html')
    if not source.exists(): continue
    text = source.read_text()
    body = re.search(r'<section\b[^>]*>(.*?)</section>',text,re.S).group(1).strip()
    body = re.sub(r'^<div class="wrap">', '', body).strip()
    body = re.sub(r'</div>\s*$', '', body).strip()
    body = re.sub(r'<h1[^>]*>.*?</h1>', '', body, flags=re.S)
    body = re.sub(r'\sstyle="[^"]*"','',body)
    if slug == 'datenschutz':
        body = re.sub(r'<h2>Kontaktformular</h2>', '<h2 id="kontaktformular">Kontaktformular</h2>', body)
    intro = f'<section class="page-hero wrap"><p class="eyebrow">Karriaro / Informationen</p><h1>{title}</h1></section>'
    (SITE/(slug+'.html')).write_text(page(title,title+' der Karriaro Website-Designmanufaktur.',slug,intro+'<div class="legal-content wrap">'+body+'</div>',True))

(SITE/'404.html').write_text(page('Seite nicht gefunden','Die gesuchte Seite ist nicht verfügbar.','404','<section class="page-hero wrap"><p class="eyebrow">404 / Hier geht es weiter</p><h1>Ein neuer<br><em>Anfang.</em></h1><p>Diese Seite ist nicht mehr an dieser Adresse erreichbar. Entdecken Sie unsere Arbeiten oder erzählen Sie uns von Ihrem Projekt.</p><p style="margin-top:30px"><a class="button button-dark" href="/">Zur Startseite <span aria-hidden="true">↗</span></a></p></section>',True))

print('Built: gallery, legal pages and 404 from shared shell.')

# Content versions keep edited scripts and styles fresh in existing preview tabs.
import hashlib
for _ in range(3):
    for source in [*SITE.rglob('*.html'), *SITE.glob('assets/*.js'), *SITE.glob('assets/*.mjs'), *SITE.glob('studien/*.js'), *SITE.glob('studien/*.mjs')]:
        original = source.read_text()
        def version_asset(match):
            asset = match.group(1)
            target = (SITE / asset.lstrip('/')) if asset.startswith('/') else (source.parent / asset)
            if not target.is_file(): return match.group(0)
            return asset + '?v=' + hashlib.sha256(target.read_bytes()).hexdigest()[:12]
        revised = re.sub(r'([./\w-]+\.(?:css|mjs|js))(?:\?v=[\w.-]+)?(?=[\x27\x22])', version_asset, original)
        if revised != original: source.write_text(revised)
