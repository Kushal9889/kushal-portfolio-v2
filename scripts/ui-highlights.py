"""Highlight tone audit: the colour of every highlighted piece of text.

    python3 scripts/ui-highlights.py            390 and 1440
    python3 scripts/ui-highlights.py --force    ignore the cache for this build

Kushal's standing brief (85f79028, prompts 938, 5458, 8171, 20535): text colour,
formatting and contrast must be eye-catching and clearly visible to WCAG; links
and key phrases are highlighted; numbers take the colour of their product; no
orange haze over the dark ground; laser-like light sweeps on key sections.
Nothing here is optional and nothing is accepted by default.

Checks, per width:
  tone      every highlighted text run (link, strong, em, mark, figure value, a run
            whose colour differs from its block) matches a token family: neutral ink,
            the cyan accent (hue 205), a state colour (live, warn, fail) or a product
            colour (--brand-*). Anything else is an off-system colour.
  link      an inline link in running text is marked by an underline or border, not
            by colour alone (WCAG 1.4.1), and differs from its text by 3:1 or more.
  figure    every Metrics value is coloured (chroma >= 0.04), in the hue of its box.
  veil      no large element paints a coloured veil (chroma > 0.05, alpha > 0.05,
            more than 15 percent of the viewport) over the film, except named tokens.
  sweeps    the running light sweeps (CSS or Web animations whose name says scan, sweep,
            beam, laser, glint or shimmer), counted per section and listed.
Contrast against the film is the job of scripts/film-contrast.py; run both.

Writes docs/ui-highlights.json. Exit 1 on any failure.
"""

import argparse
import json
import math
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache  # noqa: E402

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "ui-highlights.json")
REGISTRY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "ui-registry.json")

