"""Three visitor journeys against a production build, with controlled responses.

FILM_ORIGIN=http://localhost:3003 python3 scripts/ui-journeys.py
Use --baseline before editing to record the shared Ask timing and first screen.
No provider, mail client, third-party navigation, or system clipboard is used.
"""
import argparse
import json
import os
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get("FILM_ORIGIN", "http://localhost:3003")
JOURNEYS = [("Recruiter", "work"), ("Interviewer", "approach"), ("Hiring manager", "opensource"), ("Referrer", "contact-forward")]
PHONE_ONLY = {"Referrer"}
EVIDENCE = ROOT / ".claude" / "ux-evidence"
ANSWER = "Controlled response for interface verification."
INIT = """(() => {
  window.__clipboard = ''; window.__denyCopy = false; window.__hold = false;
  Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async text => {
    if(window.__denyCopy) throw new DOMException('Controlled denial','NotAllowedError');
    window.__clipboard = text;
  }}});
  const Native = window.EventSource;
  window.EventSource = function(...args) {
    if(window.__hold) return {close(){window.__stopped = true}, onmessage:null, onerror:null};
    return new Native(...args);
  };
  window.__timing = null;
  window.addEventListener('corpus:sent', e => {
    if(!e.detail.question) return;
    window.__timing = {start:performance.now(), previousTurns:document.querySelectorAll('#agent article').length, acknowledgement:null, firstContent:null, complete:null};
  });
  window.__cls = 0; window.__shifts = [];
  new PerformanceObserver(list => {for(const e of list.getEntries()) if(!e.hadRecentInput) {
    window.__cls += e.value;
    window.__shifts.push({time:e.startTime,value:e.value,sources:(e.sources||[]).map(s=>({node:s.node?.className,previous:s.previousRect,current:s.currentRect}))});
  }}).observe({type:'layout-shift', buffered:true});
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
    const t=window.__timing;if(!t)return;const now=performance.now()-t.start;
    if(t.acknowledgement===null && document.documentElement.dataset.streaming==='yes') t.acknowledgement=now;
    const turns=document.querySelectorAll('#agent article');
    if(t.firstContent===null && turns.length>t.previousTurns && turns[turns.length-1]?.textContent.includes('Controlled response for interface verification.')) t.firstContent=now;
    if(t.firstContent!==null && t.complete===null && document.documentElement.dataset.streaming==='no') t.complete=now;
  }).observe(document.documentElement, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-streaming']}));
})();"""


def install(context, state):
    context.add_init_script(INIT)
    def agent(route):
        if '/demo' in route.request.url:
            route.fulfill(json={"question":"Controlled interface check", "answer":ANSWER, "sources":[], "timings":{"route":1,"retrieve":2,"answer":3}, "total":6, "usage":None, "provider":None, "trace":None, "listPrice":None, "ranAt":int(time.time()*1000)})
            return
        state['questions'].append(unquote(urlparse(route.request.url).query.split('q=',1)[-1].split('&',1)[0]))
        if state.get('error'):
            route.fulfill(status=200, content_type='text/event-stream', body='data: {broken\n\n')
            return
        time.sleep(0.12)
        events=[{"type":"route","route":"answer","ms":1},{"type":"sources","titles":[],"ms":2},{"type":"token","text":ANSWER},{"type":"done","total":120,"usage":None,"provider":None,"trace":None}]
        route.fulfill(status=200, content_type='text/event-stream', body=''.join('data: '+json.dumps(e)+'\n\n' for e in events))
    context.route('**/api/agent/**', agent)
    context.route('**/api/track', lambda route: route.fulfill(status=204))
    context.route('**/api/rum', lambda route: route.fulfill(status=204))


def ask(page, question):
    field=page.locator('#ask')
    field.scroll_into_view_if_needed()
    field.fill(question)
    before=page.locator('#agent article').count()
    field.press('Enter')
    expect(page.locator('#agent article')).to_have_count(before+1)
    expect(page.locator('#agent article').last).to_contain_text(ANSWER)
    page.wait_for_function("document.documentElement.dataset.streaming==='no'")
    page.wait_for_function('window.__timing?.complete !== null')
    return page.evaluate('window.__timing')


