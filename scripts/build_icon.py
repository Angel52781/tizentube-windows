#!/usr/bin/env python3
"""Build the official Windows .ico from the selected TizenTube PNG.

The approved artwork lives in assets/TizenTube.png (1024px, transparent
corners). Use only the Python standard library so every Windows CI runner
can regenerate the same 7-resolution icon without installing packages.
assets/TizenTube.svg is an editable vector interpretation of this artwork.
"""

from pathlib import Path
import struct
import zlib

SIZES = (16, 24, 32, 48, 64, 128, 256)
ROOT = Path(__file__).resolve().parent.parent


def png_chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def decode_png(data):
    """Decode a non-interlaced, 8-bit RGBA PNG; no external dependencies."""
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Icon source is not a PNG")
    offset = 8
    compressed = []
    width = height = 0
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("Icon source must be non-interlaced 8-bit RGBA")
        elif kind == b"IDAT":
            compressed.append(payload)
        elif kind == b"IEND":
            break
        offset += 12 + length
    if width <= 0 or height <= 0 or not compressed:
        raise ValueError("Missing PNG dimensions or pixel data")

    decoded = zlib.decompress(b"".join(compressed))
    stride = width * 4
    expected_length = height * (stride + 1)
    if len(decoded) != expected_length:
        raise ValueError("Unexpected PNG pixel buffer size")
    rows = bytearray(width * height * 4)
    previous = bytearray(stride)
    cursor = 0
    for y in range(height):
        filter_type = decoded[cursor]
        scanline = bytearray(decoded[cursor + 1:cursor + 1 + stride])
        cursor += stride + 1
        if filter_type not in (0, 1, 2, 3, 4):
            raise ValueError(f"Unsupported PNG filter: {filter_type}")
        if filter_type:
            for i in range(stride):
                left = scanline[i - 4] if i >= 4 else 0
                above = previous[i]
                upper_left = previous[i - 4] if i >= 4 else 0
                if filter_type == 1:
                    predictor = left
                elif filter_type == 2:
                    predictor = above
                elif filter_type == 3:
                    predictor = (left + above) // 2
                else:
                    estimate = left + above - upper_left
                    distances = (
                        abs(estimate - left),
                        abs(estimate - above),
                        abs(estimate - upper_left),
                    )
                    predictor = (left, above, upper_left)[distances.index(min(distances))]
                scanline[i] = (scanline[i] + predictor) & 255
        rows[y * stride:(y + 1) * stride] = scanline
        previous = scanline
    return width, height, bytes(rows)


def resize_rgba(width, height, pixels, size):
    """4x4 area samples; average premultiplied colors at transparent edges."""
    out = bytearray()
    for y in range(size):
        for x in range(size):
            alpha_total = red = green = blue = 0
            for sy in range(4):
                iy = min(height - 1, int((y + (sy + 0.5) / 4) * height / size))
                for sx in range(4):
                    ix = min(width - 1, int((x + (sx + 0.5) / 4) * width / size))
                    offset = (iy * width + ix) * 4
                    a = pixels[offset + 3]
                    alpha_total += a
                    red += pixels[offset] * a
                    green += pixels[offset + 1] * a
                    blue += pixels[offset + 2] * a
            if alpha_total:
                out.extend((
                    red // alpha_total,
                    green // alpha_total,
                    blue // alpha_total,
                    alpha_total // 16,
                ))
            else:
                out.extend((0, 0, 0, 0))
    return bytes(out)


def encode_png(size, pixels):
    scanlines = b"".join(
        b"\0" + pixels[y * size * 4:(y + 1) * size * 4]
        for y in range(size)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(scanlines, 9))
        + png_chunk(b"IEND", b"")
    )


def main():
    source = ROOT / "assets" / "TizenTube.png"
    width, height, pixels = decode_png(source.read_bytes())
    if (width, height) != (1024, 1024):
        raise ValueError("Official icon source must be 1024x1024")
    images = [encode_png(size, resize_rgba(width, height, pixels, size)) for size in SIZES]
    offset = 6 + len(images) * 16
    table = []
    for size, png in zip(SIZES, images):
        table.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0,
                                 1, 32, len(png), offset))
        offset += len(png)
    output = ROOT / "assets" / "TizenTube.ico"
    output.write_bytes(
        struct.pack("<HHH", 0, 1, len(images))
        + b"".join(table)
        + b"".join(images)
    )
    print(f"[OK] {output}: official icon, Windows sizes {SIZES}")


if __name__ == "__main__":
    main()