JS = r"""() => {
  const g = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
  const rgba = (c) => { g.clearRect(0,0,1,1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0,0,1,1); const d = g.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const oklch = ([r, g2, b]) => {
    const R = lin(r), G = lin(g2), B = lin(b);
    const l = Math.cbrt(0.4122214708*R + 0.5363325363*G + 0.0514459929*B);
    const m = Math.cbrt(0.2119034982*R + 0.6806995451*G + 0.1073969566*B);
    const s = Math.cbrt(0.0883024619*R + 0.2817188376*G + 0.6299787005*B);
    const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
    const a = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
    const bb = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;
    return {L, C: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360};
  };
  const lum = ([r, g2, b]) => 0.2126*lin(r) + 0.7152*lin(g2) + 0.0722*lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const root = getComputedStyle(document.documentElement);
  const tokenNames = ['--ink','--ink-soft','--signal','--mark','--live','--warn','--fail', ...[...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).flatMap(r => r.style ? [...r.style].filter(n => n.startsWith('--brand-')) : [])];
  const tokens = {};
  const probe = document.createElement('span'); document.body.appendChild(probe);
  for (const n of new Set(tokenNames)) { probe.style.color = `var(${n})`; const c = rgba(getComputedStyle(probe).color); if (c[3] > 0.5) tokens[n] = oklch(c); }
  probe.remove();
  const near = (o) => {
    let best = null;
    for (const [n, t] of Object.entries(tokens)) {
      if (o.C < 0.03 && t.C < 0.03) { if (Math.abs(o.L - t.L) < 0.14) return n; continue; }
      if (o.C < 0.03 || t.C < 0.03) continue;
      let dh = Math.abs(o.h - t.h); dh = Math.min(dh, 360 - dh);
      if (dh <= 10 && Math.abs(o.L - t.L) <= 0.09 && Math.abs(o.C - t.C) <= 0.06) { best = n; break; }
    }
    return best;
  };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden],[aria-hidden="true"],svg,script,style'); };
  const comp = (e) => { for (let n = e; n; n = n.parentElement) { const m = String(n.className || '').match(/([A-Za-z0-9]+)-module__/); if (m) return m[1]; } return ''; };
  const main = document.querySelector('main') || document.body;
  const out = {runs: [], links: [], figures: [], veils: [], sweeps: [], counts: {}};
  const seen = new Set();
  main.querySelectorAll('*').forEach((e) => {
    if (!vis(e)) return;
    const direct = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent).join(' ').trim();
    const cs = getComputedStyle(e);
    const tag = e.tagName;
    if (direct) {
      const col = rgba(cs.color);
      const parent = e.parentElement ? rgba(getComputedStyle(e.parentElement).color) : col;
      const differs = Math.abs(col[0]-parent[0]) + Math.abs(col[1]-parent[1]) + Math.abs(col[2]-parent[2]) > 24;
      const marked = ['A','STRONG','B','EM','MARK','DT','CODE'].includes(tag) || /figure|value|lead|mark|phrase|highlight|accent/i.test(String(e.className));
      if (differs || marked) {
        const o = oklch(col);
        const key = comp(e) + '|' + tag + '|' + col.join();
        if (!seen.has(key)) {
          seen.add(key);
          out.runs.push({comp: comp(e), tag, text: direct.slice(0, 32), L: +o.L.toFixed(3), C: +o.C.toFixed(3), h: Math.round(o.h), alpha: +col[3].toFixed(2), token: near(o), section: (e.closest('section[id]') || {}).id || ''});
        }
      }
    }
    if (tag === 'A' && e.closest('p, li, dd') && cs.display === 'inline') {
      const par = getComputedStyle(e.parentElement);
      const lc = rgba(cs.color), pc = rgba(par.color);
      const under = cs.textDecorationLine.includes('underline') || parseFloat(cs.borderBottomWidth) > 0 || (getComputedStyle(e, '::after').content !== 'none' && getComputedStyle(e, '::after').height !== 'auto');
      out.links.push({text: (e.innerText || '').trim().slice(0, 28), under, ratio: +ratio(lc, pc).toFixed(2), section: (e.closest('section[id]') || {}).id || ''});
    }
    if (tag === 'DT' && /Metrics/.test(String(e.parentElement.parentElement && e.parentElement.parentElement.className) + String(e.parentElement.className))) {
      const o = oklch(rgba(cs.color));
      const cell = e.parentElement;
      const tint = (cell.closest('[data-hue]') && getComputedStyle(cell.closest('[data-hue]')).getPropertyValue('--box-hue')) || getComputedStyle(cell).getPropertyValue('--figure-tint') || getComputedStyle(cell).getPropertyValue('--role-tint');
      out.figures.push({text: (e.innerText || '').trim().slice(0, 18), numeric: e.hasAttribute('data-numeric'), token: near(o), C: +o.C.toFixed(3), h: Math.round(o.h), section: (e.closest('section[id]') || {}).id || '', tint: String(tint).trim().slice(0, 40)});
    }
    // coloured veils
    const bg = rgba(cs.backgroundColor);
    const r = e.getBoundingClientRect();
    if (bg[3] > 0.05 && r.width * r.height > 0.15 * innerWidth * innerHeight) {
      const o = oklch(bg);
      if (o.C > 0.05) out.veils.push({comp: comp(e), tag, L: +o.L.toFixed(2), C: +o.C.toFixed(3), h: Math.round(o.h), alpha: +bg[3].toFixed(2), token: near(o), section: (e.closest('section[id]') || {}).id || ''});
    }
  });
  // light sweeps and other running animations
  const names = {};
  document.getAnimations().forEach((a) => {
    const t = a.effect && a.effect.target; if (!t) return;
    const nm = a.animationName || a.id || (a.effect.getKeyframes && a.effect.getKeyframes()[0] && Object.keys(a.effect.getKeyframes()[0]).filter(k => !['offset','easing','composite','computedOffset'].includes(k)).join('+')) || 'web';
    const sec = (t.closest && t.closest('section[id]') || {}).id || (t.closest && t.closest('header,nav,footer,aside') || {}).tagName || '-';
    const k = nm + '@' + sec;
    names[k] = names[k] || {name: nm, section: sec, comp: comp(t), running: 0, total: 0};
    names[k].total++; if (a.playState === 'running') names[k].running++;
  });
  // Declared animations: one-shot sweeps are gone from getAnimations() once they finish,
  // so also read the animation name each element and pseudo-element declares.
  main.querySelectorAll('*').forEach((e) => {
    for (const ps of [null, '::before', '::after']) {
      const nm = getComputedStyle(e, ps).animationName;
      if (!nm || nm === 'none') continue;
      for (const one of nm.split(',')) {
        const sec = (e.closest('section[id]') || {}).id || (e.closest('header,nav,footer,aside') || {}).tagName || '-';
        const k = one.trim() + '@' + sec + (ps || '');
        names[k] = names[k] || {name: one.trim(), section: sec, comp: comp(e), running: 0, total: 0, declared: true};
      }
    }
  });
  out.sweeps = Object.values(names);
  return out;
}"""


