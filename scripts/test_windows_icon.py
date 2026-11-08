#!/usr/bin/env python3
"""Verify the approved icon is generated from its source at every DPI size."""
from pathlib import Path
import struct
from build_icon import decode_png

root = Path(__file__).resolve().parent.parent
source = (root / 'assets' / 'TizenTube.svg').read_text()
assert 'official video player' in source and '#ff7662' in source
png = (root / 'assets' / 'TizenTube.png').read_bytes()
w, h, src = decode_png(png)
assert (w, h) == (1024, 1024)
assert src[3] == 0  # Top-left is transparent, not white.
assert src[(512 * 1024 + 512) * 4 + 3] == 255
data = (root / 'assets' / 'TizenTube.ico').read_bytes()
reserved, kind, count = struct.unpack_from('<HHH', data)
assert (reserved, kind, count) == (0, 1, 7)
sizes = []
for i in range(count):
    width, height, color, reserved, planes, depth, length, offset = struct.unpack_from(
        '<BBBBHHII', data, 6 + i * 16
    )
    width, height = width or 256, height or 256
    assert width == height and depth == 32
    assert data[offset:offset + 8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack_from('>II', data, offset + 16) == (width, height)
    icon_w, icon_h, icon_rgba = decode_png(data[offset:offset + length])
    assert (icon_w, icon_h) == (width, height)
    assert icon_rgba[3] == 0  # Transparent corners are preserved.
    assert icon_rgba[(height // 2 * width + width // 2) * 4 + 3] == 255
    sizes.append(width)
assert sizes == [16, 24, 32, 48, 64, 128, 256], sizes
print('PASS approved icon source, vector companion, transparent corners and 7 DPI sizes')
