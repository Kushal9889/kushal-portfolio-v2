"""Record the film as a person sees it: one smooth scroll from the hero to the
contact section, as an MP4 plus a contact sheet of frames.

    python3 scripts/film-reel.py                 1440 wide, 60 s
    python3 scripts/film-reel.py --width 920 --seconds 40
    python3 scripts/film-reel.py --hold T1,T6,contact     4 s on each beat, to see motion inside plates

Writes .playwright-mcp/film/reel/reel-<width>.mp4 and reel-<width>-sheet.jpg.
"""

import os as _os

# FILM_ORIGIN points every gate at another server, e.g. the production build on :3003.
ORIGIN = _os.environ.get("FILM_ORIGIN", "http://localhost:3002")

import argparse
import glob
import os
import shutil
import subprocess

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", ".playwright-mcp", "film", "reel")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--url", default=ORIGIN + "/classic?film=debug")
    ap.add_argument("--hold", default="", help="comma-separated beats (film-compare stop syntax) to hold on instead of scrolling")
    a = ap.parse_args()
    raw = os.path.join(OUT, "raw")
    shutil.rmtree(raw, ignore_errors=True)
    os.makedirs(raw, exist_ok=True)
    size = {"width": a.width, "height": a.height}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(viewport=size, color_scheme="dark", record_video_dir=raw, record_video_size=size)
        page = ctx.new_page()
        page.goto(a.url)
        page.mouse.move(10, 10)
        page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=60000)
        page.wait_for_timeout(2500)
        if a.hold:
            import importlib.util
            spec = importlib.util.spec_from_file_location("fc", os.path.join(HERE, "film-compare.py"))
            fc = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(fc)
            for stop in a.hold.split(","):
                y = float(stop[2:]) if stop.startswith("y:") else page.evaluate(fc.LOCATE, stop)
                page.evaluate("(y) => scrollTo({ top: y, behavior: 'instant' })", y)
                page.wait_for_timeout(4000)
            a.seconds = 4 * len(a.hold.split(","))
        # Eased scroll driven inside the page, one step per animation frame.
        else: page.evaluate(
            """(ms) => new Promise((done) => {
              const end = document.documentElement.scrollHeight - innerHeight, t0 = performance.now();
              const ease = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
              const step = (now) => {
                const t = Math.min(1, (now - t0) / ms);
                scrollTo({ top: end * ease(t), behavior: "instant" });
                t < 1 ? requestAnimationFrame(step) : setTimeout(done, 1500);
              };
              requestAnimationFrame(step);
            })""",
            a.seconds * 1000,
        )
        ctx.close()
        browser.close()
    webm = glob.glob(os.path.join(raw, "*.webm"))[0]
    tag = f"{a.width}-hold" if a.hold else f"{a.width}"
    mp4 = os.path.join(OUT, f"reel-{tag}.mp4")
    sheet = os.path.join(OUT, f"reel-{tag}-sheet.jpg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", mp4], check=True)
    # 24 frames spread over the run, 4 across.
    n = 24
    fps = n / (a.seconds + 5)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-vf", f"fps={fps:.4f},scale=480:-1,tile=4x6", "-frames:v", "1", sheet], check=True)
    print(mp4, os.path.getsize(mp4) // 1024, "KB")
    print(sheet)


if __name__ == "__main__":
    main()
