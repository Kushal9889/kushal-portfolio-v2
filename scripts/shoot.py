"""Capture the page at real viewports and report what lands above the fold.

The in-app browser pane in this environment returns blank frames whenever it is
hidden, which made every screenshot below the hero useless and left the redesign
being verified through getComputedStyle alone. This drives headless Chromium
instead, so a change can actually be looked at.

    python3 scripts/shoot.py                    desktop + mobile, light
    python3 scripts/shoot.py --dark             both, dark
    python3 scripts/shoot.py --at 0 900 1800    extra scroll offsets, desktop
    python3 scripts/shoot.py --url http://localhost:3001/#work

Writes PNGs to /tmp/shots and prints the above-fold inventory, which is the
number that actually decides whether a recruiter sees a thing or not.
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

OUT = "/tmp/shots"

VIEWPORTS = {
    "desktop": (1440, 900),
    "mobile": (390, 844),
}

# Reports every block-level box with real text, its offset, and whether it fell
# inside the first screen. Leaf-ish only, so a wrapper does not hide its
# children behind one row.
INVENTORY = """() => {
  const fold = window.innerHeight;
  const out = [];
  const walk = (el) => {
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      const txt = (c.textContent || '').trim().replace(/\\s+/g, ' ');
      if (r.height > 4 && (c.children.length === 0 || txt.length < 120)) {
        out.push({
          y: Math.round(r.top + window.scrollY),
          h: Math.round(r.height),
          x: Math.round(r.left),
          w: Math.round(r.width),
          cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].split('__').pop() || c.tagName.toLowerCase(),
          txt: txt.slice(0, 44),
        });
      } else if (c.children.length) walk(c);
    }
  };
  walk(document.body);
  return { fold, docHeight: document.documentElement.scrollHeight, rows: out };
}"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3001/")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--at", nargs="*", type=int, default=None,
                    help="scroll offsets to capture, desktop only")
    ap.add_argument("--tag", default="", help="suffix for filenames")
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    scheme = "dark" if args.dark else "light"
    tag = f"-{args.tag}" if args.tag else ""

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for name, (w, h) in VIEWPORTS.items():
            page = browser.new_page(viewport={"width": w, "height": h},
                                    color_scheme=scheme,
                                    device_scale_factor=2)
            page.goto(args.url)
            page.wait_for_load_state("networkidle")
            # The hero runs a live request on mount; give it room to settle so
            # the graph and the telemetry strip are captured with real numbers.
            page.wait_for_timeout(4000)

            page.screenshot(path=f"{OUT}/{name}{tag}-{scheme}.png")

            # A colour token whose hue came out powerless.
            #
            # color-mix() between two near-neutral colours can leave a chroma so
            # small that the hue channel carries nothing, and the result
            # serialises with `none`. That is not grey: it resolves as zero,
            # which is red. --paper-sunk did exactly this and put a pink cast on
            # the dock, every code chip, the evidence block and every panel
            # header, without a single hardcoded colour anywhere to find.
            bad_hue = page.evaluate("""() => {
              const probe = document.createElement('div');
              document.body.appendChild(probe);
              const names = [...document.styleSheets].flatMap(sheet => {
                try { return [...sheet.cssRules]; } catch { return []; }
              }).flatMap(rule => rule.style ? [...rule.style] : [])
                .filter(prop => prop.startsWith('--'));
              const out = [];
              for (const n of [...new Set(names)]) {
                probe.style.background = '';
                probe.style.background = `var(${n})`;
                const v = getComputedStyle(probe).backgroundColor;
                if (/\bnone\b/.test(v)) out.push(`${n} -> ${v}`);
              }
              probe.remove();
              return { checked: [...new Set(names)].length, bad: out };
            }""")
            # A check that enumerates nothing passes vacuously, which is worse
            # than no check at all.
            if name == "desktop":
                print(f"  {bad_hue['checked']} colour tokens resolved, "
                      f"{len(bad_hue['bad'])} with a powerless hue")
            bad_hue = bad_hue["bad"]
            if bad_hue:
                print(f"\n  !! {len(bad_hue)} token(s) resolve with a powerless hue at {name}:")
                for t in bad_hue:
                    print(f"     {t}")

            # Text that does not fit the box it was given.
            #
            # Two of these shipped: a role title at 41.6px inside a 240px rail,
            # and a section heading that rendered "A bug in LangChair" with the
            # last letter clipped. Both were invisible to every existing gate,
            # because nothing measured rendered geometry.
            over = page.evaluate("""() => [...document.querySelectorAll('body *')]
              .filter(e => {
                const cs = getComputedStyle(e);
                if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
                if (!e.offsetParent && e.tagName !== 'BODY') return false;
                if (!(e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)) return false;
                // An absolutely positioned child -- a tooltip, a hint, a
                // decorative rule -- is meant to extend past its anchor and is
                // not the bug this is looking for. What matters is text that
                // does not fit the box it was given to sit in.
                const floated = [...e.children].some(c => {
                  const p = getComputedStyle(c).position;
                  return p === 'absolute' || p === 'fixed';
                });
                return !floated;
              })
              .map(e => ({
                cls: (typeof e.className === 'string' ? e.className : '').split(' ')[0].split('__').pop() || e.tagName,
                txt: (e.textContent || '').trim().slice(0, 40),
                sw: e.scrollWidth, cw: e.clientWidth,
              })).slice(0, 12)""")
            if over:
                print(f"\n  !! {len(over)} element(s) overflow their box at {name}:")
                for o in over:
                    print(f"     {o['cls'][:24]:<24} sw{o['sw']} cw{o['cw']}  {o['txt']}")

            if name == "desktop":
                data = page.evaluate(INVENTORY)
                above = [r for r in data["rows"] if r["y"] < data["fold"]]
                print(f"\n=== {name} {w}x{h} {scheme} ===")
                print(f"document {data['docHeight']}px, fold {data['fold']}px, "
                      f"{len(above)} blocks above the fold")
                for r in above:
                    print(f"  y{r['y']:>5} x{r['x']:>4} {r['w']:>4}w {r['h']:>3}h  "
                          f"{r['cls'][:22]:<22} {r['txt']}")
                with open(f"{OUT}/inventory{tag}-{scheme}.json", "w") as fh:
                    json.dump(data, fh, indent=1)

                for y in (args.at or []):
                    page.evaluate(f"window.scrollTo(0, {y})")
                    # Long enough for the scroll reveal to finish. At 700ms the
                    # panels were still at opacity 0 with a 12px offset, so every
                    # below-fold capture showed a washed-out page that looked
                    # like a rendering bug and was not one.
                    page.wait_for_timeout(1800)
                    page.screenshot(path=f"{OUT}/{name}{tag}-{scheme}-y{y}.png")

            page.close()
        browser.close()

    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
