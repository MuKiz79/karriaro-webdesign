"""Render the typographic social preview from the site's own brand fonts."""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'site/assets/brand/karriaro-preview-usp.png'
S = 2

def px(n): return round(n * S)
def color(hex_code): return tuple(bytes.fromhex(hex_code.lstrip('#')))

with TemporaryDirectory() as temp:
    fonts = {}
    for name, filename in [('sans', 'inter-tight-latin.woff2'), ('serif', 'cormorant-garamond-latin-italic.woff2')]:
        font = TTFont(ROOT / 'site/assets/fonts' / filename)
        font.flavor = None
        path = Path(temp) / (name + '.ttf')
        font.save(path)
        fonts[name] = path

    def face(name, size, weight=None):
        font = ImageFont.truetype(str(fonts[name]), px(size))
        if name == 'sans' and weight is not None:
            font.set_variation_by_axes([weight])
        return font
    ink = color('#1c2824')
    copper = color('#a4533b')
    mute = color('#5d6860')
    paper = color('#f5f3ed')
    image = Image.new('RGB', (px(1200), px(630)), paper)
    draw = ImageDraw.Draw(image)

    draw.line((px(64), px(53), px(1136), px(53)), fill=color('#b9c0b4'), width=px(1))
    draw.ellipse((px(61), px(50), px(67), px(56)), fill=copper)
    draw.text((px(64), px(73)), 'KARRIARO', font=face('sans', 47, 750), fill=ink, stroke_width=0)
    draw.ellipse((px(345), px(100), px(355), px(110)), fill=copper)
    right = 'WEBSITE-DESIGNMANUFAKTUR'
    right_font = face('sans', 15)
    right_width = draw.textlength(right, font=right_font)
    draw.text((px(1136) - right_width, px(95)), right, font=right_font, fill=mute)

    draw.text((px(64), px(180)), 'Können wird', font=face('sans', 110, 560), fill=ink)
    draw.text((px(62), px(292)), 'erlebbar.', font=face('serif', 152), fill=copper)

    # A one-off drawing, echoing the idea of a personal route through connected work.
    def bezier(a, b, c, d, steps=90):
        points = []
        for i in range(steps + 1):
            t = i / steps
            q = 1 - t
            x = q**3*a[0] + 3*q*q*t*b[0] + 3*q*t*t*c[0] + t**3*d[0]
            y = q**3*a[1] + 3*q*q*t*b[1] + 3*q*t*t*c[1] + t**3*d[1]
            points.append((px(x), px(y)))
        return points

    routes = [
        ((873, 195), (1064, 157), (1059, 312), (989, 426)),
        ((874, 194), (808, 315), (952, 354), (1092, 407)),
        ((867, 270), (1112, 196), (1092, 350), (989, 426)),
        ((843, 397), (831, 231), (1067, 232), (1092, 407)),
    ]
    for i, route in enumerate(routes):
        draw.line(bezier(*route), fill=color('#a4b1a7') if i != 1 else copper, width=px(1 if i != 1 else 2), joint='curve')
    for x, y, r, fill in [(873,195,5,ink),(867,270,4,paper),(843,397,5,paper),(989,426,7,copper),(1092,407,4,ink)]:
        draw.ellipse((px(x-r), px(y-r), px(x+r), px(y+r)), fill=fill, outline=copper if fill==paper else None, width=px(1))
    draw.arc((px(805), px(171), px(1133), px(456)), 208, 316, fill=color('#c7cec3'), width=px(1))

    draw.line((px(64), px(506), px(1136), px(506)), fill=color('#abb3aa'), width=px(1))
    draw.text((px(64), px(531)), 'Individuelle Websites für Unternehmen und Menschen.', font=face('sans', 22), fill=ink)
    domain = 'karriaro-webdesign.de'
    domain_font = face('sans', 17)
    draw.text((px(1136) - draw.textlength(domain, font=domain_font), px(537)), domain, font=domain_font, fill=mute)

    image.resize((1200, 630), Image.Resampling.LANCZOS).save(OUT, optimize=True)
    print(OUT)
