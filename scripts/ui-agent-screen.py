"""
Agent card screen check, full-screen chat flow (2026-10-27).

Runs at 390x844 and 360x800 (Android phone emulation) and 1280x800, 1440x900.
Fails when:
  load   the brief is not the first view, a turn shows before anyone asks, the
         starters are missing (3 on a phone, 4 wide) or, on a phone, are not one
         grouped list, brief + starters + composer do not fit the screen, the
         page scrolls sideways, a phone control is under 44px (24px for cite
         markers), or the card paints blue;
  ask    a starter does not open the full-screen chat, the phone chat is not the
         whole viewport, a run never settles;
  cite   a turn's markers differ from its sourced sentences, a marker does not
         light that turn's passage, a passage has no date or its "Open on the
         page" link points at an id the page lacks, or the link does not close
         the chat and land on the section;
  inline after closing, the card shows a thread or more than one proof row;
  theme  under data-theme="light" a text token falls under 4.5:1 or the card paints blue;
  note   the free-tier note covers a control (wide) or shows over the open chat.

Every /api/agent/* endpoint is intercepted in the browser. Saved examples from
prewarm.json plus deterministic citation alignment exercise the UI without server
agent requests or provider calls. This is UI proof, not a live RAG quality gate. Screenshots go to docs/agent-workspace-shots/2026-10-27/.

    python3 scripts/ui-agent-screen.py [--origin http://localhost:3007] [--only 390x844]
"""
import json, sys, subprocess
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
ORIGIN = arg("--origin", "http://localhost:3007")
ONLY = arg("--only", "")
# Fail closed before any interaction: this UI gate must never spend provider credit.
if ORIGIN not in {"http://localhost:3007", "http://127.0.0.1:3007"}:
    raise SystemExit("UI gate requires the local provider-disabled preview on port 3007")
with urlopen(f"{ORIGIN}/api/health", timeout=10) as response:
    health = json.load(response)
if health.get("providers") != [] or health.get("store") != "memory" or health.get("reranker") is not False:
    raise SystemExit("UI gate refuses configured model providers, remote storage, or reranking")
OUT = Path(__file__).resolve().parent.parent / "docs" / "agent-workspace-shots" / "2026-10-27"
OUT.mkdir(parents=True, exist_ok=True)
ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
SIZES = [("390x844", 390, 844, True), ("360x800", 360, 800, True), ("1280x800", 1280, 800, False), ("1440x900", 1440, 900, False)]
STARTERS = '#agent ul[aria-label="Suggested questions"] > li > button'
SETTLED = ("done", "degraded", "failed", "stopped")

# Colours resolved through a canvas, so oklch and color-mix compare as sRGB pixels.
BLUE = """() => { const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const px = (v) => { c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = v; c.fillRect(0, 0, 1, 1); return c.getImageData(0, 0, 1, 1).data; };
  const hits = [];
  for (const e of [document.querySelector('#agent'), ...document.querySelectorAll('#agent *')]) {
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') continue;
    for (const k of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'textDecorationColor']) {
      const v = s[k]; if (!v || v === 'transparent' || /rgba?\\(0, 0, 0, 0\\)/.test(v)) continue;
      const [r, g, b, a] = px(v); if (a > 20 && b - Math.max(r, g) > 30) hits.push(`${e.tagName.toLowerCase()}.${String(e.className).split('__').pop().slice(0, 18)} ${k} ${v}`);
    }
  }
  return [...new Set(hits)].slice(0, 6); }"""

LOAD = """() => { const a = document.querySelector('#agent'); const r = a.getBoundingClientRect();
  const ul = a.querySelector('ul[aria-label="Suggested questions"]'); const us = ul && getComputedStyle(ul);
  const small = [...a.querySelectorAll('button, a, textarea')].filter(e => { const b = e.getBoundingClientRect();
    if (!b.width || !b.height || e.closest('dialog:not([open])')) return false;
    return Math.min(b.height, b.width) < (e.closest('sup') ? 24 : 44) - 0.5; })
    .map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height));
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth,
    form: Math.round(a.querySelector('form').getBoundingClientRect().bottom), brief: !!a.querySelector('section[aria-label="In brief"]'),
    turns: a.querySelectorAll('[id^="agent-q-"]').length, grouped: !!us && us.rowGap === '0px' && us.borderTopStyle !== 'none', small }; }"""

