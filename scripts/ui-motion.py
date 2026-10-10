"""Motion quality audit: which animations run, what they animate, what they shift.

    python3 scripts/ui-motion.py               390 and 1440
    python3 scripts/ui-motion.py --force

Rules (impeccable animate.md and craft-floor, design-taste 5.D and 6.A, ui-ux-pro-max):
  layout      animate transform and opacity (plus colour); width, height, top, left, margins,
              padding and font-size animation is a failure.
  shift       cumulative layout shift while scrolling the whole page stays under 0.1, and
              no single section causes more than 0.05.
  reduced     with prefers-reduced-motion: reduce, no running animation translates, scales
              or rotates (opacity and colour feedback may stay).
  idle        after the page has settled for 3 s, nothing infinite runs except named live
              indicators (a pulse on a live dot); every other loop is a failure.
  frames      the longest frame while scrolling every section stays under 50 ms
              (long animation frames, where the browser reports them).

Writes docs/ui-motion.json. Exit 1 on any failure.
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache  # noqa: E402

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "ui-motion.json")
LAYOUT_PROPS = ("width", "height", "top", "left", "right", "bottom", "margin", "padding", "font-size", "inset", "min-height", "max-height", "border-width", "line-height", "inline-size", "block-size", "min-inline-size", "max-inline-size", "min-block-size", "max-block-size")
# Infinite loops that are allowed to run at rest: live-status indicators only.
LIVE_OK = ("pulse", "node-pulse", "live", "blink", "caret")

OBSERVE = """() => {
  window.__cls = {total: 0, bySection: {}, entries: 0};
  window.__loaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.total += e.value; window.__cls.entries++;
        const src = (e.sources || [])[0];
        const node = src && src.node && src.node.nodeType === 1 ? src.node : (src && src.node && src.node.parentElement);
        const sec = (node && node.closest && node.closest('section[id]') || {}).id || (node && node.closest && node.closest('header') ? 'header' : '-');
        window.__cls.bySection[sec] = (window.__cls.bySection[sec] || 0) + e.value;
      }
    }).observe({type: 'layout-shift', buffered: true});
  } catch (e) {}
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__loaf.push(Math.round(e.duration)); }).observe({type: 'long-animation-frame', buffered: true});
  } catch (e) {}
}"""

ANIMS = """() => {
  const out = [];
  document.getAnimations().forEach((a) => {
    const t = a.effect && a.effect.target; if (!t) return;
    let props = [];
    try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))]; } catch (e) {}
    if (a.transitionProperty) props = [a.transitionProperty];
    const timing = a.effect.getComputedTiming();
    out.push({
      name: a.animationName || a.transitionProperty || a.id || 'web',
      kind: a.transitionProperty ? 'transition' : (a.animationName ? 'css' : 'web'),
      props, state: a.playState, infinite: timing.iterations === Infinity,
      pseudo: a.effect.pseudoElement || '',
      section: (t.closest && t.closest('section[id]') || {}).id || (t.closest && t.closest('header,nav,footer,aside') || {}).tagName || '-',
      comp: (() => { for (let n = t; n; n = n.parentElement) { const m = String(n.className || '').match(/([A-Za-z0-9]+)-module__/); if (m) return m[1]; } return ''; })(),
    });
  });
  return out;
}"""


def scan(width, browser, report, fails, reduced):
    ctx = browser.new_context(viewport={"width": width, "height": 900 if width > 700 else 844}, device_scale_factor=1, has_touch=width < 700,
                              is_mobile=width < 700, reduced_motion="reduce" if reduced else "no-preference")
    page = ctx.new_page()
    page.add_init_script(f"window.addEventListener('DOMContentLoaded', ({OBSERVE}));")
    page.goto(f"{ORIGIN}/classic", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    seen = {}
    h = page.evaluate("document.documentElement.scrollHeight")
    for y in list(range(0, h, 650)):
        page.evaluate(f"window.scrollTo(0,{y})")
        page.wait_for_timeout(280)
        for a in page.evaluate(ANIMS):
            k = (a["name"], a["section"], a["pseudo"], tuple(a["props"]), a["infinite"])
            seen.setdefault(k, a)
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(3000)
    idle = page.evaluate(ANIMS)
    cls = page.evaluate("window.__cls || {total: 0, bySection: {}}")
    loaf = page.evaluate("window.__loaf || []")
    ctx.close()
    anims = list(seen.values())
    key = f"w{width}" + ("-reduced" if reduced else "")
    report[key] = {"animations": len(anims), "cls": round(cls["total"], 4), "cls_by_section": {k: round(v, 4) for k, v in cls["bySection"].items() if v > 0.001}, "longest_frame_ms": max(loaf) if loaf else 0,
                   "by_name": sorted({f"{a['name']}@{a['section']}" for a in anims})[:60]}
    if not reduced:
        for a in anims:
            bad = [p for p in a["props"] if any(p == lp or p.startswith(lp + "-") for lp in LAYOUT_PROPS) and not p.startswith("background")]
            if bad:
                fails.append(f"{key} [layout] {a['name']} animates {bad} in {a['section']} ({a['comp']})")
        idle_inf = [a for a in idle if a["infinite"] and a["state"] == "running" and not any(w in a["name"].lower() for w in LIVE_OK)]
        names = sorted({f"{a['name']}@{a['section']}" for a in idle_inf})
        report[key]["idle_infinite"] = names
        for n in names:
            fails.append(f"{key} [idle] infinite animation running at rest: {n}")
        if cls["total"] > 0.1:
            fails.append(f"{key} [shift] cumulative layout shift {cls['total']:.3f} (limit 0.1)")
        for sec, v in cls["bySection"].items():
            if v > 0.05:
                fails.append(f"{key} [shift] section {sec} shifts {v:.3f} (limit 0.05)")
        if loaf and max(loaf) > 50:
            fails.append(f"{key} [frames] longest frame {max(loaf)} ms (limit 50)")
    else:
        moving = [a for a in anims if a["state"] == "running" and any(p in ("transform", "translate", "scale", "rotate") for p in a["props"])]
        report[key]["moving_under_reduced"] = sorted({f"{a['name']}@{a['section']}" for a in moving})
        for a in moving:
            fails.append(f"{key} [reduced] spatial animation still runs under reduced motion: {a['name']} in {a['section']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=[390, 1440])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    old = _cache.reuse(OUT, a.width)
    if old:
        print(f"cached for build {old['build']} ({'FAIL' if old['fails'] else 'PASS'}, {len(old['fails'])} fails); --force to rerun")
        for f in old["fails"][:14]:
            print("  ", f[:170])
        sys.exit(1 if old["fails"] else 0)
    report, fails = {}, []
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        for w in a.width:
            scan(w, br, report, fails, False)
            if w > 700:
                scan(w, br, report, fails, True)
        br.close()
    report["fails"], report["build"], report["widths"] = fails, _cache.build_id(), a.width
    json.dump(report, open(OUT, "w"), indent=1)
    for k, r in report.items():
        if k.startswith("w") and isinstance(r, dict):
            print(f"{k}: {r['animations']} animations, CLS {r['cls']}, longest frame {r['longest_frame_ms']} ms" + (f", moving under reduced: {len(r.get('moving_under_reduced', []))}" if 'moving_under_reduced' in r else ""))
    print("FAIL" if fails else "PASS", f"({len(fails)} fails)")
    for f in fails[:16]:
        print("  ", f[:170])
    if len(fails) > 16:
        print(f"   ... {len(fails) - 16} more in docs/ui-motion.json")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
