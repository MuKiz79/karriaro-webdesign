#!/usr/bin/env python3
# build-favicon-rasters.py — Desktop-Raster-Favicons aus der Bold-Bluete (SERP-lesbar).
# Single source fuer: favicon.ico (16/32/48), favicon-48/96/192/512.png, apple-touch-icon.png,
# root /favicon.ico. Geometrie identisch zur Compact-Mark in scripts/build-logo-assets.mjs
# (dort favicon.svg). Bewusst REDUZIERT ggue. der dichten Phyllotaxis: die ~110-Punkt-Bluete
# zerfaellt bei 16-32px zu Matsch → Zentrum + 6 Blaetter lesen scharf. Palette Navy/Creme/Messing.
# Run: python3 scripts/build-favicon-rasters.py
from PIL import Image, ImageDraw
import math, os

NAVY=(22,32,44,255)      # #16202C
GOLD=(201,162,75,255)    # #C9A24B (Messing)
CREME=(241,239,231,255)  # #F1EFE7
IMG='src/images'; os.makedirs(IMG, exist_ok=True)

def draw_bloom(S, rounded=True, ss=4):
    W=S*ss
    im=Image.new('RGBA',(W,W),(0,0,0,0))
    d=ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0,0,W-1,W-1], radius=int(0.22*W), fill=NAVY)
    else:
        d.rectangle([0,0,W-1,W-1], fill=NAVY)  # apple-touch: iOS maskiert selbst
    c=W/2
    d.ellipse([c-0.125*W,c-0.125*W,c+0.125*W,c+0.125*W], fill=GOLD)     # Zentrum
    R=0.27*W; pr=0.092*W
    for i in range(6):
        a=math.radians(-90+i*60); x=c+R*math.cos(a); y=c+R*math.sin(a)
        d.ellipse([x-pr,y-pr,x+pr,y+pr], fill=CREME if i%2==0 else GOLD)
    return im.resize((S,S), Image.LANCZOS)

master = draw_bloom(1024, rounded=True)
for s in (512,192,96,48):
    master.resize((s,s), Image.LANCZOS).save(f'{IMG}/favicon-{s}.png')
draw_bloom(180, rounded=False).save(f'{IMG}/apple-touch-icon.png')
master.save(f'{IMG}/favicon.ico', sizes=[(16,16),(32,32),(48,48)])
master.save('src/favicon.ico', sizes=[(16,16),(32,32),(48,48)])
print('favicon rasters written (bold-bloom, Navy/Creme/Messing)')
