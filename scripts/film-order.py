"""Playback-order probe (D44): scrolls /classic down with the reel's own easing
and logs, every frame, the clip the film actually shows, its decoded time and
the clip dissolving in. Flags every frame where the picture goes back to an
earlier clip, or a clip's shown time runs backwards while the page scrolls down.

    python3 scripts/film-order.py [--seconds 40]

Exit code 1 when anything runs backwards.
"""

import argparse
import json
import sys

from playwright.sync_api import sync_playwright

ROWS = json.load(open(__file__.rsplit("/", 2)[0] + "/content/film-clips.json"))["clips"]
ORDER = list(dict.fromkeys(r["file"] for r in ROWS))
LOG = """(ms) => new Promise(done => {
  const f = window.__film, end = document.documentElement.scrollHeight - innerHeight, t0 = performance.now(), out = [];
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    scrollTo({ top: end * ease(t), behavior: 'instant' });
    out.push([+(now - t0).toFixed(0), f.beat, +f.progress.toFixed(3), f.shown, +f.shownTime.toFixed(3), f.mixClip, +f.mix.toFixed(2)]);
    t < 1 ? requestAnimationFrame(step) : done(out);
  };
  requestAnimationFrame(step);
})"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=40)
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        page.goto("http://localhost:3002/classic?film=debug")
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        page.wait_for_timeout(4000)
        log = page.evaluate(LOG, a.seconds * 1000)
        b.close()
    bad = []
    last_i, last_t, last_clip = -1, -1.0, ""
    for ms, beat, prog, shown, st, mix_clip, mix in log:
        if not shown:
            continue
        i = ORDER.index(shown)
        if i < last_i:
            bad.append(f"{ms / 1000:6.2f}s {beat}@{prog}: back to {shown}@{st} after {last_clip}@{last_t}")
        elif shown == last_clip and st < last_t - 0.05:
            bad.append(f"{ms / 1000:6.2f}s {beat}@{prog}: {shown} runs back {last_t} -> {st}")
        last_i, last_t, last_clip = max(last_i, i), st, shown
    print("\n".join(bad[:60]) or "in order")
    print(f"{len(bad)} backward frames over {len(log)} frames")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
