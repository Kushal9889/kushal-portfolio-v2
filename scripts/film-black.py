"""One black: the film's empty frame is the page ground, and nothing on the page
meets the film with a visible step.

    python3 scripts/film-black.py                 1440 wide
    python3 scripts/film-black.py --width 1280 1920

1. Lights off. The page loads with ?lights=off, so the scene is empty and every
   film pixel is the black lock alone. With the page content hidden, every
   pixel of the viewport must be the ground within 1 code value per channel.
2. Seams. Still lights off, with the content visible: 40 points along the
   outer edges of every block that paints a ground over the film (section
   panels, the dock). The ground 6 px inside the edge and 6 px outside it
   must differ by at most 2 in OKLab (x100). Hairlines sit in the 6 px gap;
   the panel lid (6 px raised band and its hairline) is skipped by sampling 12 px
   inside a top edge.

Exits 1 on any failure. Needs the dev server on :3002.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import argparse
import base64
import io
import math
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HIDE = "body * { visibility: hidden !important; } [data-film-layer], [data-film-layer] * { visibility: visible !important; }"
# Seams compare fills, not letters: the seam frame is shot with every glyph
# transparent, so a patch beside an edge reads the ground or the block itself.
HIDE_TEXT = "* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }"
STOPS = ["hero", "T1", "work", "T3", "measured", "contact"]

LOCATE = """(a) => {
  if (a === 'hero') return 0;
  const el = document.querySelector(`[data-beat="${a}"]`) || document.getElementById(a) || document.querySelector(`[data-transit="${a}"]`);
  const r = el.getBoundingClientRect();
  return Math.max(0, r.top + scrollY - innerHeight / 3);
}"""

# Outer edges of the blocks that paint a ground over the film, in viewport px.
# A sample counts only where it lands on bare ground: inside, the block itself
# is the topmost element (no text or child on it); outside, the topmost
# element is a transparent container the film shows through.
EDGES = """() => {
  const out = [];
  const bare = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    if (el.matches('main, main > section, body, html, body > header, [data-transit]')) return true;
    // An image (a certificate plate) is content, not the ground.
    if (el.closest('img, picture, video, canvas, svg')) return false;
    // Glyphs are transparent in the seam frame, so an unpainted text element
    // shows the ground behind it.
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || cs.backdropFilter !== 'none') return false;
      // A hairline (a panel's edge rule) is drawn content, not the ground.
      const r = a.getBoundingClientRect();
      if ((Math.abs(x - r.left) < 4 && cs.borderLeftWidth !== '0px') || (Math.abs(x - r.right) < 4 && cs.borderRightWidth !== '0px')) return false;
    }
    return true;
  };
  const add = (block, name, inside, outside) => {
    if (inside[1] < 2 || inside[1] > innerHeight - 2 || outside[1] < 2 || outside[1] > innerHeight - 2) return;
    // Inside means on the block or on one of its unpainted children (the
    // dock's links fill most of its face).
    const hit = document.elementFromPoint(...inside);
    if (!hit || !block.contains(hit)) return;
    if (hit !== block && getComputedStyle(hit).backgroundColor !== 'rgba(0, 0, 0, 0)') return;
    // A child's own divider line is drawn, not a seam.
    if (hit !== block) {
      const hr = hit.getBoundingClientRect(), hs = getComputedStyle(hit);
      if ((Math.abs(inside[0] - hr.left) < 4 && hs.borderLeftWidth !== '0px') || (Math.abs(inside[0] - hr.right) < 4 && hs.borderRightWidth !== '0px')) return;
    }
    // The whole sampled patch must be ground, not only its centre.
    for (const [dx, dy] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) if (!bare(outside[0] + dx, outside[1] + dy)) return;
    out.push({name, inside, outside});
  };
  const blocks = [...document.querySelectorAll('main > section > .wrap, [class*="ReachDock"][class*="dock"]')];
  let solid = 0;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    solid++;
    const top = Math.max(r.top, 8), bottom = Math.min(r.bottom, innerHeight - 8);
    for (let f = 0.05; f < 1; f += 0.1) {
      const y = Math.round(top + (bottom - top) * f);
      const x = Math.round(r.left + r.width * f);
      if (r.right < innerWidth - 8) add(el, 'right', [Math.round(r.right) - 6, y], [Math.round(r.right) + 6, y]);
      add(el, 'top', [x, Math.round(r.top) + 12], [x, Math.round(r.top) - 6]);
      add(el, 'bottom', [x, Math.round(r.bottom) - 6], [x, Math.round(r.bottom) + 6]);
    }
  }
  return {out, solid};
}"""


def srgb_to_oklab(rgb):
    lin = [((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92 for c in rgb]
    r, g, b = lin
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def patch(img, x, y, r=2):
    x, y = round(x), round(y)
    px = [img.getpixel((min(max(i, 0), img.width - 1), min(max(j, 0), img.height - 1)))[:3]
          for i in range(x - r, x + r + 1) for j in range(y - r, y + r + 1)]
    return tuple(sum(p[k] for p in px) / len(px) for k in range(3))


def shoot(cdp):
    data = cdp.send("Page.captureScreenshot", {"format": "png"})["data"]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def run(width, url):
    fails = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 900}, color_scheme="dark", device_scale_factor=1)
        # The film's own readiness (data-film=live) is waited for below; the load
        # event also waits on every clip preload, which stalls under parallel gates.
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(2500)
        page.mouse.move(10, 10)
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        ground = page.evaluate("""() => { const c = document.createElement('canvas').getContext('2d');
          c.fillStyle = getComputedStyle(document.body).getPropertyValue('--paper'); c.fillRect(0,0,1,1);
          return [...c.getImageData(0,0,1,1).data].slice(0,3); }""")
        cdp = page.context.new_cdp_session(page)
        print(f"== {width}px, ground rgb{tuple(ground)}")

        worst_off = 0
        seams = []
        solid_seen = 0
        for stop in STOPS:
            y = page.evaluate(LOCATE, stop)
            page.evaluate("(y) => scrollTo({top: y, behavior: 'instant'})", y)
            page.wait_for_timeout(700)
            # 1. Lights off, content hidden: the whole viewport is the ground.
            tag = page.add_style_tag(content=HIDE)
            page.wait_for_timeout(250)
            img = shoot(cdp)
            tag.evaluate("t => t.remove()")
            hist = img.getcolors(maxcolors=1 << 20) or []
            off = max((max(abs(c[k] - ground[k]) for k in range(3)), n, c) for n, c in hist)
            worst_off = max(worst_off, off[0])
            if off[0] > 1:
                fails.append(f"lights-off at {stop}: {off[1]} px at rgb{off[2]}, {off[0]} code values from ground")
            # 2. Seams, content visible, glyphs hidden.
            tag = page.add_style_tag(content=HIDE_TEXT)
            page.wait_for_timeout(250)
            img = shoot(cdp)
            tag.evaluate("t => t.remove()")
            edges = page.evaluate(EDGES)
            solid_seen += edges["solid"]
            for e in edges["out"]:
                a = srgb_to_oklab(patch(img, *e["inside"]))
                b = srgb_to_oklab(patch(img, *e["outside"]))
                de = 100 * math.dist(a, b)
                seams.append((de, stop, e["name"], e["inside"]))

        seams.sort(reverse=True)
        print(f"lights off: worst pixel {worst_off} code values from ground over {len(STOPS)} stops (limit 1)")
        print(f"seams: {len(seams)} measured, worst dE_ok {seams[0][0]:.2f} at {seams[0][1]} {seams[0][2]} {seams[0][3]} (limit 2)" if seams else "seams: none found")
        # Reading panels are glass since D40 and clear since B2 (2026-10-01), so
        # at most widths no solid block is left to meet the film; the seam
        # check covers whatever solid blocks remain (the phone dock). With
        # solid blocks on screen it must measure some seams, or the edge probe
        # has stopped finding them; with none there is nothing to measure.
        if solid_seen and len(seams) < 4:
            fails.append(f"{solid_seen} solid blocks on screen but only {len(seams)} seams measured, need 4")
        for de, stop, name, at in seams:
            if de > 2:
                fails.append(f"seam dE {de:.2f} at {stop} {name} {at}")
        browser.close()
    return fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=ORIGIN + "/classic?film=debug&lights=off")
    ap.add_argument("--width", type=int, nargs="*", default=[1440])
    args = ap.parse_args()
    fails = []
    for w in args.width:
        fails += run(w, args.url)
    for f in fails[:20]:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
