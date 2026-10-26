"""Computed-style snapshot of the page, and a diff between two snapshots.

    python3 scripts/ui-styles.py snapshot [--tag NAME]   writes docs/ui-styles/<build or tag>.json
    python3 scripts/ui-styles.py diff A.json B.json [--noise A2.json]
                                                         exit 1 when anything visible changed; a value
                                                         that differs between A and A2 (same build) is
                                                         time-varying and ignored

The proof that a stylesheet refactor changed nothing a reader can see. Every
element under body (and its ::before and ::after) is keyed by its DOM path and
recorded with the properties below, at 390 and 1440, in two states: reduced
motion with the still film, and full motion with the live film. Hover is taken
for every link, button and summary with transitions frozen. A refactor passes
when the diff is empty; run snapshot twice on one build first to confirm the
page is deterministic (the diff of those two must also be empty).
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache  # noqa: E402

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
V2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(V2, "docs", "ui-styles")

PROPS = [
    "display", "position", "visibility", "opacity", "z-index", "top", "right", "bottom", "left",
    "width", "height", "margin", "padding", "color", "background-color", "background-image",
    "background-position", "background-size", "border-top", "border-right", "border-bottom",
    "border-left", "border-radius", "outline", "box-shadow", "text-shadow", "font-family",
    "font-size", "font-weight", "font-style", "font-variation-settings", "letter-spacing",
    "line-height", "text-transform", "text-decoration", "text-underline-offset",
    "-webkit-text-fill-color", "-webkit-text-stroke", "transform", "translate", "scale",
    "filter", "backdrop-filter", "clip-path", "mask-image", "mix-blend-mode", "grid-template-columns",
    "gap", "max-width", "content", "transition", "animation-name", "cursor",
]

STATES = [
    ("still", "reduce", "?film=still"),
    ("live", "no-preference", ""),
]

SNAP_JS = """
(props) => {
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.push(e.tagName.toLowerCase() + ':' + i);
    }
    return parts.reverse().join('/');
  };
  const pick = (cs) => {
    const o = {};
    for (const p of props) {
      let v = cs.getPropertyValue(p);
      if (p === 'width' || p === 'height') v = String(Math.round(parseFloat(v) || 0));
      o[p] = v;
    }
    return o;
  };
  const out = {};
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('script,style,noscript,canvas')) continue;
    const k = path(el);
    out[k] = pick(getComputedStyle(el));
    for (const ps of ['::before', '::after']) {
      const cs = getComputedStyle(el, ps);
      if (cs.content && cs.content !== 'none' && cs.content !== 'normal') out[k + ps] = pick(cs);
    }
  }
  return out;
}
"""

TARGETS_JS = """
() => {
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.push(e.tagName.toLowerCase() + ':' + i);
    }
    return parts.reverse().join('/');
  };
  return [...document.querySelectorAll('a[href], button, summary')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(path);
}
"""

FREEZE = "*,*::before,*::after{transition:none!important;animation-play-state:paused!important}"


def settle(page):
    # Walk the page so scroll reveals and lazy media reach their end state, then return to the top.
    h = page.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(120)
        y += 600
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1500)


def snapshot(tag):
    data = {"build": _cache.build_id(), "states": {}}
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        for w in (390, 1440):
            for name, motion, query in STATES:
                ctx = br.new_context(
                    viewport={"width": w, "height": 900 if w > 700 else 844},
                    device_scale_factor=1, has_touch=w < 700, is_mobile=w < 700, reduced_motion=motion,
                )
                page = ctx.new_page()
                page.goto(f"{ORIGIN}/{query}", wait_until="networkidle")
                page.wait_for_timeout(2500)
                settle(page)
                rest = page.evaluate(SNAP_JS, PROPS)
                page.add_style_tag(content=FREEZE)
                hover = {}
                for p in page.evaluate(TARGETS_JS):
                    sel = "body > " + " > ".join(
                        f"{t.split(':')[0]}:nth-of-type({t.split(':')[1]})" for t in p.split("/")
                    )
                    loc = page.locator(sel).first
                    try:
                        loc.hover(timeout=800, force=True)
                    except Exception:
                        continue
                    hover[p] = page.evaluate(
                        """([sel, props]) => { const el = document.querySelector(sel); if (!el) return null;
                           const o = {}; for (const ps of ['', '::before', '::after']) { const cs = getComputedStyle(el, ps || null);
                           o[ps || 'self'] = props.map((k) => cs.getPropertyValue(k)).join('|'); } return o; }""",
                        [sel, ["color", "background-color", "background-image", "border-left", "border-top", "box-shadow", "transform", "opacity", "text-decoration", "outline", "translate"]],
                    )
                data["states"][f"{name}-{w}"] = {"rest": rest, "hover": hover}
                print(f"  {name}-{w}: {len(rest)} nodes, {len(hover)} hovered")
                ctx.close()
        br.close()
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{tag or data['build']}.json")
    json.dump(data, open(path, "w"))
    print(path)


def diff(a, b, noise=None):
    A, B = json.load(open(a)), json.load(open(b))
    N = json.load(open(noise)) if noise else A
    n = 0
    for st in sorted(set(A["states"]) | set(B["states"])):
        sa, sb = A["states"].get(st, {}), B["states"].get(st, {})
        for kind in ("rest", "hover"):
            ra, rb = sa.get(kind, {}), sb.get(kind, {})
            rn = N["states"].get(st, {}).get(kind, {})
            for k in sorted(set(ra) | set(rb)):
                va, vb = ra.get(k), rb.get(k)
                if va == vb:
                    continue
                if va is None or vb is None:
                    n += 1
                    if n <= 60:
                        print(f"{st} {kind} {k}: {'added' if va is None else 'removed'}")
                    continue
                if isinstance(va, dict):
                    vn = rn.get(k) or {}
                    for p in sorted(set(va) | set(vb)):
                        if va.get(p) != vb.get(p) and va.get(p) == vn.get(p):
                            n += 1
                            if n <= 60:
                                print(f"{st} {kind} {k} {p}: {va.get(p)!r} -> {vb.get(p)!r}")
    print(f"{n} differences")
    return 1 if n else 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("--tag")
    d = sub.add_parser("diff")
    d.add_argument("a")
    d.add_argument("b")
    d.add_argument("--noise")
    a = ap.parse_args()
    if a.cmd == "snapshot":
        snapshot(a.tag)
    else:
        sys.exit(diff(a.a, a.b, a.noise))


if __name__ == "__main__":
    main()
