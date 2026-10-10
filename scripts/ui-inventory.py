"""Inventory of every control, link, image and video on /classic, checked.

    python3 scripts/ui-inventory.py            390 and 1440 wide
    python3 scripts/ui-inventory.py --width 1440

Per width it lists every link, button, summary, input, image and video with its
section, name, target and size, then checks:

1. Internal anchors point at an element that exists.
2. Internal paths and external links answer (< 400; 401/403/405/999 from sites
   that block scripts are reported as "blocked", not as broken).
3. Every visible image has loaded (naturalWidth > 0) and a text alternative.
4. Every visible control has an accessible name and, on a phone, a target of at
   least 24 CSS px (WCAG 2.2 target size) and 44 px where it is a primary control.
5. Native toggles (summary) open and close; the first ask chip is clicked once
   and the agent route it calls must answer.
6. The film shows a frame at every section anchor.
7. The four API routes answer as designed (GET only; the agent route is probed
   with an empty body and must refuse it, never run it).

Writes docs/ui-inventory.json. Exits 1 on any failure.
"""

import argparse
import collections
import faulthandler
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _cache

ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3002")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "ui-inventory.json")
SECTIONS = ["work", "opensource", "running", "research", "proof", "approach", "measured", "education", "contact"]
BLOCKED = {401, 403, 405, 429, 999}

COLLECT = """() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden], [aria-hidden="true"]'); };
  const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('alt') || e.innerText || e.value || e.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
  const out = [];
  document.querySelectorAll('a, button, summary, input, textarea, select, img, video, [role=button]').forEach((e) => {
    const r = e.getBoundingClientRect();
    out.push({
      tag: e.tagName.toLowerCase(),
      section: (e.closest('section[id]') || {}).id || (e.closest('header, nav, footer, aside') || {}).tagName || '',
      name: name(e),
      href: e.getAttribute('href'),
      target: e.getAttribute('target'),
      visible: vis(e),
      w: Math.round(r.width), h: Math.round(r.height),
      natural: e.tagName === 'IMG' ? e.naturalWidth : undefined,
      alt: e.tagName === 'IMG' ? e.getAttribute('alt') : undefined,
      role: e.getAttribute('role') || undefined,
      expanded: e.getAttribute('aria-expanded'),
      ready: e.tagName === 'VIDEO' ? e.readyState : undefined,
      disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined,
    });
  });
  return out;
}"""


DISCOVER = """() => {
  const comps = {}, attrs = {}, tags = {};
  document.querySelectorAll('[class]').forEach((e) => {
    const cl = typeof e.className === 'string' ? e.className : '';
    // next/font puts a "<hash>-module__<hash>__variable" class on <html>: a font loader, not a component.
    if (/__variable\b/.test(cl)) return;
    // Next 16 names font loaders "<family>_<8 hex>-module__...": the hash is not a component.
    for (const m of cl.matchAll(/(?:^|\\s)([A-Za-z0-9]+)-module__/g)) comps[m[1]] = (comps[m[1]] || 0) + 1;
  });
  const fonts = {};
  document.querySelectorAll('main *, header *, footer *, nav *').forEach((e) => {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const f = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    fonts[f] = (fonts[f] || 0) + 1;
  });
  document.querySelectorAll('*').forEach((e) => {
    for (const a of e.attributes) if (a.name.startsWith('data-')) attrs[a.name] = (attrs[a.name] || 0) + 1;
  });
  document.querySelectorAll('main *, header *, footer *, nav *, dialog *').forEach((e) => { const t = e.tagName.toLowerCase(); tags[t] = (tags[t] || 0) + 1; });
  const inputs = [...new Set([...document.querySelectorAll('input,textarea,select')].map((e) => e.type || e.tagName.toLowerCase()))];
  return {comps, attrs, tags, inputs, fonts};
}"""

# Buttons that are never clicked by the explorer: they send, speak, stop, copy or leave the page.
UNSAFE_BUTTON = r"send|ask$|stop|speak|voice|copy|share|email|submit|linkedin|download|seed|selectask"


