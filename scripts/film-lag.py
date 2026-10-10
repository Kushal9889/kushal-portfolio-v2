"""Where the film lags, per beat, under the scrolls people actually do.

    FILM_ORIGIN=http://localhost:3003 python3 scripts/film-lag.py [--only desk-slow,phone]

A dropped frame (over 25 ms) is only half of what reads as lag. The other half
is a held picture: the page moves but the video trails it by more than two
frames, because the seek has not decoded yet (stats.lag) or the clip on screen is not the one the scroll is in
(wrong clip held while the next one loads). Each frame is classed from
window.__film, which ?film=debug exposes, and summed per beat.

Scenarios: steady desktop scroll, fast flick, section jumps (the rail), upright
phone, and a cold cache on a throttled 4G link. Writes docs/lag-report.json and
prints one table per scenario. Exit 1 when any scenario misses the bar:
dropped frames under 0.5 percent, no blank frames, no console errors.

Root cause found with it (2026-10-03): the first upload of each clip's frame
to the GPU stalled 30 to 170 ms at the hand-off; engine.ts now warms each clip's
texture on idle when it loads (fast flick 3.9 to 0.17 percent dropped).
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
URL = ORIGIN + "/classic?film=debug" + os.environ.get("FILM_QUERY", "")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "lag-report.json")

# One rAF loop drives the scroll and samples the film after each frame.
# mode: "sweep" scrolls top to bottom over ms; "jumps" lands on each section.
RUN = """([mode, ms]) => new Promise(done => {
  const f = window.__film, max = document.documentElement.scrollHeight - innerHeight;
  const ids = [...document.querySelectorAll('main section[id]')].map(s => s.id);
  const rows = []; let t0 = performance.now(), last = t0, lastY = scrollY, lastShownT = -2, lastShown = '';
  const per = mode === 'jumps' ? ms / Math.max(1, ids.length) : 0;
  function tick(now) {
    const p = Math.min(1, (now - t0) / ms);
    let y;
    if (mode === 'jumps') {
      const i = Math.min(ids.length - 1, Math.floor((now - t0) / per));
      const el = document.getElementById(ids[i]);
      y = el ? el.getBoundingClientRect().top + scrollY : 0;
    } else y = p * max;
    scrollTo({ top: y, behavior: 'instant' });
    const moving = Math.abs(scrollY - lastY) > 0.5;
    // Behind by more than two 60 fps frames: the picture is visibly late.
    const frozen = moving && !!f.clip && f.lag > 2 / 60;
    const wrong = !!f.clip && f.shown !== f.clip && f.shown !== f.mixClip;
    rows.push([now - last, f.beat, moving ? 1 : 0, f.clip && !f.clipReady ? 1 : 0, frozen ? 1 : 0, wrong ? 1 : 0, f.clip || '', f.lag, f.ease, f.seeks]);
    last = now; lastY = scrollY; lastShownT = f.shownTime; lastShown = f.shown;
    if (p < 1) requestAnimationFrame(tick); else done(rows);
  }
  requestAnimationFrame(tick);
})"""

SCENARIOS = {
    "desk-slow": dict(viewport=(1440, 900), mobile=False, mode="sweep", ms=40000),
    # A Retina laptop: the canvas is 2880 wide, so the engine starts on the 4K frames.
    "desk-retina": dict(viewport=(1440, 900), mobile=False, mode="sweep", ms=40000, dpr=2),
    "desk-fast": dict(viewport=(1440, 900), mobile=False, mode="sweep", ms=10000),
    "desk-jumps": dict(viewport=(1440, 900), mobile=False, mode="jumps", ms=24000),
    "phone": dict(viewport=(390, 844), mobile=True, mode="sweep", ms=30000),
    "desk-4g-cold": dict(viewport=(1440, 900), mobile=False, mode="sweep", ms=30000, net=(4e6 / 8, 1e6 / 8, 100)),
    "phone-4g-cold": dict(viewport=(390, 844), mobile=True, mode="sweep", ms=30000, net=(1.6e6 / 8, 750e3 / 8, 150)),
}


def summarise(rows):
    beats = {}
    for dt, beat, moving, blank, frozen, wrong, clip, lag, ease, seeks in rows:
        b = beats.setdefault(beat, dict(frames=0, dropped=0, blank=0, held=0, moving=0, streak=0.0, worst=0.0, maxlag=0.0, movems=0.0, seeks0=None, seeks1=0, mseeks=0, clips=set()))
        b["frames"] += 1
        b["dropped"] += dt > 25
        b["blank"] += blank
        if moving:
            b["movems"] += dt
            if b["seeks0"] is not None and seeks > b["seeks1"]:
                b["mseeks"] += seeks - b["seeks1"]
        b["seeks0"] = seeks if b["seeks0"] is None else b["seeks0"]
        b["seeks1"] = seeks
        if moving and lag is not None and lag > b["maxlag"]:
            b["maxlag"] = round(lag, 3)
        b["moving"] += moving
        held = moving and (frozen or wrong)
        b["held"] += held
        b["streak"] = b["streak"] + dt if held else 0.0
        b["worst"] = max(b["worst"], b["streak"])
        if clip:
            b["clips"].add(clip)
    for b in beats.values():
        b["clips"] = sorted(b["clips"])
        del b["streak"]
        b["pic_fps"] = round(b["mseeks"] / (b["movems"] / 1000), 1) if b["movems"] else 0
        for k in ("seeks0", "seeks1", "mseeks", "movems"):
            del b[k]
    return beats


def run(pw, name, sc):
    b = pw.chromium.launch(channel="chrome", args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
    w, h = sc["viewport"]
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme="dark", is_mobile=sc["mobile"], has_touch=sc["mobile"], device_scale_factor=sc.get("dpr", 2 if sc["mobile"] else 1))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text[:160]))
    if "net" in sc:
        cdp = ctx.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        down, up, lat = sc["net"]
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "downloadThroughput": down, "uploadThroughput": up, "latency": lat})
    page.goto(URL, wait_until="domcontentloaded", timeout=120000)
    page.wait_for_function("window.__film && window.__film.frames > 30", timeout=120000)
    page.wait_for_timeout(1500)
    rows = page.evaluate(RUN, [sc["mode"], sc["ms"]])
    b.close()
    beats = summarise(rows)
    total = len(rows)
    moving = sum(r[2] for r in rows) or 1
    res = dict(
        frames=total,
        dropped=sum(r[0] > 25 for r in rows),
        dropped_pct=round(100 * sum(r[0] > 25 for r in rows) / max(1, total), 2),
        held_pct=round(100 * sum(v["held"] for v in beats.values()) / moving, 2),
        worst_freeze_ms=round(max((v["worst"] for v in beats.values()), default=0)),
        blank=sum(r[3] for r in rows),
        errors=errors[:5],
        beats=beats,
    )
    # held_pct and the freeze streak are in footage seconds, which run faster
    # than wall time where a clip spans few pixels; they are reported to find
    # slow beats, never gated (2026-10-03).
    res["pass"] = res["dropped_pct"] < 0.5 and res["blank"] == 0 and not errors
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    names = [n for n in SCENARIOS if not a.only or n in a.only.split(",")]
    report = {}
    with sync_playwright() as pw:
        for n in names:
            r = run(pw, n, SCENARIOS[n])
            report[n] = r
            print(f"\n{n}: {'PASS' if r['pass'] else 'FAIL'}  frames {r['frames']}  dropped {r['dropped_pct']}%  held {r['held_pct']}%  worst freeze {r['worst_freeze_ms']} ms  blank {r['blank']}  errors {len(r['errors'])}")
            bad = sorted(r["beats"].items(), key=lambda kv: -(kv[1]["held"] + kv[1]["dropped"]))[:6]
            for beat, v in bad:
                if v["held"] or v["dropped"] or v["blank"]:
                    print(f"  {beat:<12} dropped {v['dropped']:>3}  held {v['held']:>4}/{v['moving']:<4}  freeze {round(v['worst']):>5} ms  maxlag {v['maxlag']:.2f}s  pic {v['pic_fps']:>4} fps  blank {v['blank']:>3}  {','.join(v['clips'])}")
    json.dump(report, open(OUT, "w"), indent=1)
    sys.exit(0 if all(r["pass"] for r in report.values()) else 1)


if __name__ == "__main__":
    main()
