#!/usr/bin/env python3
"""
K11 OMNI ELITE — Gerador de Ícones PWA
Gera todos os tamanhos de ícone necessários via Pillow.
Instale: pip install pillow
"""

import os
import struct
import zlib

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUTPUT_DIR = 'icons'

# ── Gera PNG minimalista sem Pillow (PNG puro via bytes) ──────

def make_png(size):
    """
    Gera um PNG quadrado com o logo K11 OMNI em laranja (#FF8C00)
    usando apenas stdlib Python — sem dependências.
    """
    w = h = size

    # Cria pixels: fundo escuro (#090A0F) + hexágono laranja + texto
    pixels = []
    cx = w / 2
    cy = h / 2
    r_outer = w * 0.42
    r_inner = w * 0.30
    stroke  = max(2, int(w * 0.04))

    import math

    def in_hexagon(x, y, cx, cy, r, stroke=0):
        dx = x - cx
        dy = y - cy
        dist = math.sqrt(dx*dx + dy*dy)
        if dist > r + stroke: return False
        # Check hexagon shape
        angle = math.atan2(dy, dx)
        seg = math.pi / 3
        aligned = (angle + math.pi/6) % seg - seg/2
        hex_r = r * math.cos(math.pi/6) / math.cos(aligned)
        return dist <= hex_r + stroke

    def in_letter_K(x, y, cx, cy, size):
        # Letra K simplificada
        lw = size * 0.06
        lh = size * 0.28
        ox = cx - size * 0.08
        oy = cy - lh / 2

        # Haste vertical
        if ox <= x <= ox + lw and oy <= y <= oy + lh:
            return True
        # Braço superior (diagonal de cima)
        for t in range(100):
            tt = t / 100
            bx = ox + lw + tt * (size * 0.12)
            by = oy + lh * 0.5 - tt * lh * 0.45
            if abs(x - bx) < lw * 0.8 and abs(y - by) < lw * 0.8:
                return True
        # Braço inferior (diagonal de baixo)
        for t in range(100):
            tt = t / 100
            bx = ox + lw + tt * (size * 0.12)
            by = oy + lh * 0.5 + tt * lh * 0.45
            if abs(x - bx) < lw * 0.8 and abs(y - by) < lw * 0.8:
                return True
        return False

    # Cores
    BG        = (9,   10,  15,  255)
    ORANGE    = (255, 140, 0,   255)
    DARK_HEX  = (20,  23,  31,  255)
    WHITE     = (240, 240, 240, 255)

    for y in range(h):
        row = []
        for x in range(w):
            # Hexágono (borda laranja)
            if in_hexagon(x, y, cx, cy, r_outer, stroke) and not in_hexagon(x, y, cx, cy, r_outer - stroke, 0):
                row.extend(ORANGE)
            # Interior do hexágono (fundo escuro)
            elif in_hexagon(x, y, cx, cy, r_outer - stroke, 0):
                if in_letter_K(x, y, cx, cy, w):
                    row.extend(ORANGE)
                else:
                    row.extend(DARK_HEX)
            else:
                row.extend(BG)
        pixels.append(bytes(row))

    def make_png_bytes(pixels, w, h):
        def chunk(name, data):
            c = zlib.crc32(name + data) & 0xFFFFFFFF
            return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

        raw = b''
        for row in pixels:
            raw += b'\x00' + row  # filter type none

        ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        idat = zlib.compress(raw, 9)

        return (
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', idat)
            + chunk(b'IEND', b'')
        )

    return make_png_bytes(pixels, w, h)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("╔════════════════════════════════════╗")
    print("║  K11 OMNI — Gerador de Ícones PWA  ║")
    print("╚════════════════════════════════════╝\n")

    # Tenta usar Pillow primeiro (qualidade maior)
    try:
        from PIL import Image, ImageDraw
        print("✅ Pillow detectado — gerando ícones de alta qualidade\n")
        _generate_with_pillow(OUTPUT_DIR)
    except ImportError:
        print("⚠ Pillow não instalado — usando gerador nativo\n")
        print("  (Para melhor qualidade: pip install pillow)\n")
        _generate_native(OUTPUT_DIR)

    print("\n✨ Ícones gerados em:", os.path.abspath(OUTPUT_DIR))
    print("\nPróximos passos:")
    print("  1. Copie a pasta 'icons/' para o mesmo diretório do dashboard.html")
    print("  2. Copie manifest.json para o mesmo diretório")
    print("  3. Copie sw.js para o mesmo diretório")
    print("  4. Use o dashboard.html atualizado\n")


def _generate_with_pillow(out_dir):
    from PIL import Image, ImageDraw, ImageFont
    import math

    for size in SIZES:
        img = Image.new('RGBA', (size, size), (9, 10, 15, 255))
        draw = ImageDraw.Draw(img)

        # Hexágono
        cx = cy = size / 2
        r = size * 0.42
        pts = []
        for i in range(6):
            angle = math.radians(60 * i - 30)
            pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))

        # Fundo escuro do hexágono
        draw.polygon(pts, fill=(20, 23, 31, 255))
        # Borda laranja
        draw.polygon(pts, outline=(255, 140, 0, 255), width=max(2, size // 20))

        # Texto "K11"
        font_size = int(size * 0.30)
        try:
            font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
        except:
            try:
                font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
            except:
                font = ImageFont.load_default()

        text = 'K11'
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (size - tw) / 2 - bbox[0]
        ty = (size - th) / 2 - bbox[1]
        draw.text((tx, ty), text, fill=(255, 140, 0, 255), font=font)

        path = os.path.join(out_dir, f'icon-{size}.png')
        img.save(path, 'PNG')
        print(f"  ✅ icon-{size}.png")


def _generate_native(out_dir):
    for size in SIZES:
        png_bytes = make_png(size)
        path = os.path.join(out_dir, f'icon-{size}.png')
        with open(path, 'wb') as f:
            f.write(png_bytes)
        print(f"  ✅ icon-{size}.png ({len(png_bytes)} bytes)")


if __name__ == '__main__':
    main()
