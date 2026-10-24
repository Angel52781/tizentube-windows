#!/usr/bin/env python3
"""Validate the real app icon has all Windows DPI sizes and editable source."""
from pathlib import Path
import struct
import zlib

root = Path(__file__).resolve().parent.parent
source = (root / 'assets' / 'TizenTube.svg').read_text()
assert 'player window icon' in source and '#23cbd4' in source
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
    sizes.append(width)
assert sizes == [16, 24, 32, 48, 64, 128, 256], sizes
print('PASS original 7-resolution Windows icon and matching editable SVG source')
