"""Layout standard: no overlapping boxes, no sideways scroll.

    python3 scripts/film-layout.py

1. Overlap at 390, 820 and 1440 wide with every fold open: no two boxes in the
   flow (panels, figures, cells, blocks) may cross by more than 3 px.
2. Sideways scroll from 320 to 1440 wide: the page is never wider than the
   viewport.

Runs with the film off; neither check reads the footage. Exits 1 on failure.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import sys

from playwright.sync_api import sync_playwright

URL = ORIGIN + "/classic?film=off"

OVERLAP = """() => {
  const sel = 'main section > .wrap > *, main [data-kind], main aside, main figure, main dl > div, main [class*=cell], main ul[class*=stack] > li, header [data-film-scrim], header [data-surface], body > header *:is(a,button)';
  const els = [...document.querySelectorAll(sel)].filter((e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && !['fixed', 'sticky', 'absolute'].includes(cs.position);
  });
  const name = (e) => (e.closest('section')?.id || 'hdr') + ':' + e.tagName + '.' + String(e.className).replace(/\\S*module__\\w+__/g, '').slice(0, 18);
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.contains(b) || b.contains(a)) continue;
    const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
    const ix = Math.min(r.right, s.right) - Math.max(r.left, s.left), iy = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    if (ix > 3 && iy > 3) out.push(`${name(a)} x ${name(b)} ${Math.round(ix)}x${Math.round(iy)}`);
  }
  return out.slice(0, 25);
}"""


def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        for w, h in ((390, 844), (820, 1100), (1440, 900)):
            pg = b.new_page(viewport={"width": w, "height": h}, color_scheme="dark", is_mobile=w < 500, has_touch=w < 500)
            pg.goto(URL, wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_timeout(3000)
            pg.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
            pg.wait_for_timeout(800)
            hits = pg.evaluate(OVERLAP)
            print(f"overlap {w}: {len(hits)}")
            fails += [f"overlap {w}: {x}" for x in hits]
            pg.close()
        pg = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        pg.goto(URL, wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_timeout(2000)
        for w in (320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440):
            pg.set_viewport_size({"width": w, "height": 900})
            pg.wait_for_timeout(300)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            if sw > w:
                fails.append(f"sideways scroll at {w}: page is {sw} wide")
        b.close()
    for f in fails:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