FULL = """() => { const a = document.querySelector('#agent'); const r = a.getBoundingClientRect();
  return { open: a.matches(':popover-open'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
    phase: a.querySelector('p[data-phase]')?.dataset.phase }; }"""

# Markers per turn on the page against the citations the thread stored for it.
MARKS = """() => { const saved = JSON.parse(sessionStorage.getItem('agent:thread:v1') || '[]');
  return [...document.querySelectorAll('#agent ol[aria-label="Conversation"] > li')].map((li, i) => ({
    shown: li.querySelectorAll('article sup button').length,
    sourced: (saved[i]?.result?.citations || []).filter(c => c.n).length })); }"""

# Each text token against the card's paper and the raised rows, as WCAG ratios.
CONTRAST = """() => { const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const st = getComputedStyle(document.querySelector('#agent')); const v = (k) => st.getPropertyValue(k).trim();
  const lum = (x) => { c.fillStyle = '#000'; c.fillStyle = x; c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(n => n / 255).map(n => n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round((x + 0.05) / (y + 0.05) * 10) / 10; };
  const out = {}; for (const ground of ['--paper', '--paper-raised']) for (const ink of ['--ink', '--ink-soft', '--ink-faint']) out[`${ink}/${ground}`] = ratio(v(ink), v(ground));
  return out; }"""

INLINE = """() => { const a = document.querySelector('#agent');
  return { open: a.matches(':popover-open'), thread: a.querySelectorAll('ol[aria-label="Conversation"]').length,
    proofRows: a.querySelectorAll('[class*="glanceHints"]').length + a.querySelectorAll('ul[aria-label="How this answer was produced"]').length }; }"""


def settle(page, turns, timeout=30000):
    page.wait_for_function(f"""() => document.querySelectorAll('#agent [id^="agent-q-"]').length >= {turns}
      && !document.querySelector('#agent[data-state="busy"]') && {list(SETTLED)}.includes(document.querySelector('#agent p[data-phase]')?.dataset.phase)""", timeout=timeout)


def launch(p):
    for opts in ({"channel": "chrome"}, {}):
        try:
            return p.chromium.launch(**opts)
        except Exception as e:
            err = e
    raise err


