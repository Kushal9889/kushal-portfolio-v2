"""
Agent card screen check (2026-10-26 pass). One run, desktop and Android.

Fails when: the card holds an inner scroller outside the full-view window, the
card spills past the viewport or under the dock on desktop, the page scrolls
sideways on a phone, the wheel over the card on a phone does not move the page,
an agent control is under 44px on a phone (24px floor for inline cite markers),
the brief is not the first view (a turn shows before anyone asks), the island is missing, a featured box is back,
the window drops a turn, a follow-up does not name the earlier answer it used, the hero tally is not 4 buttons, the tools card is
missing from Trace, the free-tier chip covers any control or comes back after
it was closed, or a run does not reach "Done". Writes screenshots to
docs/agent-card-shots/2026-10-26/.

Asking needs a provider key. When /api/health lists no providers the scripted
runs are skipped and one question is asked offline: with no keys the server
answers from the record alone, so no model is called, and Trace has a turn.

    python3 scripts/ui-agent-screen.py [--origin http://localhost:3002] [--quick]
"""
import json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[sys.argv.index("--origin") + 1] if "--origin" in sys.argv else "http://localhost:3002"
QUICK = "--quick" in sys.argv
OUT = Path(__file__).resolve().parent.parent / "docs" / "agent-card-shots" / "2026-10-26"
OUT.mkdir(parents=True, exist_ok=True)
ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
PARTLY = "Which graph database did he deploy for the Sikich enterprise assistant to map relationships among accounts, initiatives, and software stacks?"
PREMISE = "Tell me about his IMG full-time job experience."
NOTE = 'aside[aria-labelledby="free-tier-title"]'
CHIP = '[class*="dotBar"]'

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
    turns: a.querySelectorAll('[id^="agent-q-"]').length,
    // The answer must be selectable and on top: what sits at its centre, and a real selection.
    onTop: (() => { const t = a.querySelector('[class*="leadLine"]'); if (!t) return null; const b = t.getBoundingClientRect();
      const e = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return !!e && t.contains(e); })(),
    small,
  };
}"""

# The note chip against every control on screen: a journey link, an action, the card, the dock.
COVER = """(sel) => { const n = document.querySelector(sel);
  if (!n) return { note: false, hit: [] };
  const nb = n.getBoundingClientRect();
  const hit = [...document.querySelectorAll('a, button, summary, input, textarea')].filter(e => { if (n.contains(e)) return false;
    const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return b.width && b.height && s.visibility !== 'hidden' && +s.opacity > 0.05 && !(b.right <= nb.left || b.left >= nb.right || b.bottom <= nb.top || b.top >= nb.bottom); })
    .map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20));
  return { note: true, hit }; }"""

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
    opaque: bg !== 'rgba(0, 0, 0, 0)' && (!alpha || +alpha[1] > 0.9), side: !!document.querySelector('#agent-inspector'),
    shown: a.querySelectorAll('ol[aria-label="Conversation"] > li').length }; }"""

def providers():
    try:
        with urllib.request.urlopen(f"{ORIGIN}/api/health", timeout=20) as r:
            return len(json.load(r).get("providers") or [])
    except Exception:
        return 0

def launch(p):
    # Installed Chrome where there is one; the bundled Chromium otherwise (CI); the cloud image's own build last.
    for opts in ({"channel": "chrome"}, {}, {"executable_path": "/opt/pw-browsers/chromium"}):
        try:
            return p.chromium.launch(**opts)
        except Exception as e:
            err = e
    raise err

