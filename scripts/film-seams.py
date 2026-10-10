"""Continuity probe (D43): scrolls /classic down in small steps with all page
text hidden, captures the film at each step, and flags every discontinuity:
a picture jump far above the local motion, a dip toward black, or a clip clock
that is not where the scroll puts it.

    python3 scripts/film-seams.py [--steps 300] [--sheet out.jpg]

Exit code 1 when any seam is flagged.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import argparse
import base64
import io
import sys

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

HIDE = "body * { visibility: hidden !important; } [data-film-layer], [data-film-layer] * { visibility: visible !important; }"
STATE = """() => { const f = window.__film; return { beat: f.beat, p: +f.progress.toFixed(3), clip: f.clip, t: +f.clipTime.toFixed(2), ready: f.clipReady }; }"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=300)
    ap.add_argument("--settle", type=int, default=220, help="ms after each step, the clip clock's settle time")
    ap.add_argument("--sheet")
    ap.add_argument("--json")
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    a = ap.parse_args()
    rows, frames = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": a.width, "height": a.height}, color_scheme="dark")
        page.goto(ORIGIN + "/classic?film=debug")
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        page.add_style_tag(content=HIDE)
        page.wait_for_timeout(3000)
        cdp = page.context.new_cdp_session(page)
        top = page.evaluate("document.documentElement.scrollHeight - innerHeight")
        for i in range(a.steps + 1):
            y = top * i / a.steps
            page.evaluate("(y) => scrollTo({top: y, behavior: 'instant'})", y)
            y = page.evaluate("scrollY")  # screenshot clips are in page coordinates
            # First frame after the step: what a fast scroll shows before any easing.
            page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            first = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 60, "clip": {"x": 0, "y": y, "width": a.width, "height": a.height, "scale": 0.1}})
            page.wait_for_timeout(a.settle)
            shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 60, "clip": {"x": 0, "y": y, "width": a.width, "height": a.height, "scale": 0.1}})
            im = np.asarray(Image.open(io.BytesIO(base64.b64decode(shot["data"]))).convert("RGB"), dtype=float)
            im0 = np.asarray(Image.open(io.BytesIO(base64.b64decode(first["data"]))).convert("RGB"), dtype=float)
            s = page.evaluate(STATE)
            s["y"] = round(y)
            s["luma"] = round(im.mean(), 1)
            # How far the first frame after a step is from the settled one: a
            # stale frame (clock catching up from elsewhere) shows here.
            s["catch"] = round(np.abs(im - im0).mean(), 1)
            rows.append(s)
            frames.append(im)
        b.close()
    d = [0.0] + [float(np.abs(frames[i] - frames[i - 1]).mean()) for i in range(1, len(frames))]
    flags = []
    for i, s in enumerate(rows):
        s["diff"] = round(d[i], 1)
        near = sorted(d[max(1, i - 6):i] + d[i + 1:i + 7])
        med = near[len(near) // 2] if near else 0
        why = []
        if i > 0 and d[i] > max(12, 3.5 * med):
            why.append(f"jump {d[i]:.0f} vs local {med:.0f}")
        if i > 0 and s["luma"] < 0.55 * rows[i - 1]["luma"] and rows[i - 1]["luma"] > 20:
            why.append(f"dip luma {rows[i - 1]['luma']} to {s['luma']}")
        if s["catch"] > max(10, 3 * med):
            why.append(f"stale first frame {s['catch']}")
        if not s["clip"]:
            why.append("no clip")
        if why:
            prev = rows[i - 1] if i else {}
            flags.append(f"step {i:3d} y {s['y']:6d} {s['beat']}@{s['p']} {prev.get('clip', '')}@{prev.get('t', '')} -> {s['clip']}@{s['t']}: {'; '.join(why)}")
    if a.json:
        import json
        json.dump(rows, open(a.json, "w"))
    print("\n".join(flags) or "no seams")
    print(f"{len(flags)} flagged over {len(rows)} steps")
    if a.sheet and flags:
        idx = [int(f.split()[1]) for f in flags][:24]
        tiles = [Image.fromarray(np.concatenate([frames[max(0, k - 1)], frames[k]], 1).astype(np.uint8)) for k in idx]
        w, h = tiles[0].size
        sheet = Image.new("RGB", (w * 3, h * ((len(tiles) + 2) // 3)))
        for n, t in enumerate(tiles):
            sheet.paste(t, ((n % 3) * w, (n // 3) * h))
        sheet.save(a.sheet, quality=80)
    sys.exit(1 if flags else 0)


if __name__ == "__main__":
    main()
