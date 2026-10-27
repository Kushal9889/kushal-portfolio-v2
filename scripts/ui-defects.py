"""Defects a reader can see, counted at every width and motion mode.

    python3 scripts/ui-defects.py                 / at 360 390 768 1280 1440 1920, motion reduce and full
    python3 scripts/ui-defects.py --width 390     one width
    python3 scripts/ui-defects.py --routes        also load /stage /ask /lab /lab/verbs for errors only

Counts, per run: text over other text (two visible text boxes from different
elements crossing by more than 3px both ways), text cut by a clipping ancestor,
text that stays invisible after the page has been walked (opacity under 0.05
with no closed disclosure or screen-reader clip to explain it), horizontal
scroll, images and videos that failed, console errors, failed requests, and
controls under 24px (fail) or 44px (warn) on touch widths. Writes
docs/ui-defects.json and exits 1 on any fail.
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
WIDTHS = [360, 390, 768, 1280, 1440, 1920]
ROUTES = ["/stage", "/ask", "/lab", "/lab/verbs"]

PROBE = """
async () => {
  const hiddenWhy = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 'hidden';
      // Closed unless the text is this disclosure's own summary (a nested
      // disclosure's summary inside a closed one is still folded away).
      if (e.tagName === 'DETAILS' && !e.open && el.closest('summary')?.parentElement !== e) return 'closed';
      if (cs.clipPath && cs.clipPath.startsWith('inset(50%')) return 'sr';
      if (cs.clip && cs.clip.startsWith('rect(0')) return 'sr';
      const r = e.getBoundingClientRect();
      if ((r.width <= 1 || r.height <= 1) && cs.overflow !== 'visible') return 'sr';
    }
    return null;
  };
  const alpha = (el) => {
    let a = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) a *= +getComputedStyle(e).opacity;
    return a;
  };
  const sec = (el) => (el.closest('main > section') || {}).id || (el.closest('footer') ? 'footer' : el.closest('header') ? 'hero' : 'chrome');
  const boxes = [], invisible = [], clipped = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (t.length < 2 || !el || el.closest('script,style,noscript,svg')) continue;
    if (hiddenWhy(el)) continue;
    // A ghost copy holds a typed answer's box at its final height and is
    // transparent on purpose; the typed copy over it is what a reader sees.
    if (el.closest('[class*="__ghost"]')) continue;
    // Overlays (fixed or sticky chrome) sit over the page by design and carry their own ground.
    let overlay = false, fixedChrome = false;
    for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') { overlay = true; fixedChrome = p === 'fixed'; break; } }
    const a = alpha(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width >= 4 && r.height >= 4);
    if (!rects.length) continue;
    const cs = getComputedStyle(el);
    const fill = cs.webkitTextFillColor || cs.color;
    const painted = /text/.test(cs.backgroundClip + ' ' + cs.webkitBackgroundClip);
    const transparentInk = /rgba\\(.*,\\s*0\\)$/.test(fill) && parseFloat(cs.webkitTextStrokeWidth) === 0 && !painted;
    // Fixed chrome shows and hides with scroll and pointer (the dock, the rail's
    // labels); it cannot be scrolled into view, so it is not "stuck".
    if (a < 0.05 || transparentInk) { if (!fixedChrome) invisible.push({ el, sec: sec(el), text: t.slice(0, 50), alpha: +a.toFixed(2) }); continue; }
    if (overlay) continue;
    // What a reader sees: the box cut by every clipping ancestor, then the ink band
    // (the font's ascender and descender space is empty for most glyphs).
    const clips = [];
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e);
      if (o.overflowX !== 'visible' || o.overflowY !== 'visible' || (o.webkitLineClamp && o.webkitLineClamp !== 'none')) clips.push(e.getBoundingClientRect());
    }
    for (const r0 of rects) {
      let L = r0.left, T = r0.top, R = r0.right, B = r0.bottom;
      const h = B - T; T += h * 0.18; B -= h * 0.22;
      for (const c of clips) { L = Math.max(L, c.left); T = Math.max(T, c.top); R = Math.min(R, c.right); B = Math.min(B, c.bottom); }
      if (R - L < 2 || B - T < 2) continue;
      boxes.push({ el, text: t.slice(0, 40), sec: sec(el), x: L, y: T + scrollY, r: R, b: B + scrollY });
    }
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e);
      if (o.overflow === 'visible' && o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      // A clamped paragraph with its own "Read more" is cut on purpose.
      if ((o.webkitLineClamp && o.webkitLineClamp !== 'none') || e.closest('[data-phone-fold], details:not([open])')) break;
      const er = e.getBoundingClientRect();
      const out = rects.some((r) => r.left < er.left - 2 || r.right > er.right + 2 || r.top < er.top - 2 || r.bottom > er.bottom + 2);
      if (out && o.overflowX !== 'auto' && o.overflowX !== 'scroll' && o.overflowY !== 'auto' && o.overflowY !== 'scroll') {
        clipped.push({ sec: sec(el), text: t.slice(0, 50) });
      }
      break;
    }
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x), oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      if (ox > 3 && oy > 3) overlaps.push({ sec: a.sec, a: a.text, b: b.text, ox: Math.round(ox), oy: Math.round(oy) });
    }
  }
  const stuck = [];
  for (const it of invisible) {
    it.el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 450));
    const cs = getComputedStyle(it.el);
    const painted = /text/.test(cs.backgroundClip + ' ' + cs.webkitBackgroundClip);
    const ink = /rgba\\(.*,\\s*0\\)$/.test(cs.webkitTextFillColor || cs.color) && parseFloat(cs.webkitTextStrokeWidth) === 0 && !painted;
    const a2 = alpha(it.el);
    // Mid-animation is not stuck: a rotating face is invisible for part of its turn.
    let moving = false;
    for (let e = it.el; e && e !== document.body; e = e.parentElement) if (e.getAnimations().some((x) => x.playState === 'running')) { moving = true; break; }
    if ((a2 < 0.05 || ink) && !moving) stuck.push({ sec: it.sec, text: it.text, alpha: +a2.toFixed(2) });
  }
  window.scrollTo(0, 0);
  const media = [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src'));
  const video = [...document.querySelectorAll('video')].filter((v) => v.error).map((v) => v.currentSrc || v.src);
  const small = [], warn = [];
  for (const c of document.querySelectorAll('a[href], button, summary, input, select, textarea, [role=button]')) {
    if (hiddenWhy(c) || alpha(c) < 0.05) continue;
    if (c.closest('p, li > p, dd') && c.tagName === 'A' && getComputedStyle(c).display === 'inline') continue;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // A target can be wider than its drawing: an absolute ::before/::after hit
    // area counts, at its used size.
    let pw = 0, ph = 0;
    for (const p of ['::before', '::after']) {
      const s = getComputedStyle(c, p);
      if (s.content === 'none' || s.position !== 'absolute') continue;
      pw = Math.max(pw, parseFloat(s.width) || 0);
      ph = Math.max(ph, parseFloat(s.height) || 0);
    }
    const m = Math.min(Math.max(r.width, pw), Math.max(r.height, ph));
    const label = (c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 30);
    if (m < 24) small.push({ sec: sec(c), label, w: Math.round(r.width), h: Math.round(r.height) });
    else if (m < 44) warn.push({ sec: sec(c), label, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return {
    overlaps, clipped, invisible: stuck, media, video, small, warn,
    hscroll: document.documentElement.scrollWidth - innerWidth,
  };
}
"""


def walk(page):
    h = page.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(150)
        y += 500
    page.wait_for_timeout(1200)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)


def run(pw, w, motion, path="/", probe=True):
    br = pw.chromium.launch(channel="chrome")
    ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1,
                         has_touch=w < 700, is_mobile=w < 700, reduced_motion=motion)
    page = ctx.new_page()
    errors, failed = [], []
    page.on("console", lambda m: m.type == "error" and errors.append(m.text[:160]))
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))
    page.on("response", lambda r: r.status >= 400 and failed.append(f"{r.status} {r.url.replace(ORIGIN, '')}"))
    # A cross-origin no-cors probe (LiveStatus) that the browser aborts is not a broken
    # resource; its own status line says what happened. Everything else counts.
    page.on("requestfailed", lambda r: (r.url.startswith(ORIGIN) or "ERR_ABORTED" not in (r.failure or ""))
            and failed.append(f"failed {r.url.replace(ORIGIN, '')} {r.failure}"))
    # Film requests continue after load, so network idle is not a page-readiness signal.
    page.goto(ORIGIN + path, wait_until="load")
    page.wait_for_timeout(2000)
    out = {"errors": errors, "failed": failed}
    if probe:
        walk(page)
        out.update(page.evaluate(PROBE))
    br.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=WIDTHS)
    ap.add_argument("--routes", action="store_true")
    a = ap.parse_args()
    report = {"build": _cache.build_id(), "runs": {}}
    fails = 0
    with sync_playwright() as pw:
        for w in a.width:
            for motion in ("reduce", "no-preference"):
                r = run(pw, w, motion)
                key = f"{w}-{'calm' if motion == 'reduce' else 'motion'}"
                report["runs"][key] = r
                f = len(r["overlaps"]) + len(r["clipped"]) + len(r["invisible"]) + len(r["media"]) + len(r["video"]) + len(r["errors"]) + len(r["failed"]) + len(r["small"]) * (w < 700) + (r["hscroll"] > 0)
                fails += f
                print(f"{key}: overlaps {len(r['overlaps'])} clipped {len(r['clipped'])} invisible {len(r['invisible'])} "
                      f"media {len(r['media']) + len(r['video'])} errors {len(r['errors'])} failed {len(r['failed'])} "
                      f"small {len(r['small'])} warn44 {len(r['warn'])} hscroll {r['hscroll']}")
        if a.routes:
            for p in ROUTES:
                r = run(pw, 1440, "no-preference", p, probe=False)
                report["runs"][p] = r
                fails += len(r["errors"]) + len(r["failed"])
                print(f"{p}: errors {len(r['errors'])} failed {len(r['failed'])}")
    out = os.path.join(V2, "docs", "ui-defects.json")
    json.dump(report, open(out, "w"), indent=1)
    print(out)
    print("PASS" if not fails else f"FAIL {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
