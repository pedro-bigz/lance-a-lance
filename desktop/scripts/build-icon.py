# Gera build/icon.png (1024x1024): cavalo branco sobre quadrado verde arredondado.
# O electron-builder converte esse PNG em .icns (macOS) e .ico (Windows).
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
KNIGHT = '♞'
FONTS = [
    ROOT / 'vendor' / 'fonts' / 'NotoSansSymbols2-400-symbols.woff2',
    Path('/System/Library/Fonts/Apple Symbols.ttf'),
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
]


def load_font(px):
    for f in FONTS:
        try:
            return ImageFont.truetype(str(f), px)
        except Exception:
            continue
    raise SystemExit('Nenhuma fonte com o símbolo do cavalo foi encontrada.')


img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
pad = 92
# fundo: verde do app com uma casa clara no canto, lembrando o tabuleiro
d.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=190, fill=(44, 106, 84, 255))
cell = (SIZE - 2 * pad) // 2
mask = Image.new('L', (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=190, fill=255)
board = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
bd = ImageDraw.Draw(board)
bd.rectangle([pad + cell, pad, SIZE - pad, pad + cell], fill=(134, 161, 139, 255))
bd.rectangle([pad, pad + cell, pad + cell, SIZE - pad], fill=(134, 161, 139, 255))
img.paste(board, (0, 0), Image.composite(board, Image.new('RGBA', (SIZE, SIZE)), mask).split()[3])

font = load_font(700)
box = d.textbbox((0, 0), KNIGHT, font=font)
w, h = box[2] - box[0], box[3] - box[1]
x, y = (SIZE - w) / 2 - box[0], (SIZE - h) / 2 - box[1]
d.text((x + 10, y + 18), KNIGHT, font=font, fill=(0, 0, 0, 90))
d.text((x, y), KNIGHT, font=font, fill=(251, 251, 248, 255), stroke_width=14, stroke_fill=(24, 32, 27, 255))

out = ROOT / 'build'
out.mkdir(exist_ok=True)
img.save(out / 'icon.png')
print('build/icon.png gerado')
