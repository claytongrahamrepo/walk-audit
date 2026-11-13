"""Draw the app icon PNGs (map pin with a check mark). Run: python3 tools/make_icons.py"""
from PIL import Image, ImageDraw
import math, os
GREEN = (20, 83, 45, 255)
def icon(size):
    s = 4 * size                      # draw large, shrink for smooth edges
    k = s / 512.0
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(96 * k), fill=GREEN)
    cx, cy, r = 256 * k, 228 * k, 136 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    a = math.radians(35)
    d.polygon([(cx - r * math.cos(a), cy + r * math.sin(a)), (cx + r * math.cos(a), cy + r * math.sin(a)), (cx, 424 * k)], fill="white")
    d.line([(196 * k, 232 * k), (238 * k, 274 * k), (320 * k, 186 * k)], fill=GREEN, width=int(34 * k), joint="curve")
    for x, y in [(196, 232), (238, 274), (320, 186)]:
        d.ellipse([x * k - 17 * k, y * k - 17 * k, x * k + 17 * k, y * k + 17 * k], fill=GREEN)
    return im.resize((size, size), Image.LANCZOS)
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
for n in (180, 192, 512):
    icon(n).save(os.path.join(here, "icon-%d.png" % n))
print("icons written")
