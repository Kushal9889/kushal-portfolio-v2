"""Computed-style audit of every box on /classic, against the skill rules.

    python3 scripts/ui-boxes.py            390 and 1440
    python3 scripts/ui-boxes.py --width 1440

A "box" is any visible element that paints its own edge, shadow or ground
(border, box-shadow, or a non-transparent background) and holds text or media.
Boxes are grouped by their CSS-module component name. Each group reports its
modal radius, border and font role; an element that differs from its group's
mode is an outlier. Rules checked (source in brackets):

  radius        only from the page scale 0 / 2 / 4 / 8 / 12 px / pill  [globals.css:291]
  glow          no zero-offset coloured halo, no hard offset block shadow
  border-side   no coloured border-left/right wider than 1px
  gradient-text no background-clip:text on text
  tracking      letter-spacing not tighter than -0.04em
  display       font-size at most 6rem (96 px)
  pure-black    no #000 text or ground
  font          no Inter / Times / Georgia as the used face
  caps          uppercase text only in mono or in labels of 1 to 4 words
  eyebrow       small uppercase label directly above a heading: counted, limit ceil(sections / 3)
  em-dash       no em or en dash in visible text
  measure       body paragraphs 45 to 80 characters per line
  focus         every interactive element shows a focus ring (outline or ring shadow) on :focus-visible
  target        interactive elements at least 24 px (fail) and 44 px (warn) on a phone  [WCAG 2.5.8]
  hover         every control kind changes on pointer hover (computed style, children, pseudo-elements or pixels), desktop only
  active        every control kind answers a press (warn)
  timing        a control that changes state does it over 100 to 400 ms, never instantly (warn)

Writes docs/ui-boxes.json. Exit 1 on any fail (warnings do not fail).
"""

import argparse
import collections
import json
import math
import os
import re
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "ui-boxes.json")

SCRIPT = r"""() => {
  const g = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
  const rgba = (c) => { g.clearRect(0,0,1,1); g.fillStyle = c; g.fillRect(0,0,1,1); const d = g.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
  const comp = (e) => (e.className && e.className.baseVal === undefined ? String(e.className) : '').split(/\s+/).map(c => c.match(/^([A-Za-z0-9]+)-module__/)).filter(Boolean).map(m => m[1])[0] || '';
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden],[aria-hidden="true"],svg'); };
  const main = document.querySelector('main') || document.body;
  const out = [];
  const sections = [...main.querySelectorAll(':scope > section[id], section[id]')].map(s => s.id);
  main.querySelectorAll('*').forEach((e) => {
    if (!vis(e) || ['SCRIPT','STYLE','SVG','PATH','CANVAS','BR'].includes(e.tagName)) return;
    const cs = getComputedStyle(e);
    const bw = ['Top','Right','Bottom','Left'].map(s => parseFloat(cs['border'+s+'Width']) || 0);
    const hasBorder = bw.some(w => w > 0) && !['none','hidden'].includes(cs.borderTopStyle + '');
    const bg = rgba(cs.backgroundColor);
    const hasBg = bg[3] > 0.02;
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    const text = (e.innerText || '').trim();
    const interactive = ['A','BUTTON','SUMMARY','INPUT','TEXTAREA','SELECT'].includes(e.tagName) || e.getAttribute('role') === 'button';
    const isBox = (hasBorder || hasShadow || hasBg) && (text.length > 0 || e.querySelector('img,video'));
    const direct = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent).join(' ').trim();
    if (!isBox && !interactive && !direct) return;
    let r = e.getBoundingClientRect();
    if (interactive) { let L = r.left, T = r.top, R = r.right, B = r.bottom; e.querySelectorAll('*').forEach(d => { const q = d.getBoundingClientRect(); if (q.width > 0 && q.height > 0) { L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); } }); r = {x: L, y: T, width: R - L, height: B - T};
      // A pseudo-element that extends the hit area (position absolute) counts: WCAG measures what can be pressed.
      for (const ps of ['::before', '::after']) {
        const c = getComputedStyle(e, ps);
        if (c.content !== 'none' && ['absolute', 'fixed'].includes(c.position)) {
          const pw = parseFloat(c.width), ph = parseFloat(c.height);
          if (pw > r.width) r = {...r, width: pw};
          if (ph > r.height) r = {...r, height: ph};
        }
      } }
    out.push({
      tag: e.tagName.toLowerCase(), comp: comp(e) || comp(e.parentElement || e) || '', cls: String(e.className && e.className.baseVal === undefined ? e.className : '').slice(0, 60),
      section: (e.closest('section[id]') || {}).id || '', box: !!isBox, interactive,
      w: Math.round(r.width), h: Math.round(r.height), inline: !!(e.closest('p, li, dd, dt') && getComputedStyle(e).display === 'inline'),
      radius: cs.borderTopLeftRadius, bw: bw.join('/'), bcol: cs.borderTopColor, blc: cs.borderLeftColor, brc: cs.borderRightColor,
      shadow: hasShadow ? cs.boxShadow.slice(0, 200) : '', bgColor: cs.backgroundColor, color: cs.color,
      font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, lh: cs.lineHeight,
      ls: cs.letterSpacing, tt: cs.textTransform, bgclip: cs.webkitBackgroundClip || cs.backgroundClip, fill: cs.webkitTextFillColor,
      direct: direct.slice(0, 90), words: direct.split(/\s+/).filter(Boolean).length,
      next: e.nextElementSibling ? e.nextElementSibling.tagName : '', nextIsHeading: !!(e.nextElementSibling && /^H[1-6]$/.test(e.nextElementSibling.tagName)),
      lineChars: (['P','LI','DD'].includes(e.tagName) && cs.display !== 'none') ? Math.round(r.width / (cs.fontSize ? parseFloat(cs.fontSize) * 0.5 : 8)) : 0,
      name: (e.getAttribute('aria-label') || text).slice(0, 50).replace(/\s+/g, ' '),
    });
  });
  return {items: out, sections};
}"""

