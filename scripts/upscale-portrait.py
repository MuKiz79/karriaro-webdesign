#!/usr/bin/env python3
# upscale-portrait.py — Gruender-Portrait (512² Graustufen) fuer grosse GBP-Flaechen aufbereiten.
# Lanczos-Upscale + UnsharpMask → brand-assets/.cache/portrait-hi.png (von build-gbp-assets.mjs gelesen).
# Kein echtes Detail-Plus (Quelle ist 512²) — fuer maximale Schaerfe ein hochaufloesendes Original liefern.
# Run: python3 scripts/upscale-portrait.py
from PIL import Image, ImageFilter
import os
os.makedirs('brand-assets/.cache', exist_ok=True)
im = Image.open('src/images/muammer-portrait.jpg').convert('L')
im = im.resize((1200, 1200), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=120, threshold=2))
im.convert('RGB').save('brand-assets/.cache/portrait-hi.png')
print('brand-assets/.cache/portrait-hi.png geschrieben (512→1200, geschaerft)')
