"""Show the film full screen in a real (headed) Chromium with the GPU on, and
scroll it top to bottom on a loop, for watching the build.

    python3 scripts/film-show.py               /classic, 95 s a pass
    python3 scripts/film-show.py --seconds 60 --debug

Any key or wheel stops the auto-scroll until the next reload. The tour is an
init script, so it survives the dev server's reloads.
Close the window (cmd+Q) to end.
"""

import argparse

from playwright.sync_api import sync_playwright

TOUR = """((ms) => {
  let stopped = false;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  addEventListener("wheel", () => (stopped = true), { once: true });
  addEventListener("keydown", () => (stopped = true), { once: true });
  const pass = () => new Promise((done) => {
    scrollTo({ top: 0, behavior: "instant" });
    setTimeout(() => {
      const end = document.documentElement.scrollHeight - innerHeight, t0 = performance.now();
      const step = (now) => {
        if (stopped) return done();
        const t = Math.min(1, (now - t0) / ms);
        scrollTo({ top: end * ease(t), behavior: "instant" });
        t < 1 ? requestAnimationFrame(step) : setTimeout(done, 4000);
      };
      requestAnimationFrame(step);
    }, 3000);
  });
  const go = () => (async () => { while (!stopped) await pass(); })();
  // Starts once the film is live, on every load (dev reloads included).
  const wait = () => (document.documentElement.dataset.film === "live" ? go() : setTimeout(wait, 500));
  addEventListener("load", wait);
})(%d)"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=95)
    ap.add_argument("--debug", action="store_true")
    a = ap.parse_args()
    url = "http://localhost:3002/classic" + ("?film=debug" if a.debug else "")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--start-fullscreen", "--kiosk", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
        )
        page = browser.new_page(no_viewport=True, color_scheme="dark")
        page.add_init_script(TOUR % (a.seconds * 1000))
        page.goto(url)
        page.wait_for_event("close", timeout=0)


if __name__ == "__main__":
    main()