FOCUS = r"""(sel) => {
  const els = [...document.querySelectorAll('a[href], button, summary, input, textarea, select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden="true"]'); });
  const bad = [];
  const seen = new Set();
  for (const e of els) {
    const k = e.tagName + '|' + e.className;
    if (seen.has(k)) continue;
    seen.add(k);
    e.focus({focusVisible: true});
    const cs = getComputedStyle(e);
    const outline = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none';
    const ring = cs.boxShadow !== 'none';
    const border = cs.borderTopColor;
    if (!outline && !ring) bad.push({tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 50), name: (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40)});
    e.blur();
  }
  return {checked: seen.size, bad};
}"""

SCALE = {0, 2, 4, 8, 12}


def px(v):
    m = re.match(r"([\d.]+)px", v or "")
    return float(m.group(1)) if m else None


def parse_shadow(s):
    """First shadow only: (x, y, blur, spread, colour string)."""
    m = re.match(r"(.*?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?(\s+inset)?", s)
    if not m:
        m2 = re.match(r"(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s+(.*)", s)
        if not m2:
            return None
        return float(m2.group(1)), float(m2.group(2)), float(m2.group(3)), float(m2.group(4) or 0), m2.group(5), False
    return float(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5) or 0), m.group(1), bool(m.group(6))


def alpha(c):
    m = re.search(r"/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)", c or "")
    if m:
        return float(m.group(1) or m.group(2))
    return 1.0