def workspace_checks(page, phone, bad):
    out = {}
    def check(name, value):
        out[name] = bool(value)
        if not value: bad(f"workspace {name}")
    check("dialog_semantics", page.locator('#agent').get_attribute('role') == 'dialog' and page.locator('#agent').get_attribute('aria-modal') == 'true')
    check("window_chrome_visible", page.locator('#agent').evaluate("""a=>{const t=a.querySelector('#agent-win-title').getBoundingClientRect(),c=a.querySelector('[aria-label="Close full screen"]').getBoundingClientRect(),f=a.querySelector('form').getBoundingClientRect();return t.top>=0&&c.top>=0&&c.right<=innerWidth&&f.bottom<=innerHeight;}"""))
    check("six_topic_entries", page.locator('#agent nav[aria-label="Explore his record"] button').count() == 6)
    check("visible_composer_label", page.locator('#agent label[for="ask"]').is_visible())
    page.locator('#agent-question-picker').select_option('0')
    page.wait_for_timeout(600)
    check("first_turn_selected", page.locator('#agent-question-picker').input_value() == '0')
    page.get_by_role('button', name='Latest answer', exact=True).click()
    page.wait_for_timeout(600)
    check("latest_turn_selected", page.locator('#agent-question-picker').input_value() == '1')
    check("local_question_scroll", page.evaluate("""() => { const v=document.querySelector('#agent-panel').getBoundingClientRect(); const q=document.querySelector('#agent-q-1').getBoundingClientRect(); return q.top >= v.top - 2 && q.top < v.bottom; }"""))
    page.get_by_role('button', name='Introduction', exact=True).click()
    page.wait_for_function("document.querySelector('#agent-panel').scrollTop <= 1")
    check('introduction_navigation', page.locator('#agent-panel').evaluate('e=>e.scrollTop<=1'))
    page.get_by_role('button', name='Latest answer', exact=True).click()
    page.wait_for_timeout(600)
    page.locator('#ask').fill('x' * 1700)
    check("near_limit_counter", page.locator('#agent [class*="composerHeading"]').inner_text().find('1,700/2,000') >= 0)
    page.locator('#ask').fill('')
    page.locator('#ask').press('ArrowUp')
    check("edit_cancel_available", page.get_by_role('button', name='Cancel edit', exact=True).is_visible())
    page.get_by_role('button', name='Cancel edit', exact=True).click()
    check("cancel_keeps_chat", page.locator('#agent').evaluate("e=>e.matches(':popover-open')") and page.locator('#ask').input_value() == '')
    # Compare actual cycle endpoints, including disclosures and hidden sheet content.
    page.evaluate("""() => {const a=document.querySelector('#agent'); const cs=[...a.querySelectorAll('button,a[href],textarea,select,input,summary,[tabindex]')].filter(e=>e.tabIndex>=0&&!e.matches(':disabled')&&e.checkVisibility()&&!e.closest('dialog:not([open]), details:not([open]) > :not(summary)'));window.__focusFirst=cs[0];window.__focusLast=cs.at(-1);window.__focusLast.focus();}""")
    page.keyboard.press('Tab')
    check("focus_wrap_forward", page.evaluate('document.activeElement===window.__focusFirst'))
    page.keyboard.press('Shift+Tab')
    check("focus_wrap_backward", page.evaluate('document.activeElement===window.__focusLast'))
    check("background_inert", page.evaluate("!!document.querySelector('main')?.closest('[inert]')"))
    if not phone:
        page.locator('#agent-tab-sources').focus()
        page.keyboard.press('End')
        check("tab_end", page.locator('#agent-tab-trace').get_attribute('aria-selected') == 'true')
        check("trace_context", page.locator('#agent [class*="traceOverview"]').inner_text().find('Question 2') >= 0)
        check("truthful_origin", page.locator('#agent [data-origin]').get_attribute('data-origin') in ['tab','build','retrieved','generated','unknown'])
        page.keyboard.press('Home')
        check("tab_home", page.locator('#agent-tab-sources').get_attribute('aria-selected') == 'true')
    check("valid_tab_panels", page.evaluate("""() => [...document.querySelectorAll('#agent [role=tab]')].every(e=>!!document.getElementById(e.getAttribute('aria-controls')))&&[...document.querySelectorAll('#agent [role=tabpanel]')].every(e=>e.getAttribute('aria-labelledby')?.split(' ').every(id=>!!document.getElementById(id)))"""))
    check("no_display_stroke", page.locator('#agent-q-1').evaluate("e=>getComputedStyle(e).webkitTextStrokeWidth==='0px'&&getComputedStyle(e).textShadow==='none'"))
    return out


