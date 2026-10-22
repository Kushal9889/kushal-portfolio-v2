"""Checks for the film link meter and the frame-request backoff (2026-10-07)."""
import random
from playwright.sync_api import sync_playwright
URL = "http://localhost:3002/classic?film=debug"
def ctxp(b, phone):
    return b.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, is_mobile=phone, has_touch=phone, device_scale_factor=2 if phone else 1, color_scheme="dark")
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    # 1. cold 1.6 Mbps phone hands over to the still
    for name, net in (("phone-4g-cold", (1.6e6 / 8, 750e3 / 8, 150)), ("phone-fast", None)):
        c = ctxp(b, True); p = c.new_page()
        if net:
            cdp = c.new_cdp_session(p); cdp.send("Network.enable"); cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "downloadThroughput": net[0], "uploadThroughput": net[1], "latency": net[2]})
        p.goto(URL, wait_until="domcontentloaded", timeout=120000)
        t = None
        for s in range(40):
            p.wait_for_timeout(500)
            if p.evaluate("document.documentElement.dataset.film") == "still": t = (s + 1) * 0.5; break
        res[name] = dict(still_after_s=t, film=p.evaluate("document.documentElement.dataset.film"), canvas=p.evaluate("!!document.querySelector('[data-film-layer] canvas')"))
        c.close()
    # 2. 40 percent of frame requests fail with 503: frames still arrive
    c = ctxp(b, False); p = c.new_page(); errs = []; fails = [0]; seen = [0]
    p.on("pageerror", lambda e: errs.append(str(e)[:120]))
    def route(r):
        seen[0] += 1
        if random.random() < 0.4: fails[0] += 1; return r.fulfill(status=503, body="")
        r.continue_()
    p.route("**/film/frames/**", route)
    p.goto(URL, wait_until="domcontentloaded", timeout=120000)
    p.wait_for_function("window.__film && window.__film.frames > 30", timeout=60000)
    p.wait_for_timeout(6000)
    res["flaky-503"] = dict(requests=seen[0], failed=fails[0], clipReady=p.evaluate("__film.clipReady"), shown=p.evaluate("__film.shown"), film=p.evaluate("document.documentElement.dataset.film"), errors=errs)
    c.close(); b.close()
for k, v in res.items(): print(k, v)
ok = res["phone-4g-cold"]["film"] == "still" and res["phone-fast"]["film"] != "still" and res["flaky-503"]["clipReady"] == 1 and res["flaky-503"]["film"] != "still" and not res["flaky-503"]["errors"]
print("PASS" if ok else "FAIL")