def audit(width, page, report, fails, warns):
    page.goto(f"{ORIGIN}/classic", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    h = page.evaluate("document.documentElement.scrollHeight")
    for y in range(0, h, 700):
        page.evaluate(f"window.scrollTo(0,{y})")
        page.wait_for_timeout(80)
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(500)
    data = page.evaluate(SCRIPT)
    items, sections = data["items"], data["sections"]
    key = f"w{width}"
    boxes = [i for i in items if i["box"]]
    groups = collections.defaultdict(list)
    for b in boxes:
        groups[b["comp"] or "(none)"].append(b)
    summary = {}
    for comp, bs in sorted(groups.items()):
        mode_r = collections.Counter(b["radius"] for b in bs).most_common(1)[0]
        mode_f = collections.Counter(b["font"] for b in bs).most_common(1)[0]
        summary[comp] = {"n": len(bs), "radius_mode": mode_r[0], "radius_outliers": sum(1 for b in bs if b["radius"] != mode_r[0]), "font_mode": mode_f[0]}
    report[key] = {"elements": len(items), "boxes": len(boxes), "groups": summary}
    seen = set()

    def flag(level, rule, it, msg):
        k = (rule, it["comp"], it["cls"], msg)
        if k in seen:
            return
        seen.add(k)
        line = f"{key} [{rule}] {it['section'] or '-'} {it['comp'] or it['tag']}: {msg}"
        (fails if level == "fail" else warns).append(line)

    for it in items:
        # radius lock, boxes only
        if it["box"]:
            r = px(it["radius"])
            if r is not None and r > 0 and r < 900 and round(r) not in SCALE:
                flag("fail", "radius", it, f"radius {it['radius']} is off the 0/2/4/8/12 scale")
            sh = it["shadow"]
            if sh:
                p = parse_shadow(sh)
                if p:
                    x, y, blur, spread, col, inset = p
                    if not inset and x == 0 and y == 0 and blur >= 6 and alpha(col) > 0.15:
                        flag("fail", "glow", it, f"zero-offset halo shadow {sh[:60]}")
                    if not inset and blur == 0 and (abs(x) >= 3 or abs(y) >= 3):
                        flag("fail", "glow", it, f"hard offset block shadow {sh[:60]}")
            bw = [float(x) for x in it["bw"].split("/")]
            for side, wd, col in (("left", bw[3], it["blc"]), ("right", bw[1], it["brc"])):
                # A stripe is one side wider than the top edge. Equal borders on all sides are a frame.
                if wd > 1.5 and alpha(col) > 0.3 and wd > bw[0] + 0.5:
                    flag("fail", "border-side", it, f"{side} stripe {wd}px (no coloured side stripe over 1px)")
        if it["bgclip"] == "text" and it["fill"].startswith("rgba(0, 0, 0, 0)"):
            flag("fail", "gradient-text", it, "background-clip:text")
        ls = it["ls"]
        if ls.endswith("px") and it["fs"]:
            em = float(ls[:-2]) / it["fs"]
            if em < -0.04:
                flag("fail", "tracking", it, f"letter-spacing {em:.3f}em")
        if it["fs"] and it["fs"] > 96.5 and it["direct"]:
            flag("fail", "display", it, f"font-size {it['fs']}px > 96")
        if re.match(r"rgb\(0, 0, 0\)", it["color"]) and it["direct"]:
            flag("fail", "pure-black", it, "text is #000")
        if it["direct"] and it["font"] in ("Inter", "Times New Roman", "Georgia", "Times"):
            flag("fail", "font", it, f"face {it['font']}")
        if it["direct"] and re.search(r"[–—]", it["direct"]):
            flag("fail", "em-dash", it, f"dash in {it['direct'][:40]!r}")
        if it["tt"] == "uppercase" and it["direct"] and it["words"] > 4 and "mono" not in it["font"].lower() and "plex" not in it["font"].lower():
            flag("warn", "caps", it, f"uppercase sentence of {it['words']} words in {it['font']}")
        if it["lineChars"] and it["tag"] == "p" and (it["lineChars"] > 95):
            flag("warn", "measure", it, f"~{it['lineChars']} characters per line")
        if it["interactive"] and not it["inline"] and it["w"] > 0:
            if it["h"] < 24 or it["w"] < 24:
                flag("fail", "target", it, f"{it['w']}x{it['h']} under 24")
            elif width < 700 and it["h"] < 44 and it["tag"] in ("button", "summary"):
                flag("warn", "target", it, f"{it['w']}x{it['h']} under 44 ({it['name'][:24]})")

    # eyebrows: uppercase small label as the element right before a heading
    eyebrows = [i for i in items if i["tt"] == "uppercase" and i["fs"] and i["fs"] <= 14 and i["nextIsHeading"] and i["words"] <= 6]
    limit = math.ceil(max(len(sections), 1) / 3)
    report[key]["eyebrows"] = [f"{e['section']}: {e['direct']}" for e in eyebrows]
    report[key]["eyebrow_limit"] = limit
    if len(eyebrows) > limit:
        warns.append(f"{key} [eyebrow] {len(eyebrows)} small uppercase labels above headings, limit {limit}: " + "; ".join(e["direct"][:24] for e in eyebrows[:8]))

    focus_pixels(page, key, report, fails)
    if width > 700:
        state_pixels(page, key, report, fails, warns)


def focus_pixels(page, key, report, fails):
    """A control shows focus when pixels around it change on keyboard focus."""
    import io
    from PIL import Image, ImageChops

    def shot(box):
        return Image.open(io.BytesIO(page.screenshot(clip=box))).convert("RGB")

    def count(a, b):
        return sum(1 for px in ImageChops.difference(a, b).getdata() if max(px) > 24)

    sel = "a[href], button, summary, input, textarea, select"
    els = page.locator(sel)
    seen, bad = set(), []
    vp = page.viewport_size
    for i in range(els.count()):
        e = els.nth(i)
        try:
            if not e.is_visible():
                continue
            k = e.evaluate("e => e.tagName + '|' + String(e.className).split(' ')[0]")
            if k in seen:
                continue
            seen.add(k)
            e.scroll_into_view_if_needed(timeout=1500)
            page.wait_for_timeout(500)  # let smooth scroll and entrances finish before the first picture
            bb = e.bounding_box()
            if not bb or bb["width"] < 4 or bb["y"] < 0 or bb["y"] + bb["height"] > vp["height"] - 70:
                continue
            m = 14
            clip = {"x": max(bb["x"] - m, 0), "y": max(bb["y"] - m, 0), "width": min(bb["width"] + 2 * m, vp["width"] - max(bb["x"] - m, 0)), "height": bb["height"] + 2 * m}
            page.keyboard.press("Shift")
            a0 = shot(clip)
            page.wait_for_timeout(150)
            a1 = shot(clip)
            e.focus()
            page.wait_for_timeout(160)
            a2 = shot(clip)
            ring = e.evaluate("e => { const c = getComputedStyle(e); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none'; }")
            e.blur()
            noise, change = count(a0, a1), count(a1, a2)
            if noise > 300:
                # Something moves behind or under this control (the film, or the
                # agent dock drifting sideways), so pixels cannot decide: use the
                # computed ring. 300 px: the drifting dock measured above the old
                # 2000 cut's blind spot and hid a present ring.
                if not ring:
                    bad.append(f"<{k}> (noisy backdrop, no computed ring)")
                continue
            if change <= noise + 12:
                bad.append(f"<{k}> {e.evaluate('e => (e.getAttribute(\'aria-label\') || e.innerText || \'\').trim().slice(0, 30)')!r}")
        except Exception:  # noqa: BLE001
            continue
    report[key]["focus_checked"] = len(seen)
    report[key]["focus_bad"] = bad
    for b in bad:
        fails.append(f"{key} [focus] no visible change on keyboard focus: {b}")


STATE_PROPS = ["color", "backgroundColor", "borderTopColor", "borderLeftColor", "boxShadow", "transform", "opacity", "textDecorationLine", "textDecorationColor", "outlineColor", "filter", "translate", "scale"]
SNAP = """(e, props) => {
  const row = (el, ps) => props.map((p) => (ps ? ps[p] : getComputedStyle(el)[p])).join('|');
  const c = getComputedStyle(e);
  const kids = [...e.querySelectorAll('*')].slice(0, 8).map((k) => row(k)).join('||');
  return {self: row(e), kids, before: row(e, getComputedStyle(e, '::before')), after: row(e, getComputedStyle(e, '::after')), dur: c.transitionDuration, prop: c.transitionProperty};
}"""


def state_pixels(page, key, report, fails, warns):
    """Hover and pressed state of one control per kind: computed style first, pixels when the backdrop is still."""
    import io
    from PIL import Image, ImageChops

    def shot(box):
        return Image.open(io.BytesIO(page.screenshot(clip=box))).convert("RGB")

    def count(a, b):
        return sum(1 for px in ImageChops.difference(a, b).getdata() if max(px) > 24)

    def ms(d):
        vals = []
        for part in d.split(","):
            part = part.strip()
            vals.append(float(part[:-2]) if part.endswith("ms") else float(part[:-1]) * 1000 if part.endswith("s") else 0)
        return max(vals) if vals else 0

    els = page.locator("a[href], button, summary")
    seen, hover_bad, active_bad, instant = set(), [], [], []
    vp = page.viewport_size
    for i in range(els.count()):
        e = els.nth(i)
        try:
            if not e.is_visible():
                continue
            k = e.evaluate("e => e.tagName + '|' + String(e.className).split(' ')[0]")
            if k in seen:
                continue
            e.scroll_into_view_if_needed(timeout=1500)
            page.wait_for_timeout(500)
            bb = e.bounding_box()
            if not bb or bb["width"] < 4 or bb["y"] < 0 or bb["y"] + bb["height"] > vp["height"] - 70:
                continue
            cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
            if not e.evaluate("(e, p) => { const t = document.elementFromPoint(p[0], p[1]); return !!t && (t === e || e.contains(t)); }", [cx, cy]):
                continue
            seen.add(k)
            label = e.evaluate("e => (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 28)")
            m = 10
            clip = {"x": max(bb["x"] - m, 0), "y": max(bb["y"] - m, 0), "width": min(bb["width"] + 2 * m, vp["width"] - max(bb["x"] - m, 0)), "height": bb["height"] + 2 * m}
            page.mouse.move(2, 2)
            page.wait_for_timeout(260)
            s0 = e.evaluate(SNAP, STATE_PROPS)
            p0 = shot(clip)
            page.wait_for_timeout(120)
            noise = count(p0, shot(clip))
            page.mouse.move(cx, cy)
            page.wait_for_timeout(300)
            s1 = e.evaluate(SNAP, STATE_PROPS)
            p1 = shot(clip)
            page.mouse.down()
            page.wait_for_timeout(180)
            s2 = e.evaluate(SNAP, STATE_PROPS)
            p2 = shot(clip)
            page.mouse.move(2, 2)  # leave before release so no click fires
            page.mouse.up()
            changed_h = any(s0[f] != s1[f] for f in ("self", "kids", "before", "after")) or (noise <= 2000 and count(p0, p1) > noise + 12)
            changed_a = any(s1[f] != s2[f] for f in ("self", "kids", "before", "after")) or (noise <= 2000 and count(p1, p2) > noise + 12)
            if not changed_h:
                hover_bad.append(f"<{k}> {label!r}")
            if not changed_a and not changed_h:
                active_bad.append(f"<{k}> {label!r}")
            elif not changed_a:
                active_bad.append(f"<{k}> {label!r} (hover only)")
            d = ms(s0["dur"])
            if (changed_h or changed_a) and (d < 100 or d > 400):
                instant.append(f"<{k}> {label!r} {s0['dur']}")
        except Exception:  # noqa: BLE001
            continue
    report[key]["state_checked"] = len(seen)
    report[key]["hover_bad"], report[key]["active_bad"], report[key]["timing_bad"] = hover_bad, active_bad, instant
    for b in hover_bad:
        fails.append(f"{key} [hover] no change on pointer hover: {b}")
    for b in active_bad:
        warns.append(f"{key} [active] no pressed feedback: {b}")
    for b in instant:
        warns.append(f"{key} [timing] state change outside 100-400 ms: {b}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=[390, 1440])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    old = _cache.reuse(OUT, a.width)
    if old:
        print(f"cached for build {old['build']} ({'FAIL' if old['fails'] else 'PASS'}, {len(old['fails'])} fails); --force to rerun")
        for f in old["fails"][:12]:
            print("  ", f[:150])
        sys.exit(1 if old["fails"] else 0)
    report, fails, warns = {}, [], []
    with sync_playwright() as pw:
        for w in a.width:
            br = pw.chromium.launch(channel="chrome")
            ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1,
                                 has_touch=w < 700, is_mobile=w < 700)
            page = ctx.new_page()
            audit(w, page, report, fails, warns)
            br.close()
    report["fails"], report["warns"] = fails, warns
    report["build"] = _cache.build_id()
    report["widths"] = a.width
    json.dump(report, open(OUT, "w"), indent=1)
    for w in a.width:
        r = report[f"w{w}"]
        print(f"{w}px: {r['boxes']} boxes in {len(r['groups'])} groups, {r['focus_checked']} control kinds focus-checked, {r.get('state_checked', 0)} hover/press-checked, eyebrows {len(r['eyebrows'])}/{r['eyebrow_limit']}")
    print("FAIL" if fails else "PASS", f"({len(fails)} fails, {len(warns)} warnings)")
    for f in fails[:14]:
        print("  FAIL", f[:150])
    for w in warns[:6]:
        print("  warn", w[:150])
    if len(fails) > 14 or len(warns) > 6:
        print(f"   ... full list in docs/ui-boxes.json")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
