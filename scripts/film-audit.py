"""One-go audit of the whole film (D53): the page at every 1 percent of its
scroll, each frame captured with the ?hud=1 readout (section, progress, clip,
clip time and frame), tiled into sheets. Point at any tile by its label.

    python3 scripts/film-audit.py [--steps 100] [--out ~/Downloads/film-audit]
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import argparse
import os

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--out", default=os.path.expanduser("~/Downloads/film-audit"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tiles = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        page.goto(ORIGIN + "/classic?film=debug&hud=1")
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        page.wait_for_timeout(3000)
        top = page.evaluate("document.documentElement.scrollHeight - innerHeight")
        for i in range(a.steps + 1):
            page.evaluate("(y) => scrollTo({top: y, behavior: 'instant'})", top * i / a.steps)
            page.wait_for_timeout(260)
            path = os.path.join(a.out, f"frame-{i:03d}.jpg")
            page.screenshot(path=path, type="jpeg", quality=80)
            tiles.append((i, path))
        b.close()
    # Sheets of 25 (5 x 5), each tile labelled with its page percent.
    w, h = 480, 300
    for s in range(0, len(tiles), 25):
        sheet = Image.new("RGB", (w * 5, h * 5))
        draw = ImageDraw.Draw(sheet)
        for k, (i, path) in enumerate(tiles[s:s + 25]):
            im = Image.open(path).resize((w, h))
            sheet.paste(im, ((k % 5) * w, (k // 5) * h))
            draw.rectangle([(k % 5) * w, (k // 5) * h, (k % 5) * w + 58, (k // 5) * h + 20], fill=(0, 0, 0))
            draw.text(((k % 5) * w + 4, (k // 5) * h + 4), f"{i}%", fill=(255, 255, 255))
        sheet.save(os.path.join(a.out, f"sheet-{s // 25 + 1}.jpg"), quality=82)
    print(f"{len(tiles)} frames and {(len(tiles) + 24) // 25} sheets in {a.out}")


if __name__ == "__main__":
    main()
