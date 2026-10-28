"""Offline visitor outcomes: role/CTA visibility, referral arrival and manual copy."""
import importlib.util,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('ui',ROOT/'scripts/ui-agent-screen.py')
ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)
checks={}
with sync_playwright() as p:
    browser=ui.launch(p)
    for width,height in ((360,800),(390,844),(1440,900)):
        ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<700,has_touch=width<700,reduced_motion='reduce')
        ui.install_offline(ctx);page=ctx.new_page();page.goto(ui.ORIGIN,wait_until='domcontentloaded')
        email=page.locator('#top a[data-email-draft]');resume=page.locator('#top [class*="actions"] > a[href$="resume.pdf"]')
        checks[f'{width}_email_and_resume_first_screen']=all(el.evaluate('e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}') for el in (email,resume))
        checks[f'{width}_keyboard_order_matches_visual_priority']=page.locator('#top [class*="actions"]').evaluate("e=>!!(e.compareDocumentPosition(document.querySelector('#top nav[aria-label=\"Find what you need\"]')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        checks[f'{width}_email_preserves_draft']=all(x in email.get_attribute('href') for x in ('mailto:','subject=','body='))
        page.screenshot(path=str(ROOT/f'docs/companion-shots/{width}-hero.png'))
        page.goto(ui.ORIGIN+'/#contact-forward',wait_until='domcontentloaded')
        target=page.locator('#contact-forward')
        page.wait_for_function("()=>document.activeElement?.id==='contact-forward'")
        checks[f'{width}_referral_arrival_opens_and_focuses']=target.evaluate("e=>e.closest('details').open && document.activeElement===e")
        introduction=target.locator('textarea')
        checks[f'{width}_referral_text_remains_selectable']=introduction.get_attribute('readonly') is not None and bool(introduction.input_value())
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Fixture refusal'))}})")
        doi=page.locator('button').filter(has_text='Copy the DOI link')
        doi.evaluate("e=>{for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'center',behavior:'instant'})}")
        doi.click()
        fallback=page.get_by_role('textbox',name='Manual copy: Copy the DOI link',exact=True)
        fallback.wait_for()
        checks[f'{width}_denied_clipboard_has_exact_manual_value']=fallback.input_value().startswith('https://doi.org/')
        fallback.focus()
        checks[f'{width}_manual_value_is_selected']=fallback.evaluate('e=>e.selectionEnd-e.selectionStart===e.value.length')
        checks[f'{width}_no_false_copied_status']=doi.inner_text()=='Copy the DOI link'
        page.screenshot(path=str(ROOT/f'docs/companion-shots/{width}-manual-copy.png'))
        ctx.close()
    browser.close()
(ROOT/'docs/companion-shots/recruiter-journeys.json').write_text(json.dumps(checks,indent=2))
print(json.dumps(checks,indent=2));assert all(checks.values())
