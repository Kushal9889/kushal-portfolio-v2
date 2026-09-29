"""Measure /classic for the film compiler: section and transit geometry, the dark
grounds each layer paints, and where every sync phrase sits.

    python3 scripts/film-measure.py              1280, 1440 and 1920 wide
    python3 scripts/film-measure.py --width 1440

Writes ../.playwright-mcp/film/measure-<width>.json and prints a summary.
"""

import argparse
import json
import os

from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "..", ".playwright-mcp", "film")

# Phrases the plan links to 3D parts (C2.6). Exact text or a selector.
PHRASES = {
    "S02": "GROUNDED IN",
    "S03": "hybrid BM25",
    "S04": "Cohere re-ranking",
    "S05": "RAG retrieval",
    "S06": "in-memory",
    "S07": "transformer",
    "S08": "1373",
    "S09": "recall@k",
    "S10": "pgvector",
    "S11": "inference stack",
    "S12": "Server-Sent Events",
    "S13": "Production deploys",
}

MEASURE = """(phrases) => {
  const doc = document.documentElement;
  const rect = (el) => { const r = el.getBoundingClientRect(); return {top: Math.round(r.top + scrollY), height: Math.round(r.height), left: Math.round(r.left), width: Math.round(r.width)}; };
  const sections = [...document.querySelectorAll('main > section, main > div[data-transit]')].map(el => ({
    id: el.id || null, transit: el.dataset.transit || null, ...rect(el),
  }));
  // Every layer that paints a background at a point, top to bottom.
  const stack = (x, y) => document.elementsFromPoint(x, y).map(el => {
    const cs = getComputedStyle(el);
    return {tag: el.tagName.toLowerCase(), id: el.id || null, cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 60),
      bg: cs.backgroundColor, img: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 80), mix: cs.mixBlendMode, op: cs.opacity};
  }).filter(l => l.bg !== 'rgba(0, 0, 0, 0)' || l.img || l.mix !== 'normal');
  const found = {};
  for (const [id, text] of Object.entries(phrases)) {
    const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const i = n.textContent.indexOf(text);
      if (i < 0) continue;
      const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + text.length);
      const r = range.getBoundingClientRect();
      const sec = n.parentElement.closest('main > section, main > div[data-transit]');
      hits.push({top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width), section: sec ? (sec.id || sec.dataset.transit) : null});
    }
    found[id] = hits;
  }
  return {
    width: innerWidth, height: innerHeight, page: doc.scrollHeight,
    theme: doc.dataset.theme || null, film: doc.dataset.film || null,
    sections, stacks: {top: stack(300, 20), section: stack(700, 400), dock: stack(700, innerHeight - 20)},
    phrases: found,
  };
}"""


def run(width: int, url: str) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": width, "height": 900}, color_scheme="dark")
        page.goto(url)
        page.wait_for_timeout(2500)
        page.mouse.move(10, 10)
        try:
            page.wait_for_function("document.documentElement.dataset.film === 'live'", timeout=20000)
        except Exception:
            pass
        # Scroll to the first section so the stack sample lands on a section ground.
        page.evaluate("() => { const s = document.querySelector('main > section#work'); if (s) scrollTo(0, s.offsetTop + 200); }")
        page.wait_for_timeout(800)
        data = page.evaluate(MEASURE, PHRASES)
        browser.close()
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3002/classic?film=debug")
    ap.add_argument("--width", type=int, nargs="*", default=[1280, 1440, 1920])
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for w in args.width:
        d = run(w, args.url)
        with open(os.path.join(OUT, f"measure-{w}.json"), "w") as f:
            json.dump(d, f, indent=1)
        vh = d["height"]
        print(f"== {w}px: page {d['page']}px = {d['page'] / vh:.1f} vh, film={d['film']}")
        for s in d["sections"]:
            print(f"  {(s['id'] or s['transit']):<12} top {s['top']:>6}  h {s['height']:>5} = {s['height'] / vh:4.2f} vh  x {s['left']}-{s['left'] + s['width']}")
        for k, st in d["stacks"].items():
            print(f"  ground[{k}]:", [(l['tag'], l['id'] or l['cls'][:24], l['bg'], l['mix']) for l in st][:5])
        for k, hits in d["phrases"].items():
            print(f"  {k} {PHRASES[k]!r}: {[(h['section'], h['top']) for h in hits] or 'NOT FOUND'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
