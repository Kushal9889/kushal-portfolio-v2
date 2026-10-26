"""
Keyboard and contrast check (elite pass F37, F38). No model is called.

Fails when: 70 presses of Tab visit fewer than 20 distinct stops (focus is
trapped), Esc does not close the full view, any text 12.5px or smaller in the
first two screens measures under 4.5:1 against the background behind it, at
1440 or on a 390 phone, or a link or button is named only by a hover title.

    python3 scripts/ui-a11y.py [--origin http://localhost:3002]
"""
import glob, json, sys
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[sys.argv.index("--origin") + 1] if "--origin" in sys.argv else "http://localhost:3002"

# WCAG relative luminance; the background is the nearest ancestor with an opaque fill.
CONTRAST = """() => {
  const ch = (c) => c.match(/[\\d.]+/g).map(Number);
  const lum = (c) => { const [r, g, b] = ch(c).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const a = ch(c); if (a.length < 4 || a[3] > 0.9) return c; } return "rgb(0,0,0)"; };
  const low = [];
  for (const el of document.querySelectorAll("body *")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (parseFloat(cs.fontSize) > 12.5 || !r.width || r.top > innerHeight * 2 || cs.visibility === "hidden" || +cs.opacity < 0.2) continue;
    if (el.closest("[aria-hidden=true]")) continue;
    const a = lum(cs.color), b = lum(bg(el)), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) low.push(`${el.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}:1`);
  }
  return low;
}"""

TITLE_ONLY = """() => [...document.querySelectorAll("a[title], button[title]")]
  .filter((e) => !e.getAttribute("aria-label") && !e.textContent.trim()).map((e) => e.title)"""


def main():
    fails = []
    exe = (glob.glob("/opt/pw-browsers/chromium*/**/chrome", recursive=True) or [None])[0]
    with sync_playwright() as p:
        b = p.chromium.launch(**({"executable_path": exe} if exe else {}))
        for name, w, h, phone in [("1440", 1440, 900, False), ("390", 390, 844, True)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone)
            page = ctx.new_page()
            page.goto(f"{ORIGIN}/", wait_until="networkidle")
            page.wait_for_timeout(2000)
            for line in page.evaluate(CONTRAST):
                fails.append(f"{name}: low contrast: {line}")
            for t in page.evaluate(TITLE_ONLY):
                fails.append(f"{name}: named only by a hover title: {t}")
            if not phone:
                page.mouse.click(5, 5)
                stops = set()
                for _ in range(70):
                    page.keyboard.press("Tab")
                    stops.add(page.evaluate("(() => { const a = document.activeElement; return a ? a.tagName + (a.id || '') + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24) : '' })()"))
                if len(stops) < 20:
                    fails.append(f"{name}: focus trapped, {len(stops)} distinct stops in 70 tabs")
                btn = page.locator('#agent button[data-inline][aria-label="Open in a window"]')
                if btn.count():
                    btn.first.click()
                    page.wait_for_timeout(400)
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(400)
                    if page.evaluate("document.querySelector('#agent')?.matches(':popover-open')"):
                        fails.append(f"{name}: Esc did not close the full view")
            ctx.close()
        b.close()
    print(json.dumps(fails, indent=1))
    print("FAIL" if fails else "PASS")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
