"""Offline intentional GSAP chunk failure: email draft links must remain usable."""
import importlib.util,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('ui',ROOT/'scripts/ui-agent-screen.py')
ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)
checks={};blocked=[]
with sync_playwright() as p:
    browser=ui.launch(p)
    for touch in (False,True):
        ctx=browser.new_context(viewport={'width':390 if touch else 1440,'height':900},is_mobile=touch,has_touch=touch,reduced_motion='no-preference')
        ui.install_offline(ctx)
        def fail_chunk(route):
            if route.request.resource_type=='script': blocked.append(route.request.url);route.abort()
            else: route.continue_()
        ctx.route('**/*gsap*',fail_chunk)
        page=ctx.new_page();page.goto(ui.ORIGIN,wait_until='domcontentloaded')
        link=page.locator('#contact a[href^="mailto:"]')
        link.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
        arrow=link.locator('[data-email-arrow]')
        before=link.get_attribute('href')
        if touch:
            checks['touch_arrow_visible_without_hover']=arrow.evaluate("e=>getComputedStyle(e).opacity==='1'")
        else:
            link.hover();page.wait_for_timeout(700)
            checks['missing_gsap_keeps_css_arrow_visible']=arrow.evaluate("e=>getComputedStyle(e).opacity==='1'")
            checks['fallback_engine_remains_css']=arrow.get_attribute('data-engine') is None
            page.mouse.move(0,0);link.focus()
            checks['keyboard_arrow_visible_without_wait']=arrow.evaluate("e=>getComputedStyle(e).opacity==='1' && getComputedStyle(e).transform==='none'")
        checks[f'{touch}_draft_destination_unchanged']=link.get_attribute('href')==before and 'subject=' in before and 'body=' in before
        ctx.close()
    browser.close()
checks['actual_gsap_chunk_failure_exercised']=bool(blocked)
(ROOT/'docs/companion-shots/email-fallback.json').write_text(json.dumps({'checks':checks,'blocked_script_count':len(blocked)},indent=2))
print(json.dumps(checks,indent=2));assert all(checks.values())
