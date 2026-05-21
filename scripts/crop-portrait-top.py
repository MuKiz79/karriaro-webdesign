#!/usr/bin/env python3
"""Sprint 139 — Croppt weißen Streifen am Top eines Portrait-JPEGs.

Heuristik: row-mean-RGB > 240 in allen Channels = "weiß/cream".
Erste Row, die nicht mehr weiß ist, ist der neue Top.

Lauf:  python3 scripts/crop-portrait-top.py <pfad-zum-jpeg>
       python3 scripts/crop-portrait-top.py src/images/immobilien/andreas-team.jpg
"""
import sys
from PIL import Image


def find_content_top(img, threshold=240, sample_step=5):
    """Findet erste Row, die non-white Content enthält.

    threshold:   RGB-Mean unter dem die Row als Content gilt
    sample_step: jedes N-te Pixel sampeln (für Performance)
    """
    pixels = img.load()
    w, h = img.size
    for y in range(0, h):
        samples = [pixels[x, y][:3] for x in range(0, w, sample_step)]
        mean_r = sum(s[0] for s in samples) / len(samples)
        mean_g = sum(s[1] for s in samples) / len(samples)
        mean_b = sum(s[2] for s in samples) / len(samples)
        if mean_r < threshold or mean_g < threshold or mean_b < threshold:
            return y
    return 0


def main():
    if len(sys.argv) < 2:
        print('Usage: crop-portrait-top.py <jpeg-path>')
        sys.exit(1)
    path = sys.argv[1]
    img = Image.open(path).convert('RGB')
    w, h = img.size
    top = find_content_top(img)
    if top == 0:
        print(f'  No white-stripe detected — skipping {path}')
        return
    cropped = img.crop((0, top, w, h))
    cropped.save(path, quality=95, optimize=True)
    print(f'  Cropped {path}: removed top {top} px → new {w}×{h - top}')


if __name__ == '__main__':
    main()
