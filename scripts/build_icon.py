#!/usr/bin/env python3
"""Generate an original Windows icon for TizenTube without external dependencies.

Source design: assets/TizenTube.svg. Output: assets/TizenTube.ico (ignored).
GPL-3.0-only; Copyright (C) 2026 TizenTube Windows Contributors.
"""
from pathlib import Path
import struct
import zlib


def rounded(x, y, left, top, right, bottom, radius):
    if not (left <= x < right and top <= y < bottom):
        return False
    nearest_x = min(max(x, left + radius), right - radius)
    nearest_y = min(max(y, top + radius), bottom - radius)
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius * radius


def build_png(size=256):
    rows = []
    for y in range(size):
        row = bytearray(b'\0')
        for x in range(size):
            pixel = (0, 0, 0, 0)
            if rounded(x, y, 4, 4, 252, 252, 57):
                pixel = (17, 24, 39, 255)
            if rounded(x, y, 37, 67, 219, 189, 36):
                pixel = (232, 60, 89, 255)
            if 107 <= x <= 165 and 96 <= y <= 161:
                # The white play arrow from SVG: a triangle with tip at x=165.
                if abs(y - 128.5) <= (x - 107) * (32.5 / 58):
                    pixel = (255, 255, 255, 255)
            if 68 <= x <= 188 and abs(y - 203) <= 5:
                pixel = (55, 212, 197, 255)
            row.extend(pixel)
        rows.append(bytes(row))
    data = zlib.compress(b''.join(rows), level=9)

    def chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload
                + struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', data) + chunk(b'IEND', b''))


def main():
    root = Path(__file__).resolve().parent.parent
    png = build_png()
    # ICO with a PNG-compressed 256x256 image, supported by Windows 10/11.
    header = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22)
    output = root / 'assets' / 'TizenTube.ico'
    output.write_bytes(header + entry + png)
    print(f'Built Windows icon: {output.name} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
