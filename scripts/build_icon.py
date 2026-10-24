#!/usr/bin/env python3
"""Build an original minimal player-window glyph at all Windows icon sizes.

No third-party fonts, textures, brands or runtime dependencies. The glyph has
a deep navy tile, cyan screen frame and high-contrast forward white play.
It matches assets/TizenTube.svg (the editable source of the artwork).
"""
from pathlib import Path
import struct
import zlib

SIZES = (16, 24, 32, 48, 64, 128, 256)


def rounded(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2


def sample(x, y):
    if not rounded(x, y, 6, 6, 250, 250, 54):
        return (0, 0, 0, 0)
    # Matte blue/black background with a large, recognisable focal glyph.
    color = (17, 25, 40, 255)
    # Framed player window, not a copy of YouTube's brand or a circular arrow.
    if rounded(x, y, 61, 69, 195, 187, 29) and not rounded(
        x, y, 76, 84, 180, 172, 19
    ):
        color = (35, 203, 212, 255)
    # Play triangle remains legible in the small Windows taskbar icon.
    if 108 <= x <= 164 and abs(y - 128) <= (164 - x) * 0.55:
        color = (248, 251, 255, 255)
    return color


def encode_png(size):
    scanlines = []
    for row in range(size):
        line = bytearray(b'\0')
        for col in range(size):
            channels = [0, 0, 0, 0]
            for sy in range(4):
                for sx in range(4):
                    pixel = sample((col + (sx + 0.5) / 4) * 256 / size,
                                   (row + (sy + 0.5) / 4) * 256 / size)
                    for i in range(4):
                        channels[i] += pixel[i]
            line.extend(v // 16 for v in channels)
        scanlines.append(line)

    def chunk(kind, data):
        return (struct.pack('>I', len(data)) + kind + data +
                struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff))

    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b''.join(scanlines), 9)) +
            chunk(b'IEND', b''))


def main():
    output = Path(__file__).resolve().parent.parent / 'assets' / 'TizenTube.ico'
    images = [encode_png(size) for size in SIZES]
    offset = 6 + len(images) * 16
    table = []
    for size, png in zip(SIZES, images):
        table.append(struct.pack('<BBBBHHII', size % 256, size % 256,
                                 0, 0, 1, 32, len(png), offset))
        offset += len(png)
    output.write_bytes(struct.pack('<HHH', 0, 1, len(images)) +
                       b''.join(table) + b''.join(images))
    print(f'[OK] {output}: Windows icon sizes {SIZES}')


if __name__ == '__main__':
    main()
