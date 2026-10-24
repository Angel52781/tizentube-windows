#!/usr/bin/env python3
"""Generate a crisp 256px, source-available Windows icon without Pillow.

Artwork: dark rounded tile, turquoise open orbital ring and white play glyph.
The glyph is original; no Google/YouTube trademark or external artwork.
GPL-3.0-only; Copyright (C) 2026 TizenTube Windows Contributors.
"""
from pathlib import Path
import math
import struct
import zlib


def rounded(x, y, left, top, right, bottom, radius):
    if not (left <= x < right and top <= y < bottom):
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def sample(x, y):
    if not rounded(x, y, 4, 4, 252, 252, 55):
        return (0, 0, 0, 0)

    # Deep-blue matte tile, soft edge; visible on both light and dark desktop.
    pixel = (14, 20, 31, 255)
    if rounded(x, y, 7, 7, 249, 249, 52):
        pixel = (19, 26, 40, 255)
    dx, dy = x - 128, y - 128
    r = math.hypot(dx, dy)
    angle = math.atan2(dy, dx)
    # Open ring suggests the letter C, a control/playback orbit.
    if 74 <= r <= 90 and abs(angle) > 0.45:
        pixel = (32, 195, 207, 255)
    # High-contrast forward play mark. No red pill or duplicate YouTube logo.
    if 106 <= x <= 171 and abs(y - 128) <= (171 - x) * 37 / 63:
        pixel = (249, 251, 255, 255)
    return pixel


def build_png(size=256):
    rows = []
    for y in range(size):
        row = bytearray(b'\0')
        for x in range(size):
            # 2x2 supersampling provides clean Windows taskbar 16/32px scaling.
            pixels = [
                sample(x + sx, y + sy)
                for sy in (0.25, 0.75)
                for sx in (0.25, 0.75)
            ]
            row.extend(sum(p[i] for p in pixels) // 4 for i in range(4))
        rows.append(bytes(row))

    def chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload +
                struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))

    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b''.join(rows), level=9)) +
            chunk(b'IEND', b''))


def main():
    root = Path(__file__).resolve().parent.parent
    png = build_png()
    header = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22)
    output = root / 'assets' / 'TizenTube.ico'
    output.write_bytes(header + entry + png)
    print(f'Built original Windows icon: {output.name} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
