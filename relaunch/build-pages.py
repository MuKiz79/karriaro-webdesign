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
projects.sort(key=lambda p: ['shop','interior','kulinarik','fotografie','architektur','schmuck','immobilien','software','training','beratung','klang'].index(p[0]))
intro = '<section class="page-hero wrap"><p class="eyebrow">Websites entdecken</p><h1>Öffnen. Erkunden.<br><em>Ausprobieren.</em></h1><p>Meine veröffentlichte Website und elf eigene Konzeptprojekte. Entdecken Sie unterschiedliche Branchen, Gestaltungen und Besucherwege.</p></section>'
intro += '<section class="published-work wrap" aria-labelledby="published-title"><a href="https://muammerkizilaslan.com/" aria-label="Veröffentlichte Website von Muammer Kizilaslan öffnen"><img src="/assets/projects/muammerkizilaslan-desktop-poster.webp" width="1920" height="862" alt="Die veröffentlichte persönliche Website von Muammer Kizilaslan mit ihrem Themen-Netz"></a><div><span class="work-type">Eigene Website · Veröffentlicht</span><h2 id="published-title">Kein Lebenslauf.<br>Eine Denkweise.</h2><p>Mein persönlicher Auftritt. Konzept, Gestaltung und technische Umsetzung aus einer Hand. Live unter muammerkizilaslan.com.</p><a class="text-link" href="https://muammerkizilaslan.com/">Veröffentlichte Website öffnen ↗</a></div></section><div class="wrap concept-heading"><h2>Elf eigene Perspektiven.</h2><p>Konzeptwebsites mit fiktiven Personen und Produkten. Zum Öffnen und Ausprobieren.</p></div>'
cards = '<section class="collection wrap" aria-label="Alle Arbeiten">'
for slug,name,kind,image,description in projects:
    extension = 'png'
    cards += f'<article class="collection-item"><a href="/studien/{slug}.html" class="website-browser" aria-label="Website {name} öffnen"><span class="website-browser-bar"><span class="browser-dots" aria-hidden="true">● ● ●</span><span>{kind} · Website-Konzept</span><span aria-hidden="true">↗</span></span><img src="/assets/websites/{slug}.{extension}" alt="Tatsächliche Startseitenansicht der Website {name}" loading="lazy" width="1280" height="960"><span class="website-browser-action">Website öffnen <span aria-hidden="true">↗</span></span></a><div class="work-caption"><div><span class="work-type">Eigenes Website-Konzept · {kind}</span><h2>{name}</h2></div><a class="text-link" href="/studien/{slug}.html">Website öffnen ↗</a></div><p>{description}</p></article>'
cards += '</section><div class="wrap"><p class="collection-note">Die elf Konzeptwebsites sind eigene Entwürfe mit fiktiven Personen und KI-generierten Bildmotiven. Sie zeigen Gestaltung und technische Umsetzung, keine realen Kundenaufträge oder Geschäftsergebnisse. Kontakt- und Geschäftsvorgänge sind Demos.</p><section class="simple-cta" aria-label="Projektanfrage"><h2>Und Ihr <em>Auftritt?</em></h2><a class="button button-dark" href="/#kontakt">Projekt besprechen <span aria-hidden="true">↗</span></a></section></div>'
(SITE/'arbeiten.html').write_text(page('Arbeiten', 'Ausgewählte Websites und eigenständige Designstudien der Karriaro Website-Designmanufaktur.', 'arbeiten', intro+cards))

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
