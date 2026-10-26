"""Accessible-name and contrast gate with axe-core (the copy in ../node_modules).

    python3 scripts/ui-axe.py               390 and 1440
    python3 scripts/ui-axe.py --force

Gate rules (any violation fails): link-name, button-name, identical-links-same-purpose
(axe reports a shared name with different targets as "incomplete", so incomplete fails
for that rule), image-alt, aria-hidden-focus, nested-interactive, color-contrast.
Contrast over the film video cannot be computed by axe (it returns "incomplete"); those
nodes are a warning here and film-contrast.py measures their pixels instead.
Writes docs/ui-axe.json. Exit 1 on any failure.
"""

import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
OUT = os.path.join(HERE, "..", "docs", "ui-axe.json")
AXE = os.path.join(HERE, "..", "..", "node_modules", "axe-core", "axe.min.js")
GATE = ["link-name", "button-name", "identical-links-same-purpose", "image-alt", "aria-hidden-focus", "nested-interactive", "color-contrast"]
INCOMPLETE_FAILS = {"identical-links-same-purpose"}

RUN = """async (rules) => {
  const r = await axe.run(document, {runOnly: {type: 'rule', values: rules}, resultTypes: ['violations', 'incomplete']});
  const pick = (list) => list.map((v) => ({id: v.id, impact: v.impact, count: v.nodes.length,
    nodes: v.nodes.slice(0, 4).map((n) => ({target: n.target.join(' ').slice(0, 90), html: n.html.slice(0, 110), why: (n.any[0] || n.all[0] || n.none[0] || {}).message || ''}))}));
  return {violations: pick(r.violations), incomplete: pick(r.incomplete), version: axe.version};
}"""


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
    if not os.path.exists(AXE):
        print("axe-core missing at", os.path.normpath(AXE))
        sys.exit(2)
    src = open(AXE).read()
    report, fails, warns = {}, [], []
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        for w in a.width:
            ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844}, device_scale_factor=1, has_touch=w < 700, is_mobile=w < 700)
            page = ctx.new_page()
            page.goto(f"{ORIGIN}/classic", wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            page.evaluate(src)
            res = page.evaluate(RUN, GATE)
            ctx.close()
            report[f"w{w}"] = {"violations": res["violations"], "incomplete": [{"id": i["id"], "count": i["count"]} for i in res["incomplete"]], "axe": res["version"]}
            for v in res["violations"]:
                fails.append(f"w{w} [{v['id']}] {v['count']} nodes, first {v['nodes'][0]['target']}: {v['nodes'][0]['why'][:70]}")
            for i in res["incomplete"]:
                if i["id"] in INCOMPLETE_FAILS:
                    fails.append(f"w{w} [{i['id']}] {i['count']} nodes share a name but differ in target, first {i['nodes'][0]['html'][:80]}")
                else:
                    warns.append(f"w{w} [{i['id']}] {i['count']} nodes need review (axe cannot compute over video)")
        br.close()
    report["fails"], report["warns"], report["build"], report["widths"] = fails, warns, _cache.build_id(), a.width
    json.dump(report, open(OUT, "w"), indent=1)
    for k, r in report.items():
        if k.startswith("w") and isinstance(r, dict):
            print(f"{k}: {sum(v['count'] for v in r['violations'])} violations, incomplete {[(i['id'], i['count']) for i in r['incomplete']]}")
    print("FAIL" if fails else "PASS", f"({len(fails)} fails, {len(warns)} warnings)")
    for f in fails[:14]:
        print("  ", f[:170])
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