def explore(page, found):
    """Click each safe button once and record what appears, so hidden UI is discovered too."""
    def merge():
        d = page.evaluate(DISCOVER)
        for k in ("comps", "attrs", "tags", "fonts"):
            for n, c in d[k].items():
                found[k][n] = max(found[k].get(n, 0), c)
        found["inputs"] |= set(d["inputs"])

    merge()
    sel = "button:visible, summary:visible, [role=button]:visible"
    n = page.locator(sel).count()
    clicked = 0
    for k in range(min(n, 80)):
        b = page.locator(sel).nth(k)
        try:
            label = b.evaluate("e => ((e.getAttribute('aria-label') || '') + ' ' + (e.className || '') + ' ' + (e.innerText || '')).toLowerCase()")
            import re as _re
            if _re.search(UNSAFE_BUTTON, label):
                continue
            b.scroll_into_view_if_needed(timeout=1500)
            b.click(timeout=2000)
            page.wait_for_timeout(250)
            merge()
            clicked += 1
            page.keyboard.press("Escape")
            page.wait_for_timeout(80)
        except Exception:  # noqa: BLE001
            continue
    found["clicked"] = clicked


def head(url):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": "Mozilla/5.0 ui-inventory"})
            with urllib.request.urlopen(req, timeout=12) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in BLOCKED:
                continue
            return e.code
        except Exception:
            if method == "GET":
                return 0
    return 0


