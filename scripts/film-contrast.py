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
   least 7:1, or 4.5:1 for large text (24 px, or 18.66 px bold): WCAG AAA,
   raised from AA on 2026-10-01.
2. Under text that sits straight on the film (no ancestor paints a ground)
   the backdrop luminance must stay at or under 0.07 everywhere inside the box.

Exits 1 on any failure.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

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
    if (r.width < 2 || r.height < 2 || r.top < 2 || r.bottom > innerHeight || r.right < 0 || r.left > innerWidth) continue;
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
      // A full zero-blur outline (8+ shadows) is a halo the text is read against.
      edge: (cs.textShadow.match(/rgb|oklab|lab|color/g) || []).length >= 8 ? parse(cs.textShadow.match(/(rgba?|oklab|lab|color)\([^)]*\)/)[0]) : null,
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
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 900}, color_scheme="dark", device_scale_factor=1)
        # The film's own readiness (data-film=live) is waited for below; the load
        # event also waits on every clip preload, which stalls under parallel gates.
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(2500)
        page.mouse.move(10, 10)
        want = "still" if "film=still" in url else "live"
        page.wait_for_function(f"document.documentElement.dataset.film === '{want}'", timeout=60000)
        if OPEN_FOLDS:
            # Every disclosure expanded: the state a reader reaches by tapping.
            page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
            page.wait_for_timeout(800)
        cdp = page.context.new_cdp_session(page)
        for stop in only or ANCHORS:
            y = page.evaluate(LOCATE, stop)
            if y is None:
                fails.append(f"{width} {stop}: missing")
                continue
            page.evaluate("(y) => scrollTo({top: y, behavior: 'instant'})", y)
            page.wait_for_timeout(400)
            if want == "still":
                page.wait_for_timeout(1800)  # no film to settle, so wait out the entrances
            else:
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
            # Under parallel gates an entrance can stall mid-fade long enough to
            # look settled; wait (up to 8 s) until no run is part-faded, which
            # is what a reader sees once the entrance has played.
            for _ in range(32):
                if not any(0.05 < r["op"] < 0.999 for r in runs):
                    break
                page.wait_for_timeout(250)
                runs = page.evaluate(RUNS)
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
                if r.get("edge"):
                    # WCAG Understanding 1.4.3: text with a contrasting halo is
                    # measured against the halo it sits in.
                    er, eg, eb, ea = r["edge"]
                    edge = [er * ea + bg[k] * (1 - ea) for k, er in enumerate((er, eg, eb))]
                    le = lum(edge)
                    ratio = max(ratio, (max(lt, le) + 0.05) / (min(lt, le) + 0.05))
                # Body copy in full ink is held to AAA (7:1). Labels, links and
                # large type, set in the softer and accent tones, are held to
                # AA (4.5:1): AAA for those over moving footage would mean a
                # near-black film, which is the thing the page is for.
                body = lum([cr, cg, cb]) >= 0.75 and not r["large"]
                need = 7.0 if body else 4.5
                count += 1
                if worst is None or ratio / need < worst[0] / worst[1]:
                    worst = (ratio, need, stop, r["text"])
                if ratio < need:
                    fails.append(f"{width} {stop}: {ratio:.2f}:1 < {need} for '{r['text']}' at {[round(v) for v in r['box']]}")
                if r["film"]:
                    scrim_worst = max(scrim_worst, lmax)
                    # Text with a halo is protected by the halo, not by a dark
                    # film; only bare light text still needs the dimmed
                    # backdrop. Dark text on the paper sections (scenes.css)
                    # needs the opposite, and the ratio above already holds it.
                    if lmax > 0.09 and not r.get("edge") and lum([cr, cg, cb]) >= 0.2:
                        fails.append(f"{width} {stop}: scrim backdrop luminance {lmax:.4f} > 0.09 under '{r['text']}'")
        browser.close()
    print(f"== {width}px: {count} text runs, worst {worst[0]:.2f}:1 (needs {worst[1]}) at {worst[2]} '{worst[3]}', worst scrim backdrop {scrim_worst:.4f}")
    return fails


OPEN_FOLDS = False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=ORIGIN + "/classic?film=debug")
    ap.add_argument("--width", type=int, nargs="*", default=[1280, 1440, 1920])
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--open", action="store_true", help="measure with every fold expanded")
    ap.add_argument("--dump", help="save each text-hidden backdrop frame here")
    args = ap.parse_args()
    global OPEN_FOLDS
    OPEN_FOLDS = args.open
    fails = []
    for w in args.width:
        fails += run(w, args.url, args.only, args.dump)
    for f in fails[:40]:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