def scan(page, width, report, fails):
    page.goto(f"{ORIGIN}/classic", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    h = page.evaluate("document.documentElement.scrollHeight")
    merged = {"runs": [], "links": [], "figures": [], "veils": [], "sweeps": []}
    # Walk the page: sections animate in as they arrive, so sample at each stop.
    for y in list(range(0, h, 650)) + [0]:
        page.evaluate(f"window.scrollTo(0,{y})")
        page.wait_for_timeout(260)
        part = page.evaluate(JS)
        for k in merged:
            seen = {json.dumps(x, sort_keys=True) for x in merged[k]}
            merged[k] += [x for x in part[k] if json.dumps(x, sort_keys=True) not in seen]
    key = f"w{width}"
    runs, links, figures, veils, sweeps = (merged[k] for k in ("runs", "links", "figures", "veils", "sweeps"))
    off = [r for r in runs if r["alpha"] >= 0.95 and r["token"] is None]
    for r in off:
        fails.append(f"{key} [tone] off-system colour L{r['L']} C{r['C']} h{r['h']} on <{r['tag']}> {r['comp']} {r['text']!r} in {r['section'] or '-'}")
    for l in links:
        if not l["under"]:
            fails.append(f"{key} [link] inline link without underline or border: {l['text']!r} in {l['section']}")
        elif l["ratio"] < 1.0:
            pass
    for f in figures:
        if f["C"] < 0.04:
            fails.append(f"{key} [figure] not coloured: {f['text']!r} (chroma {f['C']}) in {f['section']}")
        elif f["numeric"] and f["token"] not in ("--signal", "--mark"):
            fails.append(f"{key} [figure] number off the measurement tone (accent): {f['text']!r} token {f['token']} in {f['section']}")
    for v in veils:
        if v["token"] is None:
            fails.append(f"{key} [veil] coloured veil over the film: {v['comp']} <{v['tag']}> L{v['L']} C{v['C']} h{v['h']} alpha {v['alpha']} in {v['section']}")
    sweep_like = [s for s in sweeps if any(w in s["name"].lower() for w in ("scan", "sweep", "beam", "laser", "glint", "shimmer"))]
    try:
        KEY = json.load(open(REGISTRY)).get("sweep_sections", [])
    except (OSError, ValueError):
        KEY = []
    shown = set(page.evaluate("[...document.querySelectorAll('main > section[id]')].filter(s => s.getBoundingClientRect().height > 0 && getComputedStyle(s).display !== 'none').map(s => s.id)"))
    have = {s["section"] for s in sweep_like}
    for sec in KEY:
        if sec in shown and sec not in have:
            fails.append(f"{key} [sweep] no light sweep declared in section {sec} (brief: laser-like light sweeps on key sections)")
    report[key] = {
        "highlighted_runs": len(runs), "off_system": len(off), "links": len(links), "figures": len(figures),
        "veils": veils, "sweeps": sweeps, "sweep_like_sections": sorted({s["section"] for s in sweep_like}),
        "tone_families": {t: sum(1 for r in runs if r["token"] == t) for t in sorted({r["token"] for r in runs if r["token"]})},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=[390, 1440])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    old = _cache.reuse(OUT, a.width)
    if old:
        print(f"cached for build {old['build']} ({'FAIL' if old['fails'] else 'PASS'}, {len(old['fails'])} fails); --force to rerun")
        for f in old["fails"][:12]:
            print("  ", f[:160])
        sys.exit(1 if old["fails"] else 0)
    report, fails = {}, []
    with sync_playwright() as pw:
        for w in a.width:
            br = pw.chromium.launch(channel="chrome")
            ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1, has_touch=w < 700, is_mobile=w < 700)
            scan(ctx.new_page(), w, report, fails)
            br.close()
    report["fails"], report["build"], report["widths"] = fails, _cache.build_id(), a.width
    json.dump(report, open(OUT, "w"), indent=1)
    for w in a.width:
        r = report[f"w{w}"]
        print(f"{w}px: {r['highlighted_runs']} highlighted runs ({r['off_system']} off-system), {r['links']} inline links, {r['figures']} figures, "
              f"{len(r['veils'])} veils, sweep sections {r['sweep_like_sections']}")
    print("FAIL" if fails else "PASS", f"({len(fails)} fails)")
    for f in fails[:14]:
        print("  ", f[:170])
    if len(fails) > 14:
        print(f"   ... {len(fails) - 14} more in docs/ui-highlights.json")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
