"""JPG screenshots of every section and named box, plus contact sheets to read.

    python3 scripts/ui-shots.py                 all sections at 390 and 1440, one sheet per width
    python3 scripts/ui-shots.py --only agent    one named target, full size
    python3 scripts/ui-shots.py --width 1440
    python3 scripts/ui-shots.py --full --motion both   every section at full height, calm and moving

Files land in docs/shots/<build>/: <name>-<width>.jpg per target and
sheet-<width>.jpg (all targets, scaled). Read a sheet to judge render, images,
video frames, edges and colour tone in one look; read a single target for detail.
Targets are in TARGETS below; add one whenever a new UI thing appears (the
registry in docs/ui-registry.json lists what exists).
"""

import argparse
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache  # noqa: E402

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
V2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# name -> CSS selector of the element to frame ("viewport:<id>" frames the viewport at a section)
TARGETS = {
    "hero": "viewport:top",
    "agent": "[class*='Agent-module__'][class*='agent']",
    "work": "viewport:work",
    "opensource": "viewport:opensource",
    "running": "viewport:running",
    "research": "viewport:research",
    "proof": "viewport:proof",
    "approach": "viewport:approach",
    "measured": "viewport:measured",
    "education": "viewport:education",
    "contact": "viewport:contact",
}


def shoot(page, name, sel, path):
    if sel.startswith("viewport:"):
        sid = sel.split(":", 1)[1]
        if sid == "top":
            page.evaluate("window.scrollTo(0, 0)")
        else:
            page.evaluate(
                "(id) => { const e = document.getElementById(id) || document.querySelector(`[data-beat='${id}']`); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 40); }",
                sid,
            )
        page.wait_for_timeout(1400)
        page.screenshot(path=path, type="jpeg", quality=72)
        return True
    loc = page.locator(sel).first
    if not loc.count():
        return False
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    loc.screenshot(path=path, type="jpeg", quality=80)
    return True


def sheet(paths, out, cols):
    ims = [Image.open(p) for p in paths]
    w = 560 if cols > 1 else 400
    tiles = []
    for im in ims:
        r = w / im.width
        tiles.append(im.resize((w, max(1, int(im.height * r)))))
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    heights = [max(t.height for t in r) for r in rows]
    S = Image.new("RGB", (w * cols, sum(heights)), (18, 18, 20))
    y = 0
    for r, h in zip(rows, heights):
        for i, t in enumerate(r):
            S.paste(t, (i * w, y))
        y += h
    S.save(out, "JPEG", quality=70)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=[390, 1440])
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--full", action="store_true", help="each section at full height instead of one viewport")
    ap.add_argument("--motion", choices=["reduce", "no-preference", "both"], default="no-preference")
    a = ap.parse_args()
    if a.full:
        return full(a)
    out_dir = os.path.join(V2, "docs", "shots", _cache.build_id())
    os.makedirs(out_dir, exist_ok=True)
    names = a.only or list(TARGETS)
    with sync_playwright() as pw:
        for w in a.width:
            if not a.force and not a.only and os.path.exists(os.path.join(out_dir, f"sheet-{w}.jpg")):
                print(f"cached {out_dir}/sheet-{w}.jpg")
                continue
            br = pw.chromium.launch(channel="chrome")
            ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1, has_touch=w < 700, is_mobile=w < 700)
            page = ctx.new_page()
            page.goto(f"{ORIGIN}/classic", wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            paths = []
            for n in names:
                p = os.path.join(out_dir, f"{n}-{w}.jpg")
                if shoot(page, n, TARGETS[n], p):
                    paths.append(p)
                else:
                    print(f"  missing target {n} at {w}")
            br.close()
            if not a.only:
                s = os.path.join(out_dir, f"sheet-{w}.jpg")
                sheet(paths, s, 3 if w > 700 else 6)
                print(f"sheet {s}")
            else:
                print("shots", [os.path.basename(p) for p in paths])


def full(a):
    """Every section (and the footer) as one full-height picture per width and motion mode."""
    out_dir = os.path.join(V2, "docs", "shots", _cache.build_id(), "full")
    os.makedirs(out_dir, exist_ok=True)
    motions = ["reduce", "no-preference"] if a.motion == "both" else [a.motion]
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        for w in a.width:
            for m in motions:
                ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1,
                                     has_touch=w < 700, is_mobile=w < 700, reduced_motion=m)
                page = ctx.new_page()
                page.goto(f"{ORIGIN}/", wait_until="networkidle")
                page.wait_for_timeout(2500)
                h = page.evaluate("document.documentElement.scrollHeight")
                for y in range(0, h, 600):
                    page.evaluate(f"window.scrollTo(0, {y})")
                    page.wait_for_timeout(120)
                tag = "calm" if m == "reduce" else "motion"
                for sel in ["body > header"] + [f"main > section#{t}" for t in TARGETS if not t.startswith(("hero", "agent"))] + ["footer"]:
                    loc = page.locator(sel).first
                    if not loc.count() or not loc.bounding_box() or loc.bounding_box()["height"] < 4:
                        continue
                    loc.scroll_into_view_if_needed()
                    page.wait_for_timeout(1200)
                    name = sel.split("#")[-1].split(" ")[-1]
                    loc.screenshot(path=os.path.join(out_dir, f"{name}-{w}-{tag}.jpg"), type="jpeg", quality=78)
                    print(f"  {name}-{w}-{tag}")
                ctx.close()
        br.close()
    print(out_dir)


if __name__ == "__main__":
    main()