def source_checks(page, passage, phone, bad):
    out = {}
    def check(name, value):
        out[name] = bool(value)
        if not value: bad(f"source {name}")
    check('overview', page.locator('#agent [aria-label="Evidence for this answer"]').is_visible())
    text = passage.locator('blockquote').text_content()
    # Exercise UI clipboard behavior without modifying the system clipboard.
    page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}})")
    passage.get_by_role('button', name='Copy passage').click()
    check('exact_passage_copy', page.evaluate('window.__copied') == text)
    check('copy_feedback', 'Passage copied' in passage.inner_text())
    page.evaluate("void (navigator.clipboard.writeText=async()=>{throw new Error('fixture refusal')})")
    passage.get_by_role('button', name='Copy passage').click()
    check('clipboard_refusal_visible', page.locator('#agent [role="alert"]').is_visible() and 'Clipboard unavailable' in page.locator('#agent [role="alert"]').text_content())
    page.locator('#ask').evaluate("e=>e.dispatchEvent(new Event('input',{bubbles:true}))")
    if phone:
        page.locator('#agent-sheet-tab-sources').focus()
        page.keyboard.press('End')
        check('sheet_trace_switch', page.locator('#agent-sheet-tab-trace').get_attribute('aria-selected') == 'true')
    else:
        page.locator('#agent-tab-trace').click()
    trace = page.locator('#agent [class*="advancedTrace"]')
    check('advanced_initially_closed', trace.get_attribute('open') is None)
    trace.locator('summary').first.click()
    check('billing_not_inferred', '$0.00 billed' not in trace.inner_text())
    check('saved_evaluation_label', 'saved build-level evaluation' in trace.inner_text())
    check('support_not_probability', 'not a probability of correctness' in page.locator('#agent [class*="board"]').inner_text())
    trace.locator('summary').first.click()
    if phone:
        page.locator('#agent-sheet-tab-trace').focus(); page.keyboard.press('Home')
        check('sheet_sources_switch', page.locator('#agent-sheet-tab-sources').get_attribute('aria-selected') == 'true')
    else:
        page.locator('#agent-tab-sources').click()
    page.get_by_role('button', name='Back to answer', exact=True).click()
    page.wait_for_timeout(600)
    check('back_to_citation', page.evaluate("document.activeElement?.getAttribute('aria-label')?.startsWith('Source ')") is True)
    check('sheet_closed_chat_open', page.evaluate("document.querySelector('#agent').matches(':popover-open')&&!document.querySelector('#agent dialog[open]')"))
    return out


_offline_examples = None


def install_offline(ctx):
    """Intercept every agent endpoint; saved examples exercise UI, never inference."""
    global _offline_examples
    if _offline_examples is None:
        source = """
const { readFileSync } = require('node:fs');
const { cite } = require('./lib/agent/ground.ts');
const { loadContent } = require('./lib/content.ts');
const examples = JSON.parse(readFileSync('lib/agent/prewarm.json', 'utf8'));
const sections = loadContent().sections;
for (const entry of Object.values(examples)) entry.citations = cite(entry.answer, sections);
process.stdout.write(JSON.stringify(examples));
"""
        built = subprocess.run(['npx','--no-install','tsx','-e',source], cwd=OUT.parents[2], capture_output=True, text=True, check=True)
        _offline_examples = json.loads(built.stdout)
    def serve(route):
        url = urlsplit(route.request.url)
        if url.path.endswith('/demo'):
            entry = dict(next(iter(_offline_examples.values())))
            entry.update(question=next(iter(_offline_examples)), ranAt=0, warm=True, provider='saved-example')
            route.fulfill(status=200, content_type='application/json', body=json.dumps(entry))
        elif url.path.endswith('/stream'):
            question = parse_qs(url.query).get('q',[''])[0].strip().lower()
            entry = _offline_examples.get(question)
            if entry is None:
                route.abort(); return
            entry = dict(entry, warm=True, provider='saved-example')
            events = [dict(type='route',route=entry['route'],ms=entry['timings'].get('route',0)),
                dict(type='sources',titles=entry['sources'],trace=entry.get('trace'),ms=entry['timings'].get('retrieve',0)),
                dict(type='token',text=entry['answer']), dict(entry, type='done')]
            route.fulfill(status=200, content_type='text/event-stream', body=''.join('data: '+json.dumps(event)+'\n\n' for event in events))
        else:
            route.abort()
    ctx.route('**/api/agent/**', serve)


