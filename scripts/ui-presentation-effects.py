"""Offline UI proof: source-state presentation, bounded Venom, three CTA cues."""
import copy, importlib.util, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui', ROOT/'scripts/ui-agent-screen.py')
ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)
checks = {}; errors = []
with sync_playwright() as p:
    browser = ui.launch(p)
    ctx = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='no-preference')
    ui.install_offline(ctx)
    page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ui.ORIGIN, wait_until='domcontentloaded')
    page.wait_for_selector('[data-venom-surface][data-listening]')
    link = page.locator('#top a[data-email-draft]'); href = link.get_attribute('href')
    box = link.bounding_box()
    page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
    surface = link.locator('[data-venom-surface]')
    try:
        page.wait_for_function("document.querySelector('[data-venom-surface]')?.dataset.ready==='true'", timeout=10000)
    except Exception:
        print(json.dumps({'venomErrors':errors,'surface':surface.evaluate('e=>e.outerHTML'),'media':page.evaluate("()=>({fine:matchMedia('(hover: hover) and (pointer: fine)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.hidden,motion:document.documentElement.dataset.motionPref})"),'frames':[(f.url, f.locator('body').get_attribute('class')) for f in page.frames]},indent=2),flush=True)
        raise
    checks['venom_renderer_ready'] = surface.get_attribute('data-ready') == 'true'
    checks['venom_native_anchor_unchanged'] = link.get_attribute('href') == href
    checks['venom_decoration_cannot_capture_input'] = surface.evaluate("e=>getComputedStyle(e).pointerEvents==='none' && e.querySelector('iframe').tabIndex===-1")
    checks['venom_bounds_preserve_layout'] = link.bounding_box() == box
    frame = page.frames[-1]
    checks['venom_actual_webgl_canvas'] = frame.locator('body.has-gl canvas#stage').count() == 1
    page.mouse.move(box['x']+10, box['y']+15); page.wait_for_timeout(150)
    page.screenshot(path=str(ROOT/'docs/companion-shots/venom-desktop.png'))
    page.wait_for_timeout(1300)
    checks['venom_pauses_when_pointer_stops'] = surface.get_attribute('data-active') is None
    page.emulate_media(reduced_motion='reduce')
    checks['venom_reduced_motion_fallback'] = not surface.is_visible()
    page.emulate_media(reduced_motion='no-preference')
    page.locator('#agent [aria-label="Open full screen"]').click()
    try:
        page.wait_for_function("document.querySelectorAll('#agent [data-featured]').length===3", timeout=6500)
    except Exception:
        print(json.dumps(page.evaluate("()=>({focus:document.activeElement?.outerHTML,win:document.querySelector('#agent').matches(':popover-open'),view:document.querySelector('#agent-panel').getBoundingClientRect().toJSON(),terms:[...document.querySelectorAll('#agent [data-brief-term]')].map(e=>({n:e.dataset.briefTerm,featured:e.dataset.featured,rect:e.getBoundingClientRect().toJSON()}))})"),indent=2),flush=True)
        raise
    checks['exactly_three_featured_ctas'] = page.locator('#agent [data-featured]').count() == 3
    checks['only_one_glowing_cta'] = page.locator('#agent [data-lit]').count() == 1
    selected = page.locator('#agent [data-lit]').get_attribute('data-brief-term')
    page.wait_for_function("old=>document.querySelector('#agent [data-lit]')?.dataset.briefTerm!==old", arg=selected, timeout=6500)
    checks['glow_rotates_without_repeating'] = page.locator('#agent [data-lit]').get_attribute('data-brief-term') != selected
    term = page.locator('#agent [data-brief-term]').first; term.focus()
    frozen = page.locator('#agent [data-lit]').get_attribute('data-brief-term')
    page.wait_for_timeout(5100)
    checks['focused_cta_pauses_rotation'] = page.locator('#agent [data-lit]').get_attribute('data-brief-term') == frozen
    ctx.close()

    good = copy.deepcopy(next(iter(ui._offline_examples.values())))
    cases = [('supported', good, 'supported')]
    for name, changes in (
        ('missing_grounding', {'grounding':None}),
        ('unsupported', {'grounding':{'claims':1,'found':0,'g':0,'unsupported':['999']}}),
        ('dropped_stream', {'failed':True}),
        ('uncited_text', {'answer':good['answer']+' An uncited invented claim.'}),
        ('forged_passage', {'citations':[{**c,'text':'A forged passage that never existed.'} for c in good['citations']]}),
    ):
        cases.append((name, {**copy.deepcopy(good), **changes}, 'withheld'))
    for name, result, state in cases:
        ctx = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
        ui.install_offline(ctx)
        page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("sessionStorage.setItem('agent:thread:v1',"+json.dumps(json.dumps([{'question':'Offline source-state fixture','result':result}]))+")")
        page.goto(ui.ORIGIN, wait_until='domcontentloaded')
        page.locator('#agent [aria-label="Open full screen"]').click()
        notice = page.locator(f'#agent [data-evidence-state="{state}"]')
        checks[name+'_state'] = notice.count() == 1
        if state == 'withheld':
            checks[name+'_no_markers'] = page.locator('#agent article sup button').count() == 0
            checks[name+'_no_answer_export'] = not page.get_by_role('button',name='Copy',exact=True).is_enabled()
            checks[name+'_no_original_text'] = good['answer'] not in page.locator('#agent article').inner_text()
        else:
            checks[name+'_source_markers'] = page.locator('#agent article sup button').count() > 0
        if name == 'missing_grounding':
            page.screenshot(path=str(ROOT/'docs/companion-shots/answer-withheld.png'))
        ctx.close()
    checks['no_page_errors'] = not errors
    browser.close()
report = {'checks':checks,'errors':errors,'scope':'Offline frontend fixtures; no semantic truth or live model proof.'}
(ROOT/'docs/companion-shots/presentation-effects.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2)); assert all(checks.values())
