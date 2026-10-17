# Recorta as peças das imagens geradas no Gemini (tools/gemini/<conjunto>.jpeg, fundo verde chroma)
# e grava pieces/<conjunto>/<cor><peça>.webp. Brancas vêm da fileira de cima e pretas da de baixo.
# Uso: python3 tools/extrair-pecas.py [pasta-para-folha-de-contato]
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'gemini'
OUT = ROOT / 'pieces'
SIZE = 256          # lado do sprite quadrado
TYPES = ['k', 'q', 'r', 'b', 'n', 'p']
# altura mínima de cada peça em relação à casa: num tabuleiro digital as peças menores precisam
# ocupar a casa, então a diferença de altura entre rei e peão é comprimida
MIN_HEIGHT = {'k': 0.92, 'q': 0.88, 'r': 0.80, 'b': 0.84, 'n': 0.84, 'p': 0.72}

# Se uma imagem vier com mais de 6 peças por fileira, informe aqui as posições (0 = mais à esquerda)
# de rei, dama, torre, bispo, cavalo e peão, ex.: {'w': [0, 1, 3, 4, 5, 7], 'b': [...]}.
# As imagens anteriores (peças estreitas) ficaram em tools/gemini/estreitas/.
SETS = {
    'moderno':    {},
    'facetado':   {},
    'medieval':   {},
    'futurista':  {},
    'vintage':    {},
    'geometrico': {},
    'digital':    {},
}


def key_alpha(rgb):
    """Alfa pela distância do verde: quanto o G passa do maior entre R e B."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    spill = g - np.maximum(r, b)
    h, w = spill.shape
    border = np.concatenate([spill[:4].ravel(), spill[-4:].ravel(), spill[:, :4].ravel(), spill[:, -4:].ravel()])
    bg = np.median(border)                      # quanto o fundo é "verde" (~200 no #00FF00)
    lo, hi = bg * 0.30, bg * 0.62               # abaixo de lo é peça, acima de hi é fundo
    return np.clip((hi - spill) / (hi - lo), 0, 1)


def despill(rgb):
    """Tira o reflexo verde das bordas e das superfícies: G não passa do maior entre R e B."""
    out = rgb.copy()
    out[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 6)
    return out


def runs(mask_1d, min_gap, min_len):
    """Trechos contínuos de True, juntando buracos menores que min_gap."""
    idx = np.nonzero(mask_1d)[0]
    if not len(idx):
        return []
    out, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > min_gap:
            out.append((start, prev + 1))
            start = i
        prev = i
    out.append((start, prev + 1))
    return [r for r in out if r[1] - r[0] >= min_len]


def split_pieces(alpha):
    h, w = alpha.shape
    solid = alpha > 0.5
    rows = solid.sum(axis=1)
    # divide as fileiras pela linha mais vazia perto do meio da imagem
    mid = h // 2
    window = rows[int(h * 0.3):int(h * 0.7)]
    cut = int(h * 0.3) + int(np.argmin(window)) if len(window) else mid
    out = {}
    for color, (y0, y1) in (('w', (0, cut)), ('b', (cut, h))):
        band = solid[y0:y1]
        cols = band.sum(axis=0) > 2
        pieces = []
        for x0, x1 in runs(cols, min_gap=3, min_len=12):
            ys = np.nonzero(band[:, x0:x1].any(axis=1))[0]
            pieces.append((x0, y0 + ys.min(), x1, y0 + ys.max() + 1))
        out[color] = pieces
    return out


def clean_alpha(a):
    a = a.copy()
    a[a < 0.06] = 0
    return a


def extract_set(name, picks, sheet_rows):
    path = next((p for p in (SRC / f'{name}.jpeg', SRC / f'{name}.jpg', SRC / f'{name}.png') if p.exists()), None)
    if not path:
        print('falta', name)
        return
    img = Image.open(path).convert('RGB')
    rgb = np.asarray(img, np.float32)
    alpha = key_alpha(rgb)
    color_rgb = despill(rgb)
    boxes = split_pieces(alpha)
    chosen = {}
    for color in ('w', 'b'):
        found = boxes[color]
        order = picks.get(color, list(range(6)))
        if len(found) <= max(order):
            raise SystemExit(f'{name}/{color}: achei {len(found)} peças, esperava posições {order}')
        chosen[color] = [found[i] for i in order]
    tallest = max(y1 - y0 for c in chosen.values() for (_, y0, _, y1) in c)
    widest = max(x1 - x0 for c in chosen.values() for (x0, _, x1, _) in c)
    # a peça mais alta ocupa 92% da casa, sem que a mais larga passe de 94%
    scale = min(SIZE * 0.92 / tallest, SIZE * 0.94 / widest)
    (OUT / name).mkdir(parents=True, exist_ok=True)
    row = []
    for color in ('w', 'b'):
        for t, (x0, y0, x1, y1) in zip(TYPES, chosen[color]):
            pad = 3
            x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
            x1, y1 = min(rgb.shape[1], x1 + pad), min(rgb.shape[0], y1 + pad)
            a = clean_alpha(alpha[y0:y1, x0:x1])
            rgba = np.dstack([np.clip(color_rgb[y0:y1, x0:x1], 0, 255), a * 255]).astype(np.uint8)
            sprite = Image.fromarray(rgba, 'RGBA')
            sw, sh = sprite.size
            s_piece = max(scale, SIZE * MIN_HEIGHT[t] / sh)
            s_piece = min(s_piece, SIZE * 0.94 / sw, SIZE * 0.95 / sh)
            sprite = sprite.resize((max(1, round(sw * s_piece)), max(1, round(sh * s_piece))), Image.LANCZOS)
            canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
            canvas.alpha_composite(sprite, ((SIZE - sprite.width) // 2, SIZE - sprite.height - round(SIZE * 0.03)))
            canvas.save(OUT / name / f'{color}{t}.webp', 'WEBP', quality=90, method=6)
            row.append(canvas)
    sheet_rows.append(row)
    print('ok', name, {c: len(boxes[c]) for c in boxes})


def main():
    rows = []
    only = [a for a in sys.argv[2:]]
    for name, picks in SETS.items():
        if only and name not in only:
            continue
        extract_set(name, picks, rows)
    if len(sys.argv) > 1 and rows:
        cell = 128
        sheet = Image.new('RGB', (cell * 12, cell * len(rows)))
        for r, row in enumerate(rows):
            for c, sp in enumerate(row):
                bgc = (235, 229, 209) if (r + c) % 2 == 0 else (134, 161, 139)
                tile = Image.new('RGBA', (cell, cell), bgc + (255,))
                tile.alpha_composite(sp.resize((cell, cell), Image.LANCZOS))
                sheet.paste(tile.convert('RGB'), (c * cell, r * cell))
        sheet.save(Path(sys.argv[1]) / 'folha-pecas.png')


if __name__ == '__main__':
    main()
