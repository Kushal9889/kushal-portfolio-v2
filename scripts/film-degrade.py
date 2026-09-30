"""The film degrades instead of breaking (plan 14.4, repo rule 7).

    python3 scripts/film-degrade.py

1. Context lost at 1440: the GPU context is dropped on purpose. The page must
   lose data-film (plain ground, chip hidden), the loop must stop, and no error
   may reach the console. Restoring the context brings the film back and frames
   resume.
2. Covered at 1024: with the reader inside a reading section and no hero or
   transit window on screen, the renderer draws no frames.

Exits 1 on any failure.
"""

import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:3002/classic?film=debug"
LIVE = "document.documentElement.dataset.film === 'live' && window.__film"


def frames(page, ms=1200):
    a = page.evaluate("window.__film.frames")
    page.wait_for_timeout(ms)
    return page.evaluate("window.__film.frames") - a


FIND_COVERED = """() => {
  const wins = [...document.querySelectorAll('body > header, [data-transit]')].map(el => {
    const r = el.getBoundingClientRect(); return [r.top + scrollY, r.bottom + scrollY]; });
  for (let y = 0; y < document.documentElement.scrollHeight - innerHeight; y += 50)
    if (wins.every(([a, b]) => b <= y || a >= y + innerHeight)) return y;
  return null; }"""


def main():
    fails = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])

        page = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        errors = []
        page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
        page.goto(URL)
        page.mouse.move(10, 10)
        page.wait_for_function(LIVE, timeout=30000)
        page.evaluate("window.__loseCtx = document.querySelector('[data-film-layer] canvas').getContext('webgl2').getExtension('WEBGL_lose_context')")
        page.evaluate("window.__loseCtx.loseContext()")
        page.wait_for_timeout(300)
        state = page.evaluate("({film: document.documentElement.dataset.film || null, chip: getComputedStyle(document.querySelector('[class*=FilmChip]')).display})")
        page.mouse.wheel(0, 400)
        n = frames(page)
        print("context lost:", state, "frames in 1.2 s:", n)
        if state["film"] is not None or state["chip"] != "none":
            fails.append(f"after context loss the page still claims a live film: {state}")
        if n > 0:
            fails.append(f"{n} frames drawn with no GPU context")
        page.evaluate("window.__loseCtx.restoreContext()")
        try:
            page.wait_for_function(LIVE, timeout=5000)
        except Exception:
            fails.append("film did not come back after the context was restored")
        page.mouse.wheel(0, 200)
        n = frames(page)
        print("context restored: frames in 1.2 s:", n)
        if n == 0:
            fails.append("no frames after restore")
        real = [e for e in errors if "CONTEXT_LOST" not in e.upper()]
        if real:
            fails.append(f"console errors: {real[:3]}")
        page.close()

        page = browser.new_page(viewport={"width": 1024, "height": 800}, color_scheme="dark")
        page.goto(URL)
        page.mouse.move(10, 10)
        page.wait_for_function(LIVE, timeout=30000)
        # Find a scroll position where no hero or transit pixel is on screen.
        y = page.evaluate(FIND_COVERED)
        if y is None:
            print("covered at 1024: no scroll position hides every film window; nothing to park")
        else:
            page.evaluate("(y) => scrollTo(0, y)", y)
            page.wait_for_timeout(800)
            # The page can still grow after load (fonts, measured windows), so
            # confirm nothing is on screen before counting, and look again if so.
            for _ in range(3):
                showing = page.evaluate("""() => [...document.querySelectorAll('body > header, [data-transit]')]
                  .some(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })""")
                if not showing:
                    break
                y = page.evaluate(FIND_COVERED)
                page.evaluate("(y) => scrollTo(0, y)", y)
                page.wait_for_timeout(800)
            page.mouse.move(400, 400)
            n = frames(page)
            print(f"covered at 1024 (y {y}): frames in 1.2 s:", n)
            if n > 0:
                fails.append(f"{n} frames drawn while no film pixel was visible")
        browser.close()
    for f in fails:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