def main():
    fails, report = [], {}
    live = providers() > 0
    if not live: print("No providers in /api/health: the scripted runs are skipped; one question is asked offline (no keys, so no model call) for a traced turn.")
    with sync_playwright() as p:
        b = launch(p)
        for name, vw, vh, phone in [("1440x900", 1440, 900, False), ("1280x800", 1280, 800, False), ("1024x768", 1024, 768, False),
                                    ("android-390", 390, 844, True), ("android-360", 360, 780, True)]:
            ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if phone else 1, is_mobile=phone, has_touch=phone, user_agent=ANDROID if phone else None)
            page = ctx.new_page()
            page.goto(f"{ORIGIN}/classic", wait_until="load")
            row = {}
            if not phone:
                # The note waits as a chip after first paint; it must not sit on any control.
                try: page.wait_for_selector(CHIP, timeout=6000)
                except Exception: pass
                row["cover"] = page.evaluate(COVER, CHIP)
                page.screenshot(path=str(OUT / f"{name}-0-hero.png"))
                if not row["cover"]["note"]: fails.append(f"{name}: free-tier chip did not show")
                if row["cover"]["hit"]: fails.append(f"{name}: note chip covers {row['cover']['hit']}")
                if name == "1440x900":
                    page.locator(f"{CHIP} button").first.click(); page.wait_for_timeout(500)
                    page.screenshot(path=str(OUT / f"{name}-0b-note-open.png"))
                    if not page.locator(NOTE).count(): fails.append(f"{name}: the chip did not open the note")
            row["tally"] = page.locator('[class*="tally"] button').count()
            if row["tally"] != 4: fails.append(f"{name}: hero tally has {row['tally']} buttons, not 4")
            if name == "1024x768":
                report[name] = row; ctx.close(); continue
            # The brief is the first view: no turn until the reader asks.
            page.wait_for_selector('#agent section[aria-label="In brief"]', timeout=20000)
            page.wait_for_timeout(2500)
            page.locator("#agent").scroll_into_view_if_needed()
            page.screenshot(path=str(OUT / f"{name}-1-load.png"))
            r0 = page.evaluate(PROBE)
            row["load"] = r0
            if r0["turns"]: fails.append(f"{name}: {r0['turns']} turn(s) on load; the brief should be the only first view")
            if not page.locator('#agent section[aria-label="In brief"]').is_visible(): fails.append(f"{name}: the brief is not visible on load")
            if r0["featured"]: fails.append(f"{name}: a featured box is back")
            if not r0["island"]: fails.append(f"{name}: no island")
            if r0.get("onTop") is False: fails.append(f"{name}: something covers the answer text")
            lead = page.locator('#agent [class*="leadLine"]').first
            if lead.count():
                lead.click(click_count=3)
                row["selected"] = page.evaluate("() => window.getSelection().toString().length")
                if not row["selected"]: fails.append(f"{name}: answer text cannot be selected")
                page.mouse.click(5, 5)
            if not phone:
                # Inline: one named way into the full view on top, and the cut answer says so under the text, never on it.
                row["inline"] = page.evaluate("""() => { const a = document.querySelector('#agent');
                  const w = a.querySelector('button[data-inline][aria-label="Open in a window"]'); const v = a.querySelector('#agent-panel');
                  const s = a.querySelector('[class*="moreStrip"]'); const vb = v.getBoundingClientRect();
                  return { winText: (w?.textContent || '').trim(), strip: !!s, stripBelow: s ? s.getBoundingClientRect().top >= vb.bottom - 1 : null,
                    floating: !!a.querySelector('[class*="moreCue"]') }; }""")
                if row["inline"]["winText"] != "Full view": fails.append(f"{name}: the header button does not read Full view ({row['inline']['winText']!r})")
                if row["inline"]["floating"]: fails.append(f"{name}: a floating cue sits on the inline answer")
                if row["inline"]["strip"] and not row["inline"]["stripBelow"]: fails.append(f"{name}: the continues strip overlaps the answer")
            if not phone and r0["consoleBottom"] > vh - 60: fails.append(f"{name}: console bottom {r0['consoleBottom']} under the dock (vh {vh})")
            if r0["composerOver"] > 1: fails.append(f"{name}: composer runs {r0['composerOver']}px past the card")
            if phone and r0["pageOverflowX"] > 0: fails.append(f"{name}: page scrolls sideways by {r0['pageOverflowX']}px")
            if live and not (QUICK and name != "1440x900"):
                row["typed"] = ask(page, "What did he build at IMG Systems?")
                page.screenshot(path=str(OUT / f"{name}-2-answer.png"))
                if not row["typed"].startswith(("Done", "Answered", "Instant")): fails.append(f"{name}: typed run ended '{row['typed']}'")
            elif not live:
                row["offline"] = ask(page, "What did he build at IMG Systems?")
                page.screenshot(path=str(OUT / f"{name}-2-offline.png"))
                if row["offline"] == "TIMEOUT": fails.append(f"{name}: offline run never finished")
                # A follow-up is given the turn before it, and says so on the turn.
                if name in ("1440x900", "android-390"):
                    ask(page, "What was the measured result there?")
                    recall = page.locator('#agent [class*="recall"]')
                    row["recall"] = recall.first.inner_text() if recall.count() else None
                    if recall.count(): recall.first.scroll_into_view_if_needed()
                    page.screenshot(path=str(OUT / f"{name}-2b-memory.png"))
                    if not row["recall"]: fails.append(f"{name}: the follow-up does not say it used the earlier answer")
            r1 = page.evaluate(PROBE); row["asked"] = r1
            # Outside the window the page is the only scroller.
            if r1["scrollers"]: fails.append(f"{name}: inner scrollers {r1['scrollers']}")
            if phone and r1["small"]: fails.append(f"{name}: small targets {r1['small'][:6]}")
            # The wheel over the card moves the page, inline on a wide screen and always on a phone.
            vb = page.locator('#agent-panel').bounding_box()
            page.evaluate("scrollTo(0, document.querySelector('#agent').getBoundingClientRect().top + scrollY - 40)"); page.wait_for_timeout(200)
            vb = page.locator('#agent-panel').bounding_box(); y0 = page.evaluate("scrollY")
            page.mouse.move(vb["x"] + min(80, vb["width"] / 2), max(5, min(vh - 5, vb["y"] + 80))); page.mouse.wheel(0, 200); page.wait_for_timeout(400)
            row["wheel"] = page.evaluate("scrollY") - y0
            if row["wheel"] <= 0: fails.append(f"{name}: wheel over the card did not scroll the page")
            page.evaluate(f"scrollTo(0, {y0})"); page.wait_for_timeout(200)
            if live and not QUICK and name == "1280x800":
                page.locator('#agent [class*="glanceActions"] button', has_text="Sources").click(); page.wait_for_timeout(500)
                row["sources"] = page.evaluate(WINDOW)
                page.screenshot(path=str(OUT / f"{name}-3-window-sources.png"))
                if not row["sources"]["open"] or not row["sources"]["opaque"]: fails.append(f"{name}: Sources window {row['sources']}")
                page.keyboard.press("Escape"); page.wait_for_timeout(300)
                if page.evaluate("document.querySelector('#agent').matches(':popover-open')"): fails.append(f"{name}: Esc did not close the window")
            if live and not QUICK and name in ("1440x900", "android-390"):
                row["partly"] = ask(page, PARTLY); page.screenshot(path=str(OUT / f"{name}-3-partly.png"))
                row["premise"] = ask(page, PREMISE); page.screenshot(path=str(OUT / f"{name}-4-premise.png"))
                cite = page.locator('#agent article sup button').first
                if cite.count():
                    if phone: cite.tap()
                    else: cite.hover()
                    page.wait_for_timeout(300)
                    page.screenshot(path=str(OUT / f"{name}-5-cite.png"))
            if not phone:
                # The full view is one thread: every turn the card holds, each in full.
                turns = page.evaluate(PROBE)["turns"]
                y0 = page.evaluate("scrollY")
                # A plain mouse press: Playwright's click() first nudges the page to bring the button into view, which moved y by 8 px.
                wb = page.locator('#agent button[data-inline][aria-label="Open in a window"]').bounding_box()
                page.mouse.click(wb["x"] + wb["width"] / 2, wb["y"] + wb["height"] / 2); page.wait_for_timeout(500)
                row["window"] = page.evaluate(WINDOW)
                page.screenshot(path=str(OUT / f"{name}-6-window.png"))
                if not row["window"]["open"]: fails.append(f"{name}: the window did not open")
                if not row["window"]["opaque"]: fails.append(f"{name}: window background is see-through")
                if row["window"]["shown"] < max(turns, 1): fails.append(f"{name}: window shows {row['window']['shown']} of {turns} turns")
                page.keyboard.press("Escape"); page.wait_for_timeout(300)
                back = page.evaluate("() => ({open: document.querySelector('#agent').matches(':popover-open'), y: scrollY})")
                if back["open"] or abs(back["y"] - y0) > 2: fails.append(f"{name}: Esc left {back} (started at y {y0})")
            # Trace carries the tools card. Inline on a wide screen the tabs are folded into the hint line.
            tab = page.locator('#agent-tab-trace') if phone else page.locator('#agent [class*="glanceHints"] button', has_text="trace")
            if tab.count():
                y0 = page.evaluate("scrollY")
                tab.first.click(); page.wait_for_timeout(500)
                page.screenshot(path=str(OUT / f"{name}-7-trace.png"))
                row["tools"] = page.locator('#agent section[aria-label="Tools"]').first.is_visible()
                if not row["tools"]: fails.append(f"{name}: no tools card in Trace")
                if phone and not page.evaluate("() => !!document.querySelector('#agent dialog[open]')"): fails.append(f"{name}: Trace did not open as a sheet")
                if not phone and not page.evaluate("document.querySelector('#agent').matches(':popover-open')"): fails.append(f"{name}: Trace did not open the window")
                page.keyboard.press("Escape"); page.wait_for_timeout(300)
            else:
                fails.append(f"{name}: no Trace control")
            if live and not QUICK and name in ("1440x900", "android-390"):
                # Stop mid-stream, then a follow-up.
                ask(page, "Walk me through every project he has shipped and its measured results.", wait_done=False)
                page.wait_for_timeout(1200)
                page.locator('#agent button[data-kind="stop"]').click()
                page.wait_for_timeout(400)
                row["stopped"] = page.locator('#agent p[data-phase]').inner_text()
                page.screenshot(path=str(OUT / f"{name}-8-stopped.png"))
                page.locator("#ask").fill("")
                row["followup"] = ask(page, "What was the measured result there?")
                page.screenshot(path=str(OUT / f"{name}-9-followup.png"))
            if phone:
                page.locator("#ask").focus(); page.wait_for_timeout(300)
                page.screenshot(path=str(OUT / f"{name}-10-composer-focus.png"))
                # Typing on a phone: the chip and the dock step aside so nothing stacks on the composer (F29).
                row["typingClear"] = page.evaluate("""() => [...document.querySelectorAll('[class*="dotBar"], [class*="ReachDock"][class*="dock"]')]
                  .filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.top < innerHeight && r.bottom > 0 && r.height > 0; }).length === 0""")
                if not row["typingClear"]: fails.append(f"{name}: the chip or dock stays on screen while typing")
                page.locator("#ask").blur(); page.wait_for_timeout(300)
            # Closed once, the note stays closed across a reload (a dot on a phone, the card on a wide screen).
            page.evaluate("scrollTo(0, 0)")
            x = page.locator(f'{CHIP} button[aria-label="Dismiss"], {NOTE} button[aria-label="Close"]')
            try: x.first.wait_for(timeout=6000)
            except Exception: pass
            if x.count():
                x.first.click(); page.wait_for_timeout(200)
                page.reload(wait_until="load"); page.wait_for_timeout(2500)
                row["noteBack"] = page.locator(f'{NOTE}, {CHIP}').count()
                if row["noteBack"]: fails.append(f"{name}: the note came back after it was closed")
            else:
                fails.append(f"{name}: no way to close the note")
            report[name] = row
            ctx.close()
        b.close()
    print(json.dumps(report, indent=1)[:6000])
    print("FAIL" if fails else "PASS", *fails, sep="\n  ")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