def test_journey(browser, label, dest, width, motion, out):
    context=browser.new_context(viewport={"width":width,"height":844 if width<700 else 1000}, reduced_motion=motion, has_touch=width<700)
    state={'questions':[]}
    install(context,state)
    page=context.new_page();page.set_default_timeout(7000)
    phases=[];timing=None
    try:
        page.goto(ORIGIN,wait_until='load')
        nav=page.get_by_role('navigation',name='Find what you need',exact=True)
        expect(nav.locator('a')).to_have_count(4)
        visible=[l for l in nav.get_by_role('link').all() if l.is_visible()]
        assert len(visible)==(4 if width<700 else 3), len(visible)
        for link in visible:
            box=link.bounding_box();assert box['width']>=44 and box['height']>=44, box
        if label=='Recruiter':page.screenshot(path=str(out/f'hero-{width}-{motion}.png'))
        phases.append('orient')
        nav.get_by_role('link').filter(has_text=label).first.click()
        expect(page).to_have_url(ORIGIN+'/#'+dest)
        region=page.locator('#'+dest)
        expect(region).to_be_visible()
        assert region.inner_text().strip(), 'Empty destination'
        phases.append('verify')
        if label=='Referrer':
            field=page.get_by_role('textbox',name='An introduction to forward')
            expect(field).to_be_visible()
            introduction=field.input_value()
            assert 'Certified:' in introduction and '?mode=condensed' in introduction and len(introduction.splitlines())==4, introduction
            page.get_by_role('button',name='Copy introduction',exact=True).click()
            expect(page.locator('#contact [role="status"]')).to_contain_text('Introduction copied')
            assert page.evaluate('window.__clipboard')==introduction
            page.evaluate('window.__denyCopy=true')
            page.get_by_role('button',name='Copy introduction',exact=True).click()
            expect(page.locator('#contact [role="status"]')).to_contain_text('Copy unavailable')
            page.evaluate('window.__denyCopy=false')
        elif label=='Interviewer':
            detail=region.locator('details').first
            if detail.count():
                detail.locator('summary').first.press('Enter')
                expect(detail).to_have_attribute('open','')
        elif label=='Recruiter':
            expect(region).to_contain_text('Research Assistant (Lead Backend Engineer)')
            expect(region).to_contain_text('Research Assistant (AI Engineer)')
            assert region.locator('details').count()>0, 'Missing ownership detail'
            detail=region.locator('details').first
            detail.locator('summary').first.press('Enter')
            expect(detail).to_have_attribute('open','')
        else:
            assert region.locator('a[href^="https://"]').count()>0, 'Missing inspectable evidence'
        phases.append('explore')
        if label=='Recruiter':
            response=context.request.get(ORIGIN+'/kushal-gaddamwar-resume.pdf')
            assert response.ok and 'pdf' in response.headers.get('content-type','')
            phases.append('act')
            page.goto(ORIGIN+'/?r=acme#contact',wait_until='load')
            page.get_by_text('More ways to reach him',exact=True).click()
            page.get_by_role('button',name='Copy the email draft',exact=False).click()
            expect(page.locator('#contact [role="status"]')).to_contain_text('Email draft copied')
            copied=page.evaluate('window.__clipboard')
            assert 'Subject: Interview:' in copied and '(via acme)' in copied and '[two times]' in copied, copied
        elif label=='Interviewer':
            page.locator('#ask').scroll_into_view_if_needed()
            timing=ask(page,'  Explain the technical decisions.  ')
            assert state['questions'][-1]=='Explain the technical decisions.'
            phases.append('act')
            state['error']=True
            ask_field=page.locator('#ask');ask_field.fill('Keep this question after an error.');ask_field.press('Enter')
            expect(page.locator('#ask-feedback')).to_contain_text('could not finish')
            expect(ask_field).to_have_value('Keep this question after an error.')
            state['error']=False
            ask_field.fill('Use my edited question on retry.')
            page.get_by_role('button',name='Retry question',exact=True).click()
            expect(page.locator('#agent article').last).to_contain_text(ANSWER)
            assert state['questions'][-1]=='Use my edited question on retry.'
        else:
            page.locator('#ask').scroll_into_view_if_needed()
            timing=ask(page,'Explain delivery ownership.')
            phases.append('act')
            page.evaluate('window.__hold=true')
            field=page.locator('#ask');field.fill('Keep this after stopping.');field.press('Enter');expect(field).to_be_disabled()
            page.get_by_role('button',name='Stop',exact=True).click()
            expect(page.locator('#ask-feedback')).to_contain_text('Stopped.')
            expect(field).to_have_value('Keep this after stopping.')
            expect(page.locator('#agent article').last).to_contain_text('Stopped before an answer arrived.')
        phases.append('recover')
        assert len(phases)==5
        screenshot=out/f'{label.lower().replace(" ","-")}-{width}-{motion}.png'
        page.screenshot(path=str(screenshot))
        return {'journey':label,'width':width,'motion':motion,'phases':phases,'pass':True,'timing':timing,'recovery_timing':page.evaluate('window.__timing'),'cls':page.evaluate('window.__cls'),'shifts':page.evaluate('window.__shifts'),'screenshot':str(screenshot.relative_to(ROOT))}
    except Exception as exc:
        page.screenshot(path=str(out/f'FAIL-{label}-{width}-{motion}.png'))
        return {'journey':label,'width':width,'motion':motion,'phases':phases,'pass':False,'error':str(exc)[:1500]}
    finally:
        context.close()


