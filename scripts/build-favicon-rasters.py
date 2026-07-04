#!/usr/bin/env python3
# build-favicon-rasters.py — Favicon = GRÜNDER-GESICHT (Founder-Entscheidung 2026-07-04).
# Ersetzt die Bold-Blüte: ein Gesicht im Google-Suchergebnis schlägt für Trust/Klickrate
# ein abstraktes Zeichen (wie Wettbewerber lisakoch.de). Quelle: src/images/muammer-portrait.jpg
# (512² Graustufen). Enger Face-Crop ("Crop B"), damit der Kopf den SERP-Kreis füllt.
# Erzeugt: favicon.ico (16/32/48), favicon-48/96/192/512.png, apple-touch-icon.png (180),
# root /favicon.ico, favicon.svg (Foto als <image> eingebettet -> bestehende svg-Links greifen).
# WICHTIG: build-logo-assets.mjs schreibt favicon.svg NICHT mehr (Gesicht ist kein SVG-Mark).
# Run: python3 scripts/build-favicon-rasters.py
from PIL import Image
import base64, io, os
IMG='src/images'; os.makedirs(IMG, exist_ok=True)
port = Image.open('src/images/muammer-portrait.jpg').convert('L')  # 512 grayscale
face = port.crop((120, 60, 392, 332))  # Crop B - enger Kopf-Ausschnitt
master = face.resize((1024, 1024), Image.LANCZOS).convert('RGB')
for s in (512,192,96,48):
    master.resize((s,s), Image.LANCZOS).save(f'{IMG}/favicon-{s}.png')
master.resize((180,180), Image.LANCZOS).save(f'{IMG}/apple-touch-icon.png')  # iOS maskiert selbst
master.save(f'{IMG}/favicon.ico', sizes=[(16,16),(32,32),(48,48)])
master.save('src/favicon.ico', sizes=[(16,16),(32,32),(48,48)])
# favicon.svg: 256px-JPEG als data-URI (bestehende <link rel=icon svg> zeigen das Gesicht)
buf=io.BytesIO(); master.resize((256,256), Image.LANCZOS).save(buf, format='JPEG', quality=86)
b64=base64.b64encode(buf.getvalue()).decode()
svg=('<?xml version="1.0" encoding="UTF-8"?>\n'
     '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Muammer Kizilaslan, Gruender Karriaro">'
     f'<image href="data:image/jpeg;base64,{b64}" width="256" height="256" preserveAspectRatio="xMidYMid slice"/></svg>\n')
open(f'{IMG}/favicon.svg','w').write(svg)
print('Gesichts-Favicon (Crop B) erzeugt: ico/png/apple-touch/svg  svg-bytes=', len(svg))