def run(b, name, vw, vh, phone, fails):
    bad = lambda msg: fails.append(f"{name}: {msg}")
    ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if phone else 1, is_mobile=phone, has_touch=phone, user_agent=ANDROID if phone else None)
    install_offline(ctx)
    page = ctx.new_page()
    console_errors, network_errors = [], []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: console_errors.append(str(err)))
    page.on("response", lambda response: network_errors.append({"status": response.status, "url": response.url}) if response.status >= 400 else None)
    page.goto(f"{ORIGIN}/", wait_until="load")
    page.wait_for_selector('#agent section[aria-label="In brief"]', timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("#agent").scroll_into_view_if_needed()
    page.evaluate("document.querySelector('#agent').scrollIntoView({ block: 'start', behavior: 'instant' })")
    page.wait_for_timeout(300)
    # ScrollTrigger can restore an earlier offset during its initial refresh.
    page.evaluate("document.querySelector('#agent').scrollIntoView({ block: 'start', behavior: 'instant' })")
    row = {"mode": "offline saved examples; no server agent requests", "load": page.evaluate(LOAD)}
    L = row["load"]
    page.screenshot(path=str(OUT / f"{name}-1-load.png"))
    starters = page.locator(STARTERS)
    want = 3 if phone else 4
    if starters.count() != want: bad(f"{starters.count()} starters (want {want})")
    if abs(L["top"] - 48) > 1: bad(f"card not aligned to its 48px scroll margin: {L['top']}")
    if L["turns"]: bad(f"{L['turns']} turn(s) before anyone asked")
    if not L["brief"]: bad("no brief on load")
    if phone and not L["grouped"]: bad("starters are not one grouped list")
    # Every phone size must fit; recording overflow alone cannot pass this gate.
    if phone and L["form"] > vh: bad(f"composer bottom {L['form']} below the screen ({vh}); card {L['top']} to {L['bottom']}")
    if L["overflowX"] > 0: bad(f"page scrolls sideways by {L['overflowX']}px")
    if phone and L["small"]: bad(f"small targets {L['small'][:5]}")
    row["blueLoad"] = page.evaluate(BLUE)
    if row["blueLoad"]: bad(f"blue in the card: {row['blueLoad']}")

    records = page.locator('#agent ul[aria-label="On the record"]:visible')
    if records.count() != 1:
        bad(f"{records.count()} visible record lists (want 1)")
    else:
        row["records"] = records.evaluate("""ul => {
          const starters = document.querySelector('#agent ul[aria-label="Suggested questions"]');
          const form = document.querySelector('#agent form');
          const controls = [...ul.querySelectorAll('button, a')];
          const hidden = [...document.querySelectorAll('#agent ul[aria-label="On the record"]')].filter(e => e !== ul);
          return { afterStarters: ul.getBoundingClientRect().top >= starters.getBoundingClientRect().bottom,
            afterComposer: ul.getBoundingClientRect().top >= form.getBoundingClientRect().bottom,
            beforeStarters: ul.getBoundingClientRect().bottom <= starters.getBoundingClientRect().top,
            domAfterComposer: !!(form.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING),
            hiddenBoxes: hidden.some(e => e.getClientRects().length > 0),
            small: controls.filter(e => Math.min(e.getBoundingClientRect().height, e.getBoundingClientRect().width) < 43.5).length,
            focusable: controls.every(e => { e.focus({preventScroll:true}); return document.activeElement === e; }) };
        }""")
        R = row["records"]
        if R["hiddenBoxes"]: bad("unused record list still has a rendered box")
        if phone and not (R["afterStarters"] and R["afterComposer"] and R["domAfterComposer"]): bad("phone proof records precede starters or composer")
        if phone and (R["small"] or not R["focusable"]): bad(f"phone proof controls not 44px and focusable: {R}")
        if not phone and not R["beforeStarters"]: bad("desktop proof records moved below starters")

    # Any interaction opens the full-screen chat. Turn 1 is a build-time answer with
    # citations (served only to a first question); turn 2 follows it with history.
    starters.filter(has_text="retrieval").first.click()
    page.wait_for_timeout(400)
    f = page.evaluate(FULL)
    row["full"] = f
    if not f["open"]: bad("a starter did not open the full-screen chat")
    full_records = page.locator('#agent ul[aria-label="On the record"]:visible')
    if full_records.count() != 1 or not full_records.evaluate("ul => ul.getBoundingClientRect().bottom <= document.querySelector('#agent ul[aria-label=\"Suggested questions\"]').getBoundingClientRect().top"):
        bad("full-screen proof order changed")
    if phone and (f["x"] != 0 or abs(f["w"] - vw) > 1 or abs(f["h"] - vh) > 2): bad(f"phone chat is {f['w']}x{f['h']} at {f['x']},{f['y']}, not the viewport")
    try:
        settle(page, 1)
        page.locator(STARTERS).filter(has_text="ingestion").first.click()
        settle(page, 2)
    except Exception:
        bad(f"a run never settled (phase {page.evaluate(FULL)['phase']})")
    page.wait_for_timeout(600)
    row["workspace"] = workspace_checks(page, phone, bad)
    page.screenshot(path=str(OUT / f"{name}-2-chat.png"))
    row["marks"] = page.evaluate(MARKS)
    for i, m in enumerate(row["marks"]):
        if m["shown"] != m["sourced"]: bad(f"turn {i + 1} shows {m['shown']} markers for {m['sourced']} sourced sentences")

    # Each turn's first marker lights that turn's passage, dated. The first passage
    # whose section the page renders proves "Open on the page" (notes have no section).
    turns = page.locator('#agent ol[aria-label="Conversation"] > li')
    for t in range(turns.count()):
        cite = turns.nth(t).locator("article sup button").first
        if not cite.count():
            if t == 0: bad("turn 1 has no source marker to open")
            continue
        if phone and page.evaluate("!!document.querySelector('#agent dialog[open]')"):
            # Esc closes the top layer only: the sheet goes, the chat stays (HIG modality).
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
            layers = page.evaluate("({ chat: document.querySelector('#agent').matches(':popover-open'), sheet: !!document.querySelector('#agent dialog[open]') })")
            if layers != {"chat": True, "sheet": False}: bad(f"Esc on the Sources sheet left {layers}"); break
        n = cite.inner_text().strip("[] ")
        cite.click()
        page.wait_for_timeout(700)
        lit = page.locator(f"#agent-cite-{t}-{n}")
        ok = lit.count() and lit.get_attribute("data-hit") is not None and lit.is_visible()
        row[f"lit{t}"] = bool(ok)
        if not ok: bad(f"marker [{n}] in turn {t + 1} did not light agent-cite-{t}-{n}")
        if phone and not page.evaluate("!!document.querySelector('#agent dialog[open]')"): bad("Sources did not open as a sheet")
        if t == 0:
            row["sourceWorkspace"] = source_checks(page, lit, phone, bad)
            cite.click()
            page.wait_for_timeout(500)
            lit = page.locator(f"#agent-cite-{t}-{n}")
        meta = lit.locator('[class*="passageMeta"]')
        row[f"meta{t}"] = meta.inner_text() if meta.count() else ""
        if "Checked" not in row[f"meta{t}"]: bad(f"turn {t + 1} passage carries no date ({row[f'meta{t}']!r})")
        page.screenshot(path=str(OUT / f"{name}-3-source-turn{t + 1}.png"))
        link = meta.locator("a", has_text="Open ")
        if not link.count(): continue
        href = link.get_attribute("href")
        if not page.evaluate(f"!!document.getElementById({json.dumps(href[1:])})"): bad(f"Open on the page points at missing {href}")
        link.click()
        try: page.wait_for_function(f"Math.abs(document.getElementById({json.dumps(href[1:])}).getBoundingClientRect().top) < {vh // 2}", timeout=3000)
        except Exception: pass
        page.wait_for_timeout(300)
        land = page.evaluate(f"""() => ({{ open: document.querySelector('#agent').matches(':popover-open'), sheet: !!document.querySelector('#agent dialog[open]'),
          hash: location.hash, focus: document.activeElement?.id, top: Math.round(document.getElementById({json.dumps(href[1:])}).getBoundingClientRect().top) }})""")
        row["land"] = land
        if land["focus"] != href[1:]: bad(f"focus did not move to {href} (on {land['focus']!r})")
        if land["open"] or land["sheet"]: bad(f"Open on the page left the chat open {land}")
        if land["hash"] != href or not (-4 <= land["top"] <= vh * 0.5): bad(f"Open on the page did not land on {href}: {land}")
        page.screenshot(path=str(OUT / f"{name}-4-landed.png"))
        break
    else:
        bad("no cited passage offered Open on the page")

    # Back on the card: the latest answer and one proof row, never the thread.
    for _ in range(2):
        if page.evaluate("document.querySelector('#agent').matches(':popover-open')"): page.keyboard.press("Escape"); page.wait_for_timeout(300)
    page.evaluate("document.querySelector('#agent').scrollIntoView({ block: 'start', behavior: 'instant' })")
    page.wait_for_timeout(300)
    row["inline"] = page.evaluate(INLINE)
    I = row["inline"]
    if I["open"]: bad("the chat is still open on the card")
    if I["thread"]: bad("the inline card shows the thread")
    if I["proofRows"] != 1: bad(f"{I['proofRows']} proof rows inline (want 1)")
    page.screenshot(path=str(OUT / f"{name}-5-inline.png"))
    row["dark"] = page.evaluate(CONTRAST)
    low = {k: v for k, v in row["dark"].items() if v < 4.5}
    if low: bad(f"dark theme contrast under 4.5:1 {low}")
    if phone:
        fs = page.evaluate("parseFloat(getComputedStyle(document.querySelector('#ask')).fontSize)")
        if fs < 16: bad(f"composer text {fs}px: iOS zooms the page under 16px")

    # The note explains the card from the page; it never shows over the open chat.
    page.locator('#agent [class*="glanceHints"] button').first.click()
    page.wait_for_timeout(500)
    row["noteOverChat"] = page.evaluate("""() => { const n = document.querySelector('[class*="dotBar"], aside[aria-labelledby="free-tier-title"]');
      if (!n) return null; const b = n.getBoundingClientRect(); if (!b.width) return null;
      const x = b.left + b.width / 2, y = b.top + b.height / 2; if (y < 0 || y > innerHeight) return false;
      return n.contains(document.elementFromPoint(x, y)); }""")
    if row["noteOverChat"]: bad("the free-tier note shows over the open chat")

    # Light theme: the console follows the page into Apple's light tile; text keeps
    # 4.5:1 on its ground (HIG dark-mode: "no lower than 4.5:1"), no blue anywhere.
    page.evaluate("document.documentElement.dataset.theme = 'light'")
    page.wait_for_timeout(300)
    row["light"] = page.evaluate(CONTRAST)
    row["blueLight"] = page.evaluate(BLUE)
    low = {k: v for k, v in row["light"].items() if v < 4.5}
    if low: bad(f"light theme contrast under 4.5:1 {low}")
    if row["blueLight"]: bad(f"blue in the light-theme card: {row['blueLight']}")
    page.screenshot(path=str(OUT / f"{name}-6-light.png"))
    page.keyboard.press("Escape")
    row["consoleErrors"] = list(dict.fromkeys(console_errors))
    row["networkErrors"] = list({(e["status"], e["url"]): e for e in network_errors}.values())
    unexpected = [e for e in row["networkErrors"] if not e["url"].startswith(f"{ORIGIN}/film/")]
    if unexpected: bad(f"non-film HTTP errors: {unexpected[:3]}")
    script_errors = [e for e in row["consoleErrors"] if not e.startswith("Failed to load resource:")]
    if script_errors: bad(f"console errors: {script_errors[:3]}")
    ctx.close()
    return row


def main():
    fails, report = [], {}
    with sync_playwright() as p:
        b = launch(p)
        for name, vw, vh, phone in SIZES:
            if ONLY and name != ONLY: continue
            try:
                report[name] = run(b, name, vw, vh, phone, fails)
            except Exception as e:
                import traceback; fails.append(f"{name}: crashed: {str(e).splitlines()[0][:160]} at line {[f.lineno for f in traceback.extract_tb(e.__traceback__) if f.filename.endswith("ui-agent-screen.py")][-1]}")
        b.close()
    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    (OUT / "status.json").write_text(json.dumps({"passed": not fails, "failures": fails, "viewports": list(report)}, indent=2))
    print(json.dumps(report, indent=1)[:5000])
    print("FAIL" if fails else "PASS", *fails, sep="\n  ")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
