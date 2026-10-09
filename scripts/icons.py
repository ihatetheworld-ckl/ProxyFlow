"""Reproduce the local extension icons; requires Pillow. No external assets."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / 'public' / 'icons'
for size in [16, 32, 48, 128]:
    scale = 4
    im = Image.new('RGBA', (size*scale, size*scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def xy(points): return [(int(x*size*scale), int(y*size*scale)) for x,y in points]
    d.rounded_rectangle((0, 0, size*scale-1, size*scale-1), radius=int(size*scale*.24), fill='#2563eb')
    d.line(xy([(.25,.28),(.5,.5),(.75,.28)]), fill='white', width=max(2,int(size*scale*.065)))
    d.line(xy([(.5,.5),(.5,.76)]), fill='white', width=max(2,int(size*scale*.065)))
    for x,y in [(.25,.28),(.75,.28),(.5,.5),(.5,.76)]:
        rad=size*scale*.08; cx=x*size*scale;cy=y*size*scale
        d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad),fill='white')
    im.resize((size,size),Image.Resampling.LANCZOS).save(root/f'icon{size}.png')