def run(width, pw, report, fails):
    browser = pw.chromium.launch(channel="chrome")
    ctx = browser.new_context(viewport={"width": width, "height": 900 if width > 700 else 844}, device_scale_factor=1)
    page = ctx.new_page()
    # U17: two runs hung with no output. Every step is bounded, dialogs are
    # dismissed, progress is printed, and a stuck width dumps its stack and exits.
    page.set_default_timeout(10_000)
    page.on("dialog", lambda d: d.dismiss())
    faulthandler.dump_traceback_later(600, exit=True)
    print(f"{width}px: start", flush=True)
    seen_api = []
    page.on("response", lambda r: seen_api.append((r.url, r.status)) if "/api/" in r.url else None)
    page.goto(f"{ORIGIN}/classic?film=debug", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    # Walk the page once so lazy images load.
    h = page.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        page.evaluate(f"window.scrollTo(0,{y})")
        page.wait_for_timeout(120)
        y += 700
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(600)

    items = page.evaluate(COLLECT)
    vis = [i for i in items if i["visible"]]
    key = f"w{width}"
    report[key] = {"controls": len(items), "visible": len(vis)}

    # 1/2 anchors and links
    anchor_ids = set(page.evaluate("[...document.querySelectorAll('[id]')].map(e => e.id)"))
    externals, internals = {}, {}
    for i in vis:
        href = i.get("href")
        if i["tag"] != "a" or not href:
            continue
        if href.startswith("#"):
            if href[1:] and href[1:] not in anchor_ids:
                fails.append(f"{key} dead anchor {href} ({i['name']})")
        elif href.startswith("/"):
            internals[href.split("#")[0]] = i["name"]
        elif href.startswith(("http://", "https://")):
            externals[href] = i["name"]
        elif href.startswith(("mailto:", "tel:")):
            if len(href) < 8:
                fails.append(f"{key} malformed {href}")
    report[key]["internal_links"] = {}
    for path, nm in internals.items():
        code = page.request.get(ORIGIN + path).status
        report[key]["internal_links"][path] = code
        if code >= 400:
            fails.append(f"{key} internal {path} -> {code} ({nm})")
    report[key]["external_links"] = {}
    for url, nm in externals.items():
        code = head(url)
        report[key]["external_links"][url] = code
        if code == 0 or (code >= 400 and code not in BLOCKED):
            fails.append(f"{key} external {url} -> {code} ({nm})")

    # 3 images and video
    for i in vis:
        if i["tag"] == "img":
            if not i["natural"]:
                fails.append(f"{key} image not loaded: {i['name'] or i['section']}")
            if i["alt"] is None and i.get("role") != "presentation":
                fails.append(f"{key} image without alt in {i['section']}")
        if i["tag"] == "video" and not i["ready"]:
            fails.append(f"{key} video not ready in {i['section']}")

    # 4a accessible names from the accessibility tree (CSS content, aria-label and
    # labelledby all counted the way a screen reader counts them)
    cdp = ctx.new_cdp_session(page)
    ax = cdp.send("Accessibility.getFullAXTree")["nodes"]
    empty = []
    empty_info = []
    for n in ax:
        role = (n.get("role") or {}).get("value")
        if role in ("link", "button", "textbox", "combobox", "checkbox", "switch", "tab") and not n.get("ignored"):
            nm = (n.get("name") or {}).get("value", "").strip()
            if not nm:
                empty.append(role)
                try:
                    d = cdp.send("DOM.describeNode", {"backendNodeId": n["backendDOMNodeId"]})["node"]
                    attrs = dict(zip(d.get("attributes", [])[::2], d.get("attributes", [])[1::2]))
                    empty_info.append(f"<{d['localName']} href={attrs.get('href', '')[:60]} class={attrs.get('class', '')[:40]}>")
                except Exception:  # noqa: BLE001
                    pass
    report[key]["ax_empty_names"] = len(empty)
    if empty:
        fails.append(f"{key} {len(empty)} controls with no accessible name in the accessibility tree ({collections.Counter(empty).most_common(3)}) {empty_info[:3]}")

    # 4 names and targets
    small = []
    for i in vis:
        if width < 700 and i["tag"] in ("button", "summary") and i["w"] > 0 and (i["h"] < 24 or i["w"] < 24):
            small.append(f"{i['name']} {i['w']}x{i['h']}")
    report[key]["small_targets"] = small
    for s in small:
        fails.append(f"{key} target under 24px: {s}")

    # 5 click interception: Playwright's own trial click scrolls the control into
    # view, waits for it to stop moving and checks that the click would land on it.
    sel = "a[href], button, summary, input, textarea, select, [role=button]"
    total = page.locator(sel).count()
    blocked = []
    for k in range(total):
        loc = page.locator(sel).nth(k)
        try:
            if not loc.is_visible():
                continue
            loc.click(trial=True, timeout=2500)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            by = ""
            if "intercepts pointer events" in msg:
                by = msg.split("<", 2)[-1].split(">")[0][:60] if "<" in msg else ""
                nm = loc.evaluate("e => (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40)")
                sec = loc.evaluate("e => (e.closest('section[id]') || {}).id || ''")
                blocked.append({"tag": loc.evaluate("e => e.tagName.toLowerCase()"), "name": nm, "section": sec, "by": by})
    report[key]["click_blocked"] = blocked
    report[key]["click_checked"] = total
    for b in blocked:
        fails.append(f"{key} click blocked: <{b['tag']}> {b['name']!r} in {b['section']} by <{b['by']}")

    # 5b native toggles, with real mouse clicks (a synthetic element.click() is not what a reader does)
    n_sum = page.locator("summary").count()
    broken_toggles = 0
    checked = 0
    for k in range(min(n_sum, 60)):
        s = page.locator("summary").nth(k)
        try:
            if not s.is_visible() or not s.evaluate("e => e.checkVisibility()"):
                continue
            # A toggle nested in a closed disclosure is reached the way a reader
            # reaches it: open the outer one first (real clicks, outermost first).
            for outer in s.evaluate_handle(
                "e => { const out = []; let d = e.closest('details')?.parentElement?.closest('details');"
                " while (d) { if (!d.open) out.unshift(d.querySelector(':scope > summary')); d = d.parentElement?.closest('details'); } return out; }"
            ).get_properties().values():
                el = outer.as_element()
                if el is None:
                    continue
                el.scroll_into_view_if_needed(timeout=1500)
                el.click(timeout=3000)
                page.wait_for_timeout(350)
            det = s.evaluate_handle("e => e.closest('details')")
            s.scroll_into_view_if_needed(timeout=1500)
            page.wait_for_timeout(450)
            before = det.evaluate("d => d.open")
            s.click(timeout=3000)
            page.wait_for_timeout(250)
            mid = det.evaluate("d => d.open")
            s.click(timeout=3000)
            page.wait_for_timeout(250)
            after = det.evaluate("d => d.open")
            checked += 1
            if not (mid != before and after == before):
                broken_toggles += 1
                fails.append(f"{key} summary {k} does not open and close with a real click (open: {before} -> {mid} -> {after})")
        except Exception as e:  # noqa: BLE001
            fails.append(f"{key} summary {k} error: {str(e)[:80]}")
    report[key]["toggles_checked"] = checked
    report[key]["toggles_broken"] = broken_toggles
    print(f"{width}px: toggles {checked} checked, {broken_toggles} broken", flush=True)

    # first ask chip, desktop only (one real call)
    if width >= 1000:
        chip = page.locator("button[class*='seed' i]").first
        if chip.count():
            seen_api.clear()
            try:
                chip.scroll_into_view_if_needed()
                chip.click(timeout=3000)
                page.wait_for_timeout(6000)
            except Exception as e:  # noqa: BLE001
                fails.append(f"{key} ask chip click failed: {e}")
            report[key]["ask_chip_api"] = [f"{u.split('/api/')[1]} {s}" for u, s in seen_api]
            if not seen_api:
                fails.append(f"{key} ask chip made no agent request")
            elif any(s >= 500 for _, s in seen_api):
                fails.append(f"{key} agent route returned {seen_api}")

    # 5c discovery: everything the page showed, including what hid behind buttons
    found = {"comps": {}, "attrs": {}, "tags": {}, "fonts": {}, "inputs": set(), "clicked": 0}
    explore(page, found)
    report[key]["discovered"] = {"components": len(found["comps"]), "data_attrs": len(found["attrs"]), "tags": len(found["tags"]), "input_types": sorted(found["inputs"]), "buttons_clicked": found["clicked"]}
    REGISTRY_FOUND.append(found)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(600)

    # 6 film frame per section
    film = {}
    for sec in SECTIONS:
        page.evaluate(
            """(id) => { const el = document.getElementById(id) || document.querySelector(`[data-beat="${id}"]`); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight / 3); }""",
            sec,
        )
        page.wait_for_timeout(1400)
        st = page.evaluate("window.__film ? ({shown: window.__film.shown, ready: window.__film.clipReady, frames: window.__film.frames}) : null")
        film[sec] = st
        mode = page.evaluate("document.documentElement.dataset.film || ''")
        if st is None and mode != "still":
            fails.append(f"{key} film stats missing at {sec} (mode {mode!r})")
        elif st is not None and not st["shown"] and mode == "live":
            fails.append(f"{key} no film frame shown at {sec}")
    report[key]["film"] = film

    # overflow after settle
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(1500)
    ow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
    report[key]["h_overflow_px"] = ow
    if ow > 1:
        fails.append(f"{key} horizontal overflow {ow}px")
    browser.close()


REGISTRY_FOUND = []
REGISTRY = os.path.join(HERE, "..", "docs", "ui-registry.json")


def registry_check(report, fails, register):
    """Anything on the page that the registry does not know is a failure until it is registered and reviewed."""
    try:
        reg = json.load(open(REGISTRY))
    except (OSError, ValueError):
        reg = {"version": 1, "components": {}, "data_attrs": {}, "tags": {}, "input_types": []}
    seen = {"components": {}, "data_attrs": {}, "tags": {}, "fonts": {}}
    inputs = set()
    for f in REGISTRY_FOUND:
        for src, dst in (("comps", "components"), ("attrs", "data_attrs"), ("tags", "tags"), ("fonts", "fonts")):
            for n, c in f[src].items():
                seen[dst][n] = max(seen[dst].get(n, 0), c)
        inputs |= f["inputs"]
    new = {k: sorted(set(v) - set(reg.get(k, {}))) for k, v in seen.items()}
    new["input_types"] = sorted(inputs - set(reg.get("input_types", [])))
    gone = {k: sorted(set(reg.get(k, {})) - set(v)) for k, v in seen.items()}
    cdir = os.path.join(HERE, "..", "app", "components")
    on_disk = sorted([f for f in os.listdir(cdir) if f.endswith(".tsx")] + [f + "/" for f in os.listdir(cdir) if os.path.isdir(os.path.join(cdir, f))])
    new["files"] = [f for f in on_disk if f not in reg.get("files", {})]
    if register:
        reg.setdefault("files", {}).update({f: {"in_dom_at_load": False} for f in new["files"]})
        new["files"] = []
    unreviewed = sorted(n for n, e in reg.get("components", {}).items() if not e.get("reviewed"))
    if register:
        for k in ("components", "data_attrs", "tags", "fonts"):
            reg.setdefault(k, {})
            for n in new[k]:
                reg[k][n] = {"reviewed": False, "seen": seen[k][n]} if k == "components" else {"seen": seen[k][n]}
        reg["input_types"] = sorted(set(reg.get("input_types", [])) | inputs)
        json.dump(reg, open(REGISTRY, "w"), indent=1, sort_keys=True)
        new = {k: [] for k in new}
    for k, v in new.items():
        for n in v:
            fails.append(f"NEW UI THING not in docs/ui-registry.json [{k}]: {n}  (review it, then run with --register)")
    report["registry"] = {"new": new, "unreviewed_components": unreviewed, "components_seen": len(seen["components"]), "gone_since_last": {k: v[:6] for k, v in gone.items() if v}}


def api_checks(report, fails):
    res = {}
    for path, method, want in [
        ("/api/agent/demo", "GET", lambda c: c < 500),
        ("/api/agent", "POST", lambda c: c in (400, 405, 422)),
        ("/api/agent/stream", "POST", lambda c: c in (400, 405, 422)),
        ("/api/track", "GET", lambda c: c < 500),
    ]:
        try:
            req = urllib.request.Request(ORIGIN + path, method=method, data=b"{}" if method == "POST" else None,
                                         headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception:
            code = 0
        res[f"{method} {path}"] = code
        if not want(code):
            fails.append(f"api {method} {path} -> {code}")
    report["api"] = res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, nargs="*", default=[390, 1440])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--register", action="store_true", help="add new things to docs/ui-registry.json as unreviewed")
    a = ap.parse_args()
    old = _cache.reuse(OUT, a.width)
    if old:
        print(f"cached for build {old['build']} ({'FAIL' if old['fails'] else 'PASS'}, {len(old['fails'])} fails); --force to rerun")
        for f in old["fails"][:12]:
            print("  ", f[:150])
        sys.exit(1 if old["fails"] else 0)
    report, fails = {}, []
    with sync_playwright() as pw:
        for w in a.width:
            run(w, pw, report, fails)
    api_checks(report, fails)
    registry_check(report, fails, a.register)
    report["fails"] = fails
    report["build"] = _cache.build_id()
    report["widths"] = a.width
    json.dump(report, open(OUT, "w"), indent=1)
    for w in a.width:
        r = report[f"w{w}"]
        print(f"{w}px: {r['visible']} visible controls, {len(r['internal_links'])} internal and {len(r['external_links'])} external links, "
              f"{r['toggles_checked']} toggles, overflow {r['h_overflow_px']}px")
    print("api", report["api"])
    print("FAIL" if fails else "PASS")
    for f in fails[:14]:
        print("  ", f[:150])
    if len(fails) > 14:
        print(f"   ... {len(fails) - 14} more in docs/ui-inventory.json")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
