"""Offline input/geometry checks for robot IK, border reset, CTA lights and arrows."""
import importlib.util,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('ui',ROOT/'scripts/ui-agent-screen.py')
ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)
checks={}
with sync_playwright() as p:
    browser=ui.launch(p)
    ctx=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='no-preference')
    ui.install_offline(ctx)
    page=ctx.new_page();page.goto(ui.ORIGIN,wait_until='domcontentloaded')
    guide=page.locator('[aria-label="Portfolio guide"]')
    page.wait_for_selector('[aria-label="Portfolio guide"]')
    arm=guide.locator('[class*="armRight"]')
    page.mouse.move(100,150);page.wait_for_timeout(650)
    first=arm.evaluate('e=>e.style.transform')
    r1=guide.bounding_box()
    page.mouse.move(1300,750);page.wait_for_timeout(650)
    second=arm.evaluate('e=>e.style.transform')
    r2=guide.bounding_box()
    checks['arms_follow_runtime_input']=bool(first and second and first!=second)
    checks['body_tracks_pointer_on_border']=abs(r2['y']-r1['y'])>20 and abs(r2['x']-r1['x'])<1
    checks['bot_remains_inside_viewport']=r2['x']>=0 and r2['x']+r2['width']<=1440 and r2['y']>=60 and r2['y']+r2['height']<=920
    page.mouse.wheel(0,90);page.wait_for_timeout(350)
    checks['single_scroll_does_not_reset']=guide.get_attribute('data-reset')!='true'
    page.evaluate("async()=>{const end=performance.now()+1300;await new Promise(resolve=>{function tick(){window.scrollBy(0,16);if(performance.now()<end)requestAnimationFrame(tick);else resolve()}tick()})}")
    checks['continuous_second_resets']=guide.get_attribute('data-reset')=='true'
    page.wait_for_timeout(650)
    guide.get_by_role('button').click()
    panel=page.get_by_role('region',name='Ask the portfolio guide')
    box=panel.bounding_box()
    checks['moving_guide_panel_stays_on_screen']=box['y']>=0 and box['y']+box['height']<=1000
    panel.get_by_role('button',name='Close guide',exact=True).click()
    # Disclosures may wrap an EmailLink; the arrow inherits behavior from its anchor.
    links=page.locator('a[href^="mailto:"]:has([data-email-arrow])')
    checks['all_visible_email_drafts_share_arrow']=page.locator('a[href^="mailto:"][href*="subject="][href*="body="]:not(:has([data-email-arrow]))').count()==0
    hrefs=links.evaluate_all('(els)=>els.map(e=>e.href)')
    checks['draft_links_still_contain_subject_and_body']=all('subject=' in h and 'body=' in h for h in hrefs)
    small=page.locator('#work a[href^="mailto:"]:has([data-email-arrow])')
    small.scroll_into_view_if_needed();small.hover();page.wait_for_timeout(350)
    checks['small_arrow_reveals_smoothly']=small.locator('[data-email-arrow]').evaluate("e=>getComputedStyle(e).opacity==='1' && parseFloat(getComputedStyle(e).transitionDuration)>0")
    large=page.locator('#contact a[href^="mailto:"]')
    large.scroll_into_view_if_needed();large.hover();page.wait_for_timeout(650)
    checks['large_arrow_uses_separate_gsap_engine']=large.locator('[data-email-arrow]').get_attribute('data-engine')=='gsap'
    checks['large_arrow_visible']=large.locator('[data-email-arrow]').evaluate('e=>Number(getComputedStyle(e).opacity)>.99')
    checks['cta_light_is_inset_and_noninteractive']=page.locator('[data-cta-light]').count()==2 and page.locator('#contact [data-cta-light]').evaluate("e=>getComputedStyle(e).pointerEvents==='none' && getComputedStyle(e).position==='absolute'")
    # Mount the same link in a disclosure without changing its href/handlers.
    small.evaluate("e=>{const d=document.createElement('details');d.open=true;const s=document.createElement('summary');s.textContent='Fixture disclosure';d.append(s);e.before(d);d.append(e)}")
    small.hover();page.wait_for_timeout(300)
    checks['arrow_works_inside_disclosure']=small.locator('[data-email-arrow]').evaluate("e=>getComputedStyle(e).opacity==='1'")
    page.emulate_media(reduced_motion='reduce')
    checks['reduced_motion_arrow_stays_visible']=large.locator('[data-email-arrow]').evaluate("e=>getComputedStyle(e).opacity==='1' && getComputedStyle(e).transform==='none'")
    page.screenshot(path=str(ROOT/'docs/companion-shots/email-motion.png'))
    ctx.close();browser.close()
(ROOT/'docs/companion-shots/motion-report.json').write_text(json.dumps(checks,indent=2))
print(json.dumps(checks,indent=2));assert all(checks.values())
