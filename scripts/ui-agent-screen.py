"""
Agent card screen check (2026-10-25 redesign). One run, desktop and Android.

Fails when: the console holds more than one scroller, the card spills past the
viewport or under the dock on desktop, the page scrolls sideways on a phone,
an agent control is under 44px on a phone (24px floor for inline cite
markers), the featured answer or the island is missing, or a run does not
reach "Done". Writes screenshots to docs/agent-card-shots/2026-10-25/.

    python3 scripts/ui-agent-screen.py [--origin http://localhost:3002] [--quick]
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[sys.argv.index("--origin") + 1] if "--origin" in sys.argv else "http://localhost:3002"
QUICK = "--quick" in sys.argv
OUT = Path(__file__).resolve().parent.parent / "docs" / "agent-card-shots" / "2026-10-25"
OUT.mkdir(parents=True, exist_ok=True)
ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
PARTLY = "Which graph database did he deploy for the Sikich enterprise assistant to map relationships among accounts, initiatives, and software stacks?"
PREMISE = "Tell me about his IMG full-time job experience."

PROBE = """() => {
  const a = document.querySelector('#agent');
  const host = a.closest('[data-surface="console"]:not(#agent)') || a;
  const scrollers = [host, ...host.querySelectorAll('*')].filter(e => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.tagName !== 'TEXTAREA';
  }).map(e => e.className.toString().split('__').pop());
  const r = host.getBoundingClientRect();
  const small = [...a.querySelectorAll('button, a, summary, textarea')].filter(e => {
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) return false;
    if (e.closest('dialog:not([open])')) return false;
    const floor = e.closest('sup') ? 24 : 44;
    return Math.min(b.height, b.width) < floor - 0.5;
  }).map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
  return {
    scrollers, consoleTop: Math.round(r.top), consoleBottom: Math.round(r.bottom), vh: innerHeight,
    pageOverflowX: document.documentElement.scrollWidth - innerWidth,
    composerOver: Math.round(a.querySelector('form').getBoundingClientRect().right - a.getBoundingClientRect().right),
    featured: !!a.querySelector('[class*="featured"]'), island: a.querySelector('p[data-phase]')?.textContent?.trim(),
    // The answer must be selectable and on top: what sits at its centre, and a real selection.
    onTop: (() => { const t = a.querySelector('[class*="leadLine"]'); if (!t) return null; const b = t.getBoundingClientRect();
      const e = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return !!e && t.contains(e); })(),
    small,
  };
}"""

def ask(page, q, wait_done=True, timeout=45):
    box = page.locator("#ask")
    box.click(); box.fill(q); box.press("Enter")
    if not wait_done: return
    t0 = time.time()
    while time.time() - t0 < timeout:
        txt = page.locator('#agent p[data-phase]').inner_text()
        if txt.startswith(("Done", "Answered", "Instant", "Connection", "Stopped")) and not page.locator('#agent[data-state="busy"]').count():
            return txt
        time.sleep(0.4)
    return "TIMEOUT"

WINDOW = r"""() => { const a = document.querySelector('#agent'); const r = a.getBoundingClientRect();
  const bg = getComputedStyle(a).backgroundColor; const alpha = /\/\s*([\d.]+)\)$/.exec(bg);
  return { open: a.matches(':popover-open'), w: Math.round(r.width / innerWidth * 100), h: Math.round(r.height / innerHeight * 100),
    opaque: bg !== 'rgba(0, 0, 0, 0)' && (!alpha || +alpha[1] > 0.9), side: !!document.querySelector('#agent-inspector') }; }"""

def main():
    fails, report = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        for name, vw, vh, phone in [("1440x900", 1440, 900, False), ("1280x800", 1280, 800, False), ("android-390", 390, 844, True), ("android-360", 360, 780, True)]:
            ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if phone else 1, is_mobile=phone, has_touch=phone, user_agent=ANDROID if phone else None)
            page = ctx.new_page()
            page.goto(f"{ORIGIN}/classic", wait_until="networkidle")
            page.wait_for_selector('#agent [class*="featured"]', timeout=20000)
            page.wait_for_timeout(600)
            page.locator("#agent").scroll_into_view_if_needed()
            # The overlap probe reads the lead line, so it has to be on screen (a long load answer on a phone is not).
            page.locator('#agent [class*="leadLine"]').first.scroll_into_view_if_needed()
            page.screenshot(path=str(OUT / f"{name}-1-featured.png"))
            r0 = page.evaluate(PROBE)
            row = {"featured": r0}
            if r0.get("onTop") is False: fails.append(f"{name}: something covers the answer text")
            lead = page.locator('#agent [class*="leadLine"]').first
            if lead.count():
                lead.click(click_count=3)
                row["selected"] = page.evaluate("() => window.getSelection().toString().length")
                if not row["selected"]: fails.append(f"{name}: answer text cannot be selected")
                page.mouse.click(5, 5)
            if not r0["featured"]: fails.append(f"{name}: no featured card")
            if not phone and r0["consoleBottom"] > vh - 60: fails.append(f"{name}: console bottom {r0['consoleBottom']} under the dock (vh {vh})")
            if r0["composerOver"] > 1: fails.append(f"{name}: composer runs {r0['composerOver']}px past the card")
            if phone and r0["pageOverflowX"] > 0: fails.append(f"{name}: page scrolls sideways by {r0['pageOverflowX']}px")
            if not (QUICK and name != "1440x900"):
                row["typed"] = ask(page, "What did he build at IMG Systems?")
                page.screenshot(path=str(OUT / f"{name}-2-answer.png"))
                r1 = page.evaluate(PROBE); row["answer"] = r1
                if len(r1["scrollers"]) > 1: fails.append(f"{name}: {len(r1['scrollers'])} scrollers {r1['scrollers']}")
                if not phone:
                    # Inline on a wide screen the card is a display: the wheel scrolls the page.
                    vb = page.locator('#agent-panel').bounding_box(); y0 = page.evaluate("scrollY")
                    page.mouse.move(vb["x"] + 80, vb["y"] + 80); page.mouse.wheel(0, 200); page.wait_for_timeout(300)
                    if page.evaluate("scrollY") <= y0: fails.append(f"{name}: wheel over the inline card did not scroll the page")
                    page.evaluate(f"scrollTo(0, {y0})"); page.wait_for_timeout(200)
                if phone and r1["small"]: fails.append(f"{name}: small targets {r1['small'][:6]}")
                if not row["typed"].startswith(("Done", "Answered", "Instant")): fails.append(f"{name}: typed run ended '{row['typed']}'")
                if name == "1280x800":
                    y0 = page.evaluate("scrollY")
                    page.locator('#agent [class*="glanceActions"] button', has_text="Sources").click(); page.wait_for_timeout(500)
                    row["window"] = page.evaluate(WINDOW)
                    page.screenshot(path=str(OUT / f"{name}-3-window-sources.png"))
                    if not row["window"]["open"] or not row["window"]["opaque"]: fails.append(f"{name}: Sources window {row['window']}")
                    page.keyboard.press("Escape"); page.wait_for_timeout(300)
                    if page.evaluate("document.querySelector('#agent').matches(':popover-open')"): fails.append(f"{name}: Esc did not close the window")
                if name in ("1440x900", "android-390"):
                    row["partly"] = ask(page, PARTLY); page.screenshot(path=str(OUT / f"{name}-3-partly.png"))
                    row["premise"] = ask(page, PREMISE); page.screenshot(path=str(OUT / f"{name}-4-premise.png"))
                    cite = page.locator('#agent article sup button').first
                    if cite.count():
                        if phone: cite.tap()
                        else: cite.hover()
                        page.wait_for_timeout(300)
                        page.screenshot(path=str(OUT / f"{name}-5-cite.png"))
                    # Inline on a wide screen the tabs are folded into the hint line.
                    tab = page.locator('#agent-tab-trace') if phone else page.locator('#agent [class*="glanceHints"] button', has_text="trace")
                    if tab.count():
                        y0 = page.evaluate("scrollY")
                        tab.click(); page.wait_for_timeout(500)
                        page.screenshot(path=str(OUT / f"{name}-6-trace.png"))
                        row["traceSheet"] = page.evaluate("() => !!document.querySelector('#agent dialog[open]')")
                        if phone and not row["traceSheet"]: fails.append(f"{name}: Trace did not open as a sheet")
                        if not phone:
                            # A control on the card opens the window; Esc puts the page back.
                            row["window"] = page.evaluate(WINDOW)
                            if not row["window"]["open"]: fails.append(f"{name}: Trace did not open the window")
                            if not row["window"]["opaque"]: fails.append(f"{name}: window background is see-through")
                        page.keyboard.press("Escape"); page.wait_for_timeout(300)
                        if not phone:
                            back = page.evaluate("() => ({open: document.querySelector('#agent').matches(':popover-open'), y: scrollY})")
                            if back["open"] or abs(back["y"] - y0) > 2: fails.append(f"{name}: Esc left {back} (started at y {y0})")
                    # Stop mid-stream, then a follow-up.
                    ask(page, "Walk me through every project he has shipped and its measured results.", wait_done=False)
                    page.wait_for_timeout(1200)
                    page.locator('#agent button[data-kind="stop"]').click()
                    page.wait_for_timeout(400)
                    row["stopped"] = page.locator('#agent p[data-phase]').inner_text()
                    page.screenshot(path=str(OUT / f"{name}-7-stopped.png"))
                    page.locator("#ask").fill("")
                    row["followup"] = ask(page, "What was the measured result there?")
                    page.screenshot(path=str(OUT / f"{name}-8-followup.png"))
                    if phone:
                        page.locator("#ask").focus(); page.wait_for_timeout(300)
                        page.screenshot(path=str(OUT / f"{name}-9-composer-focus.png"))
            report[name] = row
            ctx.close()
        b.close()
    print(json.dumps(report, indent=1)[:6000])
    print("FAIL" if fails else "PASS", *fails, sep="\n  ")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
