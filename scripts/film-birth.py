"""Packet birth and the provenance chip (plan C3.5, C5.2, K2).

    python3 scripts/film-birth.py

1. Load /classic at 1440 x 900 and wait for the film. The page's own request
   must be born at the Ask box (window.__film.bornFor set) and the chip must
   read RECORDED with an age.
2. Send a request (a synthetic corpus:sent, so no model is called). The packet
   must be on screen within 100 ms of the event, and the chip must switch to
   YOUR QUESTION · RUNNING.
3. Frames mid-flight (350 ms) and at rest (1.8 s) are written for review.

Exits 1 on any failure.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import base64
import os
import sys

from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "..", ".playwright-mcp", "film")


def main():
    fails = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        page.goto(ORIGIN + "/classic?film=debug")
        page.mouse.move(10, 10)
        page.wait_for_function("document.documentElement.dataset.film === 'live' && window.__film", timeout=30000)
        cdp = page.context.new_cdp_session(page)
        shot = lambda name: open(os.path.join(OUT, name), "wb").write(base64.b64decode(cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 80})["data"]))

        try:
            page.wait_for_function("document.querySelector('[class*=FilmChip][data-kind=recorded]')", timeout=20000)
        except Exception:
            pass
        load = page.evaluate("({born: window.__film.bornFor, chip: document.querySelector('[class*=FilmChip] span[aria-hidden]')?.textContent})")
        print("load-time:", load)
        if load["born"] < 0:
            fails.append("load-time request was never born at the Ask box")
        if not (load["chip"] or "").startswith("RECORDED · "):
            fails.append(f"chip after load reads {load['chip']!r}, expected RECORDED · <age>")
        page.wait_for_timeout(2500)

        page.evaluate("window.dispatchEvent(new CustomEvent('corpus:sent', {detail: {question: 'birth gate', t0: performance.now()}}))")
        page.wait_for_timeout(350)
        shot("birth-mid.jpg")
        page.wait_for_timeout(1450)
        shot("birth-rest.jpg")
        sent = page.evaluate("({lag: window.__film.bornLag, chip: document.querySelector('[class*=FilmChip] span[aria-hidden]')?.textContent})")
        print("visitor request:", sent)
        if not (0 <= sent["lag"] <= 100):
            fails.append(f"packet born {sent['lag']:.0f} ms after corpus:sent (limit 100)")
        if sent["chip"] != "YOUR QUESTION · RUNNING":
            fails.append(f"chip while running reads {sent['chip']!r}")
        browser.close()
    for f in fails:
        print("FAIL", f)
    print("PASS" if not fails else f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