def edge_cases(browser):
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    state={'questions':[]};install(context,state)
    page=context.new_page();page.set_default_timeout(7000);page.goto(ORIGIN,wait_until='load')
    field=page.locator('#ask');field.scroll_into_view_if_needed()
    field.fill('   ');field.press('Enter')
    expect(page.locator('#ask-feedback')).to_contain_text('Type a question')
    expect(field).to_have_value('   ')
    assert not state['questions']
    field.fill('Explain the work.');field.press('Shift+Enter');expect(field).to_have_value('Explain the work.\n')
    field.evaluate("el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true}))")
    assert not state['questions'], 'IME composition submitted'
    field.evaluate("el=>{el.value='x'.repeat(2001);el.form.requestSubmit()}")
    expect(page.locator('#ask-feedback')).to_contain_text('2,000')
    assert len(field.input_value())==2001 and not state['questions']
    field.fill('Existing draft')
    field.evaluate("el=>{const data=new DataTransfer();data.setData('text','x'.repeat(2001));el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))}")
    expect(field).to_have_value('Existing draft')
    expect(page.locator('#ask-feedback')).to_contain_text('unchanged')
    page.evaluate('window.__hold=true')
    field.fill('First question');field.press('Enter');expect(field).to_be_disabled()
    challenge=page.get_by_role('button',name='Try to break it',exact=False)
    expect(challenge).to_be_visible();expect(challenge).to_be_disabled()
    challenge_height=challenge.bounding_box()['height']
    field.evaluate("el=>{el.value='Second draft';el.form.requestSubmit()}")
    expect(field).to_have_value('Second draft')
    page.get_by_role('button',name='Stop',exact=True).click()
    expect(field).to_have_value('Second draft')
    expect(challenge).to_be_enabled()
    assert challenge.bounding_box()['height']==challenge_height, 'Challenge control resized after Stop'
    page.evaluate('window.__hold=false')
    page.get_by_role('button',name='Retry question',exact=True).click()
    expect(page.locator('#agent article').last).to_contain_text(ANSWER)
    assert state['questions'][-1]=='Second draft'
    # Keyboard entry and native fragment history remain usable.
    page.goto(ORIGIN,wait_until='load')
    link=page.get_by_role('navigation',name='Find what you need',exact=True).get_by_role('link').filter(has_text='Recruiter').first
    link.focus();link.press('Enter');expect(page).to_have_url(ORIGIN+'/#work')
    expect(page.locator('#work')).to_be_focused()
    sections=page.locator('details[class*="SectionRail"]')
    expect(sections.locator('a[href="#work"]')).to_have_attribute('aria-current','location')
    sections.locator('summary').press('Enter')
    expect(sections).to_have_attribute('open','')
    page.go_back();expect(page).to_have_url(ORIGIN+'/')
    page.locator('header#top a[href="#top"]').click()
    expect(sections.locator('[aria-current]')).to_have_count(0)
    context.close()
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    install(context,{'questions':[]});page=context.new_page();page.goto(ORIGIN,wait_until='load')
    cards=page.locator('#proof [data-issuer]')
    for issuer in ('NVIDIA','Anthropic'):
        card=page.locator(f'#proof [data-issuer="{issuer}"]')
        expect(card.get_by_role('link',name=f'Verify {issuer} credential on Credly:',exact=False)).to_be_visible()
        card.scroll_into_view_if_needed()
    widths=cards.evaluate_all('(els)=>els.map(el=>getComputedStyle(el).borderTopWidth)')
    assert len(set(widths))==1,'Credential frame widths differ'
    colors=cards.evaluate_all('(els)=>els.map(el=>getComputedStyle(el).borderTopColor)')
    assert len(set(colors))==1,'Credential frames differ'
    expect(page.locator('#education')).to_contain_text('classification and regression trees')
    expect(page.locator('#approach')).not_to_contain_text('does not present himself as an ML engineer')
    score=page.locator('#education p').filter(has_text='GRE 334/340').first
    assert score.evaluate('(el)=>!el.closest("a")'),'GRE linked as proof'
    page.get_by_text('More ways to reach him',exact=True).click()
    linkedin=page.locator('#contact a[href*="linkedin.com"]')
    # Exercise copy feedback without opening an external profile.
    linkedin.evaluate("el=>el.addEventListener('click',e=>e.preventDefault(),{once:true})")
    linkedin.click()
    expect(page.locator('#contact [role="status"]')).to_contain_text('LinkedIn note copied.')
    assert page.evaluate('window.__clipboard').strip(), 'Empty LinkedIn note copied'
    page.evaluate('window.__denyCopy=true')
    linkedin.evaluate("el=>el.addEventListener('click',e=>e.preventDefault(),{once:true})")
    linkedin.click()
    expect(page.locator('#contact [role="status"]')).to_contain_text('Copy unavailable')
    expect(page.get_by_role('textbox',name='LinkedIn opening note',exact=True)).to_be_visible()
    context.close()
    # 720 CSS pixels models the reflow of a 1440px window at 200% zoom.
    context=browser.new_context(viewport={'width':720,'height':500},device_scale_factor=2,reduced_motion='reduce')
    install(context,{'questions':[]});page=context.new_page();page.goto(ORIGIN,wait_until='load')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), '200% equivalent reflow overflows'
    for link in page.get_by_role('navigation',name='Find what you need',exact=True).get_by_role('link').all():
        expect(link).to_be_visible()
    trigger=page.locator('header#top a[href="#top"]');trigger.focus()
    page.keyboard.press('Meta+k')
    palette=page.get_by_role('dialog',name='Command palette')
    expect(palette).to_be_visible()
    for label,_ in JOURNEYS:expect(palette.get_by_role('button').filter(has_text=label+':')).to_have_count(1)
    page.keyboard.press('Escape');expect(palette).to_have_count(0);expect(trigger).to_be_focused()
    page.locator('#contact').scroll_into_view_if_needed()
    dock=page.locator('[class*="ReachDock"][data-print="hide"]')
    expect(dock).to_have_attribute('inert','')
    dock.locator('a').first.evaluate('(el)=>el.focus()')
    assert not dock.evaluate('(el)=>el.contains(document.activeElement)'), 'Hidden dock accepts focus'
    page.locator('#work').scroll_into_view_if_needed()
    expect(dock).not_to_have_attribute('inert','')
    context.close()
    context=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
    page=context.new_page();page.goto(ORIGIN,wait_until='load')
    expect(page.get_by_role('navigation',name='Find what you need',exact=True).get_by_role('link')).to_have_count(4)
    page.get_by_text('More ways to reach him',exact=True).click()
    expect(page.get_by_role('textbox',name='An introduction to forward')).to_be_visible()
    expect(page.locator('noscript p')).to_contain_text('Interactive answers need JavaScript.')
    expect(page.locator('noscript p')).to_be_visible()
    context.close()
    return 'blank, trim, multiline, IME, length, paste refusal, pending preservation, Stop, edited retry, keyboard, history, section state, palette parity/focus return, hidden-dock focus, stable pending control, LinkedIn copy/denial/manual fallback, 200% equivalent reflow, no-JavaScript'


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--baseline',action='store_true');args=ap.parse_args()
    build=(ROOT/'.next/BUILD_ID').read_text().strip()
    out=EVIDENCE/'shots'/build/'journeys';out.mkdir(parents=True,exist_ok=True)
    report={'build':build,'origin':ORIGIN,'recorded_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'response':'controlled fixture; no provider calls','runs':[]}
    import subprocess
    report['commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    import hashlib
    report['tracked_diff_sha256']=hashlib.sha256(subprocess.check_output(['git','diff','HEAD','--','.',':!content/audit.json'],cwd=ROOT)).hexdigest()
    source=hashlib.sha256()
    paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT).decode().split('\0')
    for name in sorted(set(paths)):
        path=ROOT/name
        if name and path.is_file() and not name.startswith('docs/') and name!='content/audit.json':
            source.update(name.encode()+b'\0'+path.read_bytes())
    report['source_sha256']=source.hexdigest()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome')
        if args.baseline:
            context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');state={'questions':[]};install(context,state)
            page=context.new_page();page.goto(ORIGIN,wait_until='load');report['timing']=ask(page,'Controlled baseline question.');report['cls']=page.evaluate('window.__cls');context.close()
        else:
            for width in (390,1440):
                for motion in ('reduce','no-preference'):
                    for label,dest in JOURNEYS:
                        if label in PHONE_ONLY and width>=700: continue
                        result=test_journey(browser,label,dest,width,motion,out);report['runs'].append(result)
                        print(('PASS' if result['pass'] else 'FAIL'),label,width,motion,result.get('error','')[:150],flush=True)
            try:report['edge_cases']=edge_cases(browser)
            except Exception as exc:
                import traceback
                report['edge_error']=traceback.format_exc()
            report['principal_targets']=[]
            for width in (320,360,390,768,820,1280,1440,1920):
                context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce',has_touch=width<900)
                install(context,{'questions':[]});page=context.new_page();page.goto(ORIGIN,wait_until='load')
                page.evaluate('document.fonts.ready')
                controls=page.locator('nav[aria-label="Find what you need"] a, a[href="#ask"], a[href$="resume.pdf"]:not([class*="source"]):not(.prose a), #ask, #agent form button, #contact-forward button, #contact a[class*="Reach-module"][class*="item"], #contact a[class*="Reach-module"][class*="primary"], nav[aria-label="Sections"] a')
                problems=[];checked=0
                for control in controls.all():
                    if not control.is_visible() or control.evaluate('(el)=>!!el.closest("[inert]")'):continue
                    box=control.bounding_box();checked+=1
                    if box['width']<44 or box['height']<44:problems.append({'label':control.inner_text()[:60],'box':box})
                if page.evaluate('document.documentElement.scrollWidth>innerWidth'):problems.append({'overflow':True})
                report['principal_targets'].append({'width':width,'checked':checked,'failures':problems})
                context.close()
        browser.close()
    name='ux-baseline-journeys.json' if args.baseline else 'ux-journeys.json'
    (EVIDENCE/name).write_text(json.dumps(report,indent=2)+'\n')
    failed=sum(not row['pass'] for row in report['runs'])+int('edge_error' in report)+sum(len(row['failures']) for row in report.get('principal_targets',[]))
    print(f'{len(report["runs"])} journeys, {failed} failures; .claude/ux-evidence/{name}',flush=True)
    raise SystemExit(bool(failed))


if __name__=='__main__':main()
