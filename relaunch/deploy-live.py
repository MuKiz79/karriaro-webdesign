"""Baut dist-live/ aus site/ für Firebase Hosting mit cleanUrls: interne .html-Verweise werden zu sauberen Adressen (kein 301 je Klick).
Quelle bleibt unverändert; die lokale Vorschau läuft weiter mit .html."""
import pathlib, re, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent; SRC = ROOT / "site"; DST = ROOT / "dist-live"
if DST.exists(): shutil.rmtree(DST)
shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns("node_modules", ".*"))
def sauber(pfad):
    if pfad.endswith("/index.html"): return pfad[: -len("index.html")]
    if pfad == "/index.html": return "/"
    return pfad[:-5]
stat = {"html": 0, "js": 0}
for f in DST.rglob("*.html"):
    t = f.read_text(encoding="utf-8")
    def rep(m):
        stat["html"] += 1; return f'{m.group(1)}="{sauber(m.group(2))}{m.group(3) or ""}"'
    n = re.sub(r'(href|src|content|action|data-src|data-href)="(/[^"?#]+\.html)([?#][^"]*)?"', rep, t)
    def rep_rel(m):
        stat["html"] += 1; return f'{m.group(1)}="{m.group(2)}{m.group(3) or ""}"'
    n = re.sub(r'(href|src)="([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*?)\.html([?#][^"]*)?"', rep_rel, n)  # relative Verweise innerhalb von studien/
    f.write_text(n, encoding="utf-8")
for f in list(DST.glob("assets/*.js")) + list(DST.glob("studien/*.js")):
    t = f.read_text(encoding="utf-8")
    def rep(m):
        stat["js"] += 1; return f"{m.group(1)}{sauber(m.group(2))}{m.group(3) or ''}{m.group(1)}"
    n = re.sub(r"""(["'])(/[^"'?#\s]+\.html)([?#][^"']*)?\1""", rep, t)
    f.write_text(n, encoding="utf-8")
rest = [(str(f.relative_to(DST)), len(re.findall(r'="/[^"?#]+\.html', f.read_text(encoding="utf-8")))) for f in DST.rglob("*.html")]
rest = [r for r in rest if r[1]]
print(f"dist-live: {sum(1 for _ in DST.rglob('*') if _.is_file())} Dateien, Verweise bereinigt: HTML {stat['html']}, JS {stat['js']}, Rest mit .html: {rest or 'keine'}")
