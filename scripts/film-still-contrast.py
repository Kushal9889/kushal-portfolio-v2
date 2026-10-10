"""Contrast of every text box over the still-frame fallback (ADR-001, gap G18).

    FILM_ORIGIN=http://localhost:3003 python3 scripts/film-still-contrast.py

film-contrast.py samples the live film and does not fit the still, which is one
fixed picture under a veil. Here each screen is shot twice: as is, then with all
text made transparent, so the second shot is the ground. For each text box on
screen the 90th-percentile ground pixel inside its glyph band is compared with the
text colour; text covered by a sticky element is skipped. Body text must reach
7:1 (AAA), text 24px and up or 18.66px bold 4.5:1. Exit 1 on any failure.
"""

import io
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
URL = ORIGIN + "/classic?film=still"

BOXES = """() => {
  const out = [];
  // Any CSS colour (oklch, color-mix results) to sRGB bytes, by painting it.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgb = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('[aria-hidden="true"], svg, canvas, img, video')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 4 || r.height < 6 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
      // Text under a sticky header or the dock is not what the eye reads.
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, color: rgb(cs.color), size: parseFloat(cs.fontSize), weight: +cs.fontWeight, text: n.textContent.trim().slice(0, 40) });
    }
  }
  return out;
}"""

HIDE = "html, html * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; caret-color: transparent !important; }"


def lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def main():
    fails, worst = [], (99.0, "")
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome")
        for w, h in ((390, 844), (1440, 900)):
            page = b.new_page(viewport={"width": w, "height": h}, color_scheme="dark", reduced_motion="reduce")
            page.goto(URL, wait_until="networkidle", timeout=120000)
            page.wait_for_function("document.documentElement.dataset.film === 'still'", timeout=60000)
            # Open every disclosure so folded text is measured too.
            page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
            total = page.evaluate("document.documentElement.scrollHeight")
            y = 0
            while y < total:
                page.evaluate(f"scrollTo(0, {y})")
                page.wait_for_timeout(250)
                boxes = page.evaluate(BOXES)
                tag = page.add_style_tag(content=HIDE)
                ground = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
                page.evaluate("t => t.remove()", tag)
                for bx in boxes:
                    ink = tuple(bx["color"])
                    # Trim the line box to the glyph band: a link's 2px underline and
                    # the next line's ascenders sit in its top and bottom fifth.
                    t = bx["h"] * 0.2
                    crop = ground.crop((max(0, int(bx["x"])), max(0, int(bx["y"] + t)), min(w, int(bx["x"] + bx["w"])), min(h, int(bx["y"] + bx["h"] - t))))
                    if crop.width < 2 or crop.height < 2:
                        continue
                    # 90th percentile, not the single brightest pixel: one hot
                    # pixel of JPEG noise does not decide what a word sits on.
                    ls = sorted(lum(p) for p in crop.get_flattened_data())
                    lg = ls[int(len(ls) * 0.9)]
                    li = lum(ink)
                    ratio = (max(li, lg) + 0.05) / (min(li, lg) + 0.05)
                    large = bx["size"] >= 24 or (bx["size"] >= 18.66 and bx["weight"] >= 700)
                    need = 4.5 if large else 7.0
                    if ratio < worst[0]:
                        worst = (ratio, f"{w}px y{y} '{bx['text']}'")
                    if ratio < need:
                        fails.append(f"{w}px y{y + int(bx['y'])}: {ratio:.2f} < {need} '{bx['text']}'")
                y += h - 80
            page.close()
        b.close()
    print(f"worst {worst[0]:.2f} at {worst[1]}")
    for f in fails[:25]:
        print("FAIL", f)
    print("PASS" if not fails else f"FAIL {len(fails)} text boxes")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
