import json, sys
from playwright.sync_api import sync_playwright
js = open("scripts/ui-deep-audit.js").read()
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for w, h, mob in [(1440, 900, False), (390, 844, True)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=mob, has_touch=mob, reduced_motion="no-preference")
        ctx.add_init_script("try{localStorage.setItem('motion','allowed')}catch(e){}")
        pg = ctx.new_page()
        pg.goto("http://localhost:3007/", wait_until="load", timeout=90000)
        pg.wait_for_timeout(2500)
        # walk the page so lazy content mounts
        H = pg.evaluate("document.documentElement.scrollHeight")
        for y in range(0, H, h):
            pg.evaluate(f"scrollTo(0,{y})"); pg.wait_for_timeout(120)
        pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(400)
        out[f"{w}"] = pg.evaluate(js + "\n;deepAudit()")
        ctx.close()
    b.close()
json.dump(out, open(sys.argv[1], "w"), indent=1)
for k, v in out.items():
    print(k, v["viewport"], json.dumps(v["counts"]))
