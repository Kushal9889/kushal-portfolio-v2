"""Text contrast over the live film.

    python3 scripts/film-contrast.py                     1280, 1440 and 1920 wide
    python3 scripts/film-contrast.py --width 1440 --only hero T3

At 20 stops per width (every section and transit window, then the page end),
with the camera arrived:

1. Every visible text run is measured against the pixels behind it. The page
   is shot once with all text made transparent, so the backdrop is exactly
   what the reader's text sits on, film included. The backdrop value is the
   95th percentile of luminance inside the run's box (the brightest thing that
   passes behind it, ignoring a stray antialiased pixel). Contrast must be at
   least 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold).
2. Under text that sits straight on the film (no ancestor paints a ground)
   the backdrop luminance must stay at or under 0.02 everywhere inside the box.

Exits 1 on any failure.
"""

import argparse
import base64
import io
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ANCHORS = ["hero", "T1", "work", "T2", "opensource", "T3", "research", "T4", "approach", "T5",
           "measured", "T6", "running", "T7", "proof", "T8", "education", "T9", "contact", "end"]

LOCATE = """(a) => {
  if (a === 'hero') return 0;
  if (a === 'end') return document.documentElement.scrollHeight - innerHeight;
  const el = document.querySelector(`[data-beat="${a}"]`) || document.getElementById(a) || document.querySelector(`[data-transit="${a}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const top = r.top + scrollY;
  return el.dataset.transit ? top + r.height / 2 - innerHeight / 2 : top - innerHeight / 3;
}"""

HIDE_TEXT = "* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }"

# Visible text runs: one per text node, with the colour it paints and the
# opacity it is painted at.
RUNS = """() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  // Computed colours come back in whatever space they were authored in
  // (lab, oklch, color-mix), so the canvas converts them to sRGB bytes.
  const g = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
  const parse = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  // Text whose backdrop is the film: nothing between it and the page paints.
  const onFilm = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') return false;
    }
    return true;
  };
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('[aria-hidden="true"], svg, script, style, noscript, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    // Closed <details> content still reports a box to a Range but is never painted.
    if (!el.checkVisibility({contentVisibilityAuto: true, visibilityProperty: true})) continue;
    // Screen-reader-only text (a 1 px clipped box) is read aloud, never painted.
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1 || cs.clipPath === 'inset(50%)') continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // Text under another element (the fixed dock, an open overlay) is not seen.
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (hit && !el.contains(hit) && !hit.contains(el)) continue;
    let op = 1;
    for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
    if (op < 0.05) continue;
    const color = parse(cs.color);
    if (color[3] === 0) continue;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    out.push({
      text: n.textContent.trim().slice(0, 40),
      box: [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)],
      color, op, large: size >= 24 || (size >= 18.66 && weight >= 700),
      film: onFilm(el),
    });
  }
  return out;
}"""


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = (lin(v) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def shoot(cdp):
    data = cdp.send("Page.captureScreenshot", {"format": "png"})["data"]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def backdrop(img, box):
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    crop = img.crop((x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)))
    # Subsample big boxes; a text box's backdrop varies slowly.
    step = max(1, int((crop.width * crop.height / 4000) ** 0.5))
    px = [crop.getpixel((i, j)) for i in range(0, crop.width, step) for j in range(0, crop.height, step)]
    ls = sorted((lum(p), p) for p in px)
    return ls[int(len(ls) * 0.95) if len(ls) > 1 else 0], ls[-1]


def run(width, url, only, dump=None):
    fails, worst, scrim_worst, count = [], None, 0.0, 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 900}, color_scheme="dark", device_scale_factor=1)
        page.goto(url)
        page.wait_for_timeout(2500)
        page.mouse.move(10, 10)
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=20000)
        cdp = page.context.new_cdp_session(page)
        for stop in only or ANCHORS:
            y = page.evaluate(LOCATE, stop)
            if y is None:
                fails.append(f"{width} {stop}: missing")
                continue
            page.evaluate("(y) => scrollTo({top: y, behavior: 'instant'})", y)
            page.wait_for_timeout(400)
            try:
                page.wait_for_function("window.__film && window.__film.moving === false", timeout=10000)
            except Exception:
                pass
            page.wait_for_timeout(400)  # entrances start
            # Steady state: the console's streaming scanlines (older than the
            # film, tracked separately) lift its labels' backdrop while it runs.
            try:
                page.wait_for_function("document.documentElement.dataset.streaming !== 'yes'", timeout=15000)
            except Exception:
                pass
            # Entrances fade text in; measure once every run's opacity has
            # settled, not after a fixed wait (a busy machine runs them slower).
            runs = page.evaluate(RUNS)
            for _ in range(20):
                page.wait_for_timeout(250)
                again = page.evaluate(RUNS)
                if [r["op"] for r in again] == [r["op"] for r in runs]:
                    break
                runs = again
            tag = page.add_style_tag(content=HIDE_TEXT)
            page.wait_for_timeout(100)
            img = shoot(cdp)
            tag.evaluate("t => t.remove()")
            if dump:
                img.save(f"{dump}/contrast-{width}-{stop}.png")
            for r in runs:
                (lb, bg), (lmax, _) = backdrop(img, r["box"])
                cr, cg, cb, ca = r["color"]
                a = ca * r["op"]
                text = [cr * a + bg[k] * (1 - a) for k, cr in enumerate((cr, cg, cb))]
                lt = lum(text)
                ratio = (max(lt, lb) + 0.05) / (min(lt, lb) + 0.05)
                need = 3.0 if r["large"] else 4.5
                count += 1
                if worst is None or ratio / need < worst[0] / worst[1]:
                    worst = (ratio, need, stop, r["text"])
                if ratio < need:
                    fails.append(f"{width} {stop}: {ratio:.2f}:1 < {need} for '{r['text']}' at {[round(v) for v in r['box']]}")
                if r["film"]:
                    scrim_worst = max(scrim_worst, lmax)
                    if lmax > 0.02 + 0.002:
                        fails.append(f"{width} {stop}: scrim backdrop luminance {lmax:.4f} > 0.02 under '{r['text']}'")
        browser.close()
    print(f"== {width}px: {count} text runs, worst {worst[0]:.2f}:1 (needs {worst[1]}) at {worst[2]} '{worst[3]}', worst scrim backdrop {scrim_worst:.4f}")
    return fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3002/classic?film=debug")
    ap.add_argument("--width", type=int, nargs="*", default=[1280, 1440, 1920])
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--dump", help="save each text-hidden backdrop frame here")
    args = ap.parse_args()
    fails = []
    for w in args.width:
        fails += run(w, args.url, args.only, args.dump)
    for f in fails[:40]:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
