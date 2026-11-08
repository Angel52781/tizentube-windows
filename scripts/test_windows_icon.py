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
    bitmap = data[offset:offset + length]
    assert struct.unpack_from('<IiiHHI', bitmap) == (40, width, height * 2, 1, 32, 0)
    mask_stride = ((width + 31) // 32) * 4
    assert len(bitmap) == 40 + width * height * 4 + height * mask_stride
    # BGRA pixels run bottom-up, with a separate AND transparency mask.
    assert bitmap[40 + (height - 1) * width * 4 + 3] == 0
    middle = 40 + ((height - 1) - height // 2) * width * 4 + width // 2 * 4
    assert bitmap[middle + 3] == 255
    assert bitmap[40 + width * height * 4] & 0x80  # bottom-left transparent
    sizes.append(width)
assert sizes == [16, 24, 32, 48, 64, 128, 256], sizes
print('PASS approved icon source, vector companion, transparent corners and 7 DPI sizes')
