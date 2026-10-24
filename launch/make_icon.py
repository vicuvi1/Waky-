"""Draw the Waky icon (same design as app/static/icon.svg) into launch/waky.ico. No dependencies."""

import math
import struct
import zlib
from pathlib import Path

SIZES = [16, 24, 32, 48, 64, 128, 256]
SS = 4  # Supersampling per axis, for smooth edges.


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


BG_TOP, BG_BOTTOM = hex_rgb("#22160f"), hex_rgb("#0c0c10")
SUN_TOP, SUN_BOTTOM = hex_rgb("#ffc35c"), hex_rgb("#ff7a33")
RAY, HORIZON = hex_rgb("#ffb547"), hex_rgb("#f4f4f6")
RAYS = [((32, 13), (32, 18)), ((15, 22), (18.5, 25.5)), ((49, 22), (45.5, 25.5))]


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def sample(x, y):
    """Colour and alpha of the 64x64 design at (x, y)."""
    if not in_rounded_rect(x, y, 0, 0, 64, 64, 15):
        return None
    if in_rounded_rect(x, y, 12, 42.5, 52, 46, 1.75):
        return HORIZON
    if y < 40 and (x - 32) ** 2 + (y - 40) ** 2 <= 15 * 15:
        return mix(SUN_TOP, SUN_BOTTOM, (y - 25) / 15)
    if any(seg_dist(x, y, a, b) <= 1.5 for a, b in RAYS):
        return RAY
    return mix(BG_TOP, BG_BOTTOM, y / 64)


def render(n):
    rows = []
    scale = 64 / n
    for py in range(n):
        row = bytearray([0])  # PNG filter byte
        for px in range(n):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    c = sample((px + (sx + 0.5) / SS) * scale, (py + (sy + 0.5) / SS) * scale)
                    if c:
                        r, g, b, a = r + c[0], g + c[1], b + c[2], a + 1
            if a:
                row += bytes([round(r / a), round(g / a), round(b / a), round(255 * a / SS ** 2)])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return png(n, b"".join(rows))


def png(n, raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    images = [render(n) for n in SIZES]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for n, data in zip(SIZES, images):
        entries += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    out = Path(__file__).with_name("waky.ico")
    out.write_bytes(header + entries + b"".join(images))
    Path(__file__).with_name("waky-256.png").write_bytes(images[-1])
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
