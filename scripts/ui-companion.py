"""Provider-disabled companion flow checks. Every agent endpoint is intercepted."""
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('agent_screen', ROOT / 'scripts/ui-agent-screen.py')
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
OUT = ROOT / 'docs/companion-shots'
OUT.mkdir(exist_ok=True)
checks = {}

def check(name, value):
    checks[name] = bool(value)

with sync_playwright() as p:
    browser = ui.launch(p)
    for width in (390, 1440):
        ctx = browser.new_context(viewport={'width': width, 'height': 900}, has_touch=width<700, is_mobile=width<700, reduced_motion='reduce')
        ui.install_offline(ctx)
        page = ctx.new_page()
        page.goto(ui.ORIGIN, wait_until='domcontentloaded')
        guide = page.get_by_role('complementary', name='Portfolio guide')
        page.wait_for_selector('[aria-label="Portfolio guide"]')
        if width<700: check(f'{width}_visible_ask_label', guide.get_by_text('Ask', exact=True).is_visible())
        for index, stop in enumerate(('top', 'opensource', 'work', 'running', 'research', 'proof', 'approach', 'contact')):
            page.locator('#'+stop).evaluate("el=>el.scrollIntoView({block:'start',behavior:'instant'})")
            page.wait_for_function("i=>document.querySelector('[aria-label=\"Portfolio guide\"]').dataset.stop===String(i)", arg=index)
            check(f'{width}_destination_{stop}', guide.get_attribute('data-stop') == str(index))
        check(f'{width}_reduced_motion', guide.get_attribute('data-calm') == 'true' and guide.evaluate("e=>getComputedStyle(e).transform==='none'"))
        guide.get_by_role('button', name='Ask the work.', exact=False).click()
        panel = page.get_by_role('region', name='Ask the portfolio guide')
        check(f'{width}_context_changes', 'role in mind' in panel.text_content())
        panel.get_by_label('Ask anything about Kushal').fill('A draft to preserve')
        panel.get_by_role('button', name='Close guide', exact=True).click()
        guide.get_by_role('button').click()
        check(f'{width}_draft_preserved', panel.locator('input').input_value() == 'A draft to preserve')
        panel.locator('input').press('Escape')
        check(f'{width}_escape_restores_focus', guide.get_by_role('button').evaluate('e=>e===document.activeElement'))
        guide.get_by_role('button').click()
        page.evaluate("()=>{const b=document.createElement('button');b.id='outside-focus-fixture';b.textContent='Outside focus fixture';b.style='position:fixed;top:8px;left:8px;z-index:1000';document.body.append(b)}")
        page.locator('#outside-focus-fixture').click()
        check(f'{width}_outside_dismiss_preserves_clicked_focus', page.locator('#outside-focus-fixture').evaluate('e=>e===document.activeElement') and not panel.count())
        page.locator('#outside-focus-fixture').evaluate('e=>e.remove()')
        guide.get_by_role('button').click()
        panel.get_by_role('button', name='Open full chat', exact=True).click()
        page.wait_for_selector('#agent:popover-open')
        check(f'{width}_opens_existing_chat', page.locator('#agent').evaluate("e=>e.matches(':popover-open')"))
        page.locator('#agent [aria-label="Close full screen"]').click()
        page.wait_for_timeout(100)
        check(f'{width}_full_chat_returns_to_launcher', guide.get_by_role('button').evaluate('e=>e===document.activeElement'))
        guide.get_by_role('button').click()
        panel.get_by_role('button', name='Hide guide', exact=True).click()
        check(f'{width}_dismissible', not guide.count() and page.get_by_role('button', name='Show guide', exact=True).is_visible())
        check(f'{width}_hide_retains_keyboard_focus', page.get_by_role('button', name='Show guide', exact=True).evaluate('e=>e===document.activeElement'))
        page.get_by_role('button', name='Show guide', exact=True).click()
        check(f'{width}_show_restores_launcher_focus', guide.get_by_role('button').evaluate('e=>e===document.activeElement'))
        # Ask a real saved-example question through the new composer.
        page.locator('#work').evaluate("e=>e.scrollIntoView({behavior:'instant'})")
        guide.get_by_role('button').click()
        panel.locator('input').fill('How does retrieval work here, and what tradeoffs did he make?')
        panel.get_by_role('button', name='Send guide question', exact=True).click()
        page.wait_for_selector('#agent[data-state="answered"]')
        chat = page.locator('#agent [class*="AgentCompanion"][class*="chat"]')
        check(f'{width}_run_event_visible', chat.is_visible() and chat.get_attribute('data-phase') == 'done')
        chat.locator('summary').click()
        check(f'{width}_actual_activity_log', chat.locator('ol li').count() >= 3)
        check(f'{width}_no_horizontal_overflow', page.locator('#agent').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
        second=next(q for q in ui._offline_examples if q!='how does retrieval work here, and what tradeoffs did he make?')
        page.locator('#ask').fill(second)
        page.locator('#agent form button[type="submit"]').click()
        page.wait_for_function("()=>document.querySelectorAll('#agent-question-picker option').length===2 && document.querySelector('#agent').dataset.state!=='busy'")
        picker=page.locator('#agent-question-picker')
        picker.select_option('0')
        check(f'{width}_native_selector_change_first', picker.input_value()=='0')
        picker.select_option('1')
        check(f'{width}_native_selector_change_last', picker.input_value()=='1')
        if width<700:
            check(f'{width}_native_selector_touch_target', picker.bounding_box()['height']>=44)
            picker.tap();picker.select_option('0')
            check(f'{width}_native_selector_touch_choice', picker.input_value()=='0')
        page.screenshot(path=str(OUT / f'{width}-chat.png'))
        page.locator('#agent [aria-label="Close full screen"]').click()
        guide.get_by_role('button').click()
        for theme in ('dark', 'light'):
            page.evaluate('t=>document.documentElement.dataset.theme=t', theme)
            axe = ROOT.parent / 'node_modules/axe-core/axe.min.js'
            page.add_script_tag(path=str(axe))
            violations = page.evaluate("async()=> (await axe.run('[aria-label=\"Portfolio guide\"]',{runOnly:{type:'rule',values:['color-contrast','button-name','label','aria-valid-attr-value','nested-interactive']}})).violations.map(v=>v.id)")
            check(f'{width}_{theme}_axe', not violations)
        page.screenshot(path=str(OUT / f'{width}-guide.png'))
        ctx.close()
    browser.close()
(OUT / 'report.json').write_text(json.dumps({'mode':'offline intercepted saved examples', 'checks':checks, 'unverified':['Native macOS popup keyboard defaults need real-browser/device confirmation; headless key delivery produced no native input/change event. Keyboard Introduction/Latest navigation remains covered by the core UI gate.']}, indent=2))
print(json.dumps(checks, indent=2))
assert all(checks.values()), 'Companion checks failed'
