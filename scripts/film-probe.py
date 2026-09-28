"""Capture the film under the real page, one frame per section and transit window.

The Playwright screenshot call waits for the page to stop animating, which a
film that draws every frame never does, so frames are taken over CDP instead.

    python3 scripts/film-probe.py                        all anchors, 1440x900
    python3 scripts/film-probe.py --only T3 research     a subset
    python3 scripts/film-probe.py --mobile               390x844

Writes JPEGs to ../.playwright-mcp/film/ and prints window.__film at each stop.
"""

import argparse
import base64
import json
import os

from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "..", ".playwright-mcp", "film")
ANCHORS = ["hero", "T1", "work", "T2", "opensource", "T3", "research", "T4", "approach", "T5",
           "measured", "T6", "running", "T7", "proof", "T8", "education", "T9", "contact"]

LOCATE = """(a) => {
  if (a === 'hero') return 0;
  const el = document.getElementById(a) || document.querySelector(`[data-transit="${a}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const top = r.top + window.scrollY;
  // Transit: its middle at the viewport middle. Section: its top a third down.
  return el.dataset.transit ? top + r.height / 2 - innerHeight / 2 : top - innerHeight / 3;
}"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3002/classic?film=debug")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--settle", type=float, default=2.2)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    w, h = (390, 844) if args.mobile else (1440, 900)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": w, "height": h}, color_scheme="dark")
        errors = []
        page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
        page.goto(args.url)
        page.wait_for_timeout(2500)
        page.mouse.move(10, 10)
        try:
            page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=20000)
        except Exception:
            print("film did not go live:", page.evaluate("document.documentElement.dataset.film"), errors[:5])
        cdp = page.context.new_cdp_session(page)
        for a in args.only or ANCHORS:
            y = page.evaluate(LOCATE, a)
            if y is None:
                print(a, "missing")
                continue
            page.evaluate("(y) => window.scrollTo({top: y, behavior: 'instant'})", y)
            page.wait_for_timeout(int(args.settle * 1000))
            shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 72})
            name = f"{'m-' if args.mobile else ''}{ANCHORS.index(a) if a in ANCHORS else 99:02d}-{a}.jpg"
            with open(os.path.join(OUT, name), "wb") as f:
                f.write(base64.b64decode(shot["data"]))
            stats = page.evaluate("window.__film ? JSON.stringify(window.__film) : null")
            print(a, round(y), stats)
        if errors:
            print("console errors:", json.dumps(errors[:8], indent=1))
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
