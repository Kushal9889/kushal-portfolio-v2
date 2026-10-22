"""Full-page scroll probe for the film (handoff section 6): scrolls /classic top
to bottom over 20 s and reports frame times, clips seen and blank frames.

    python3 scripts/film-probe.py [--seconds 40] [--url http://localhost:3002/classic?film=debug]

Pass: plan C6.1 tier 1, as scripts/film-perf.py states it: interval p95 at
most 16.7 ms plus 1.0 ms of display timer jitter, under 0.5 percent of frames
dropped (a frame over 25 ms); 0 blank frames; no console errors. Exit code 1
on fail.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import argparse
import json
import sys

from playwright.sync_api import sync_playwright

SCROLL = """(ms) => new Promise(done => {
  const f = window.__film, max = document.documentElement.scrollHeight - innerHeight;
  const deltas = [], clips = new Set(); let blank = 0, t0 = performance.now(), last = t0;
  function tick(now) {
    deltas.push(now - last); last = now;
    const p = Math.min(1, (now - t0) / ms);
    scrollTo({ top: p * max, behavior: 'instant' });
    if (f.clip) { clips.add(f.clip); if (!f.clipReady) blank++; }
    if (p < 1) requestAnimationFrame(tick); else done({ deltas, clips: [...clips], blank });
  }
  requestAnimationFrame(tick);
})"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=20)
    ap.add_argument("--url", default=ORIGIN + "/classic?film=debug")
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        errors = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(a.url)
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        page.wait_for_timeout(5000)
        r = page.evaluate(SCROLL, a.seconds * 1000)
        b.close()
    d = sorted(r["deltas"][1:])
    p95 = d[int(len(d) * 0.95)]
    dropped = sum(1 for x in d if x > 25)
    ok = dropped <= len(d) * 0.005 and p95 <= 16.7 + 1.0 and r["blank"] == 0 and not errors
    print(json.dumps({"frames": len(d), "dropped": dropped, "p95_ms": round(p95, 1), "blank": r["blank"], "clips": len(r["clips"]), "errors": errors[:3], "pass": ok}))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
