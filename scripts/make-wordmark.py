#!/usr/bin/env python3
"""
Genera la variante solo-wordmark del logo de marca recortando el bloque superior
("ia.es") del logo transparente, por análisis del canal alfa, y lo recolorea al
look lima: letras en #F4F4F6 y el punto en lima #C6FF3D (el logo fuente lo trae
cian). Reproducible: re-ejecuta para regenerar el asset.

Uso: python3 scripts/make-wordmark.py
Salida: src/assets/ia_es_wordmark.png (+ imprime WIDTH,HEIGHT,ASPECT)
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "ia_es_logo_transparent.png"
OUT = ROOT / "src" / "assets" / "ia_es_wordmark.png"

ALPHA_TH = 16  # umbral para considerar un píxel "con contenido"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
alpha = img.getchannel("A")
px = alpha.load()

# Filas con contenido (al menos un píxel con alfa > umbral).
row_has = []
for y in range(h):
    has = False
    for x in range(0, w, 2):
        if px[x, y] > ALPHA_TH:
            has = True
            break
    row_has.append(has)

# Bandas = runs maximales de filas con contenido (cada letra/bloque puede ser una).
bands = []
y = 0
while y < h:
    if row_has[y]:
        s = y
        while y < h and row_has[y]:
            y += 1
        bands.append((s, y))
    else:
        y += 1

# El wordmark y el subtítulo están separados por el hueco vertical MÁS GRANDE.
# Todo lo que está por encima de ese hueco = wordmark (incluido el punto de la "i").
if len(bands) >= 2:
    gaps = [(bands[i + 1][0] - bands[i][1], i) for i in range(len(bands) - 1)]
    _, split_idx = max(gaps)  # índice de la banda tras la cual está el mayor hueco
    word_bands = bands[: split_idx + 1]
else:
    word_bands = bands
top = word_bands[0][0]
bottom = word_bands[-1][1]

# bbox horizontal dentro de la franja [top, bottom).
left, right = w, 0
for y in range(top, bottom):
    for x in range(w):
        if px[x, y] > ALPHA_TH:
            if x < left:
                left = x
            if x > right:
                right = x
right += 1

# Padding ~6% del alto del bloque.
pad = round(0.06 * (bottom - top))
left = max(0, left - pad)
right = min(w, right + pad)
top = max(0, top - pad)
bottom = min(h, bottom + pad)

crop = img.crop((left, top, right, bottom))

# Recolor: el punto es el único trazo saturado (cian, R bajo); las letras son
# gris claro. Se conserva el alfa (antialiasing) y se cambia solo el RGB.
TEXT = (0xF4, 0xF4, 0xF6)
LIME = (0xC6, 0xFF, 0x3D)
cp = crop.load()
for y in range(crop.size[1]):
    for x in range(crop.size[0]):
        r, g, b, a = cp[x, y]
        if a == 0:
            continue
        saturated = max(r, g, b) - min(r, g, b) > 60
        cp[x, y] = (*(LIME if saturated else TEXT), a)
crop.save(OUT)
cw, ch = crop.size
print(f"WIDTH,HEIGHT,ASPECT={cw},{ch},{cw / ch:.4f}")
