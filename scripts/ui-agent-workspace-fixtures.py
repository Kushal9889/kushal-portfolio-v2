"""Offline UI states: missing evidence, long/untrusted text, drafts and storage.

Uses the existing provider-disabled UI gate's preflight and Chrome launcher.
All answers in this file are explicitly synthetic browser fixtures.
"""
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("agent_screen", HERE / "ui-agent-screen.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
ROOT = HERE.parent
OUT = ROOT / "docs/agent-workspace-shots/2026-10-27/fixtures.json"
results = {}
axe_details = {}


def check(name, value):
    results[name] = bool(value)


def check_panels(page, label):
    axe = ROOT.parent / "node_modules/axe-core/axe.min.js"
    if not page.evaluate("typeof axe !== 'undefined'"):
        page.add_script_tag(path=str(axe))
    for theme in ('dark', 'light'):
        page.evaluate("theme=>document.documentElement.dataset.theme=theme", theme)
        result = page.evaluate("""async () => { const r = await axe.run('#agent', {runOnly:{type:'rule',values:['button-name','link-name','nested-interactive','aria-valid-attr-value','aria-roles','aria-required-attr','color-contrast']}}); return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})); }""")
        axe_details[label+'_'+theme] = result
        check('axe_'+label+'_'+theme, not result)
    page.evaluate("document.documentElement.dataset.theme='dark'")


def saved(answer="A fixture statement.", **extra):
    return {"question": "A synthetic UI question", "result": {
        "answer": answer, "sources": [], "route": "answer", "total": 4,
        "timings": {}, "steps": [{"name": "retrieve", "state": "done", "ms": 1, "detail": "Synthetic fixture"}],
        **extra,
    }}


def open_seed(browser, seed, width=1024, blocked=False):
    ctx = browser.new_context(viewport={"width": width, "height": 844}, reduced_motion="reduce")
    ui.install_offline(ctx)
    page = ctx.new_page()
    if blocked:
        page.add_init_script("Object.defineProperty(window,'sessionStorage',{get(){throw new Error('fixture storage refusal')}})")
    else:
        page.add_init_script("sessionStorage.setItem('agent:thread:v1', " + json.dumps(json.dumps(seed)) + ")")
    page.goto(ui.ORIGIN + "/", wait_until="load")
    page.locator('#agent [aria-label="Open full screen"]').click()
    return ctx, page


with sync_playwright() as p:
    browser = ui.launch(p)
    title = "Long source title " * 20
    passage = "Reach fixture@example.com. <img src=x onerror=window.injected=true> A synthetic passage."
    fixture = saved(answer="A fixture statement. A second fixture statement.", sources=[title], policy="Synthetic policy text. " * 150, citations=[{"sentence": sentence, "source": title, "n": 1, "text": passage} for sentence in ("A fixture statement.", "A second fixture statement.")])
    ctx, page = open_seed(browser, [fixture])
    page.locator('#agent-tab-sources').click()
    check_panels(page, 'sources')
    quoted = page.locator('#agent blockquote')
    check("synthetic_email_redacted", "fixture@example.com" not in quoted.text_content())
    check("passage_markup_is_text", page.locator('#agent blockquote img').count() == 0)
    check("long_source_does_not_overflow", page.locator('#agent').evaluate("e=>e.scrollWidth<=e.clientWidth+1"))
    page.locator('#agent-tab-trace').click()
    check("unknown_origin_labeled", page.locator('#agent [data-origin]').get_attribute('data-origin') == 'unknown')
    advanced = page.locator('#agent [class*="advancedTrace"]')
    advanced.locator('summary').first.click()
    page.locator('#agent section[aria-label="System prompt"] button').click()
    check('policy_uses_inspector_scroll', page.locator('#agent pre[class*="policy"]').evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
    check_panels(page, 'trace')
    page.locator('#agent-tab-answer').click()
    page.locator('#agent article sup button').nth(1).click()
    page.get_by_role('button', name='Back to answer', exact=True).click()
    page.wait_for_timeout(150)
    check('repeated_citation_returns_exact_sentence', page.locator('#agent article sup button').nth(1).evaluate('e=>e===document.activeElement'))
    page.locator('#ask').fill('Preserve this draft')
    page.get_by_role('button', name='Edit', exact=True).click()
    page.get_by_role('button', name='Cancel edit', exact=True).click()
    check('cancel_edit_restores_unsent_draft', page.locator('#ask').input_value() == 'Preserve this draft')
    rejected = page.locator('#ask').evaluate("""el => { const data = new DataTransfer(); data.setData('text/plain','x'.repeat(2001)); return !el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})); }""")
    check('over_limit_paste_preserves_draft', rejected and page.locator('#ask').input_value() == 'Preserve this draft')
    check('paste_error_is_actionable', '2,000' in page.locator('#ask-feedback').text_content())
    pending = []
    page.route('**/api/agent/stream?*', lambda route: pending.append(route))
    page.get_by_role('button', name='Experience', exact=True).click()
    page.wait_for_selector('#agent[data-state="busy"]')
    page.locator('#ask').fill('A draft kept while the fixture answer arrives')
    page.wait_for_timeout(100)
    check("draft_editable_while_pending", page.locator('#ask').input_value().startswith('A draft kept'))
    check("topic_asks_generic_question", bool(pending) and 'experience' in pending[0].request.url.lower())
    pending[0].fulfill(status=200, content_type='text/event-stream', body='\n\n'.join([
        'data: ' + json.dumps({"type": "route", "route": "answer", "ms": 0}),
        'data: ' + json.dumps({"type": "token", "text": "A synthetic local answer."}),
        'data: ' + json.dumps({"type": "done", "total": 5, "usage": None}),
    ]) + '\n\n')
    page.wait_for_function("!document.querySelector('#agent[data-state=busy]')")
    check("draft_survives_completion", page.locator('#ask').input_value() == 'A draft kept while the fixture answer arrives')
    check("completion_does_not_steal_draft_focus", page.locator('#ask').evaluate('e=>e===document.activeElement'))
    check("reduced_motion_has_no_slide", page.locator('#agent').evaluate("e=>getComputedStyle(e).transform==='none'"))
    for label, word in [('AI projects','ai projects'),('Certifications','certifications'),('Research','research'),('Open source','open source'),('Engineering','engineering')]:
        pending.clear()
        page.get_by_role('button', name=label, exact=True).click()
        page.wait_for_selector('#agent[data-state="busy"]')
        page.wait_for_timeout(100)
        from urllib.parse import parse_qs, urlsplit
        question = parse_qs(urlsplit(pending[0].request.url).query).get('q',[''])[0]
        check('topic_' + word.replace(' ','_'), word in question.lower())
        pending[0].fulfill(status=200,content_type='text/event-stream',body='data: '+json.dumps({'type':'token','text':'Synthetic topic answer.'})+'\n\ndata: '+json.dumps({'type':'done','total':5,'usage':None})+'\n\n')
        page.wait_for_function("!document.querySelector('#agent[data-state=busy]')")
    # Browser viewport change is an emulation check, not proof of the iOS keyboard.
    page.set_viewport_size({"width": 1024, "height": 560})
    check("resized_composer_visible", page.locator('#agent form').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight'))
    ctx.close()

    ctx, page = open_seed(browser, [saved()], width=390)
    page.locator('#agent [aria-label="How this answer was produced"] button').first.click()
    page.locator('#agent-sheet-tab-sources').click()
    check("missing_evidence_is_explicit", 'No matched passage' in page.locator('#agent-sheet-panel').inner_text())
    page.locator('#agent-sheet-tab-trace').click()
    check("phone_tabs_have_one_stop", page.locator('#agent [role=tab][tabindex="0"]').count() == 1)
    check_panels(page, 'phone_trace')
    page.keyboard.press('Escape')
    page.set_viewport_size({'width':390,'height':500})
    page.wait_for_timeout(150)
    check('phone_keyboard_resize_emulation', page.locator('#agent form').evaluate('e=>e.getBoundingClientRect().bottom<=innerHeight'))
    ctx.close()

    ctx, page = open_seed(browser, [saved(degraded=True)])
    check("fallback_explained", page.locator('#agent [data-tone=warn]').count() > 0)
    check("fallback_retry_operable", page.get_by_role('button', name='Retry', exact=True).is_enabled())
    ctx.close()

    ctx, page = open_seed(browser, [{"question": 7, "result": None}, saved()])
    page.wait_for_function("document.querySelectorAll('#agent ol[aria-label=\"Conversation\"] > li').length === 1")
    check("malformed_turn_ignored", page.locator('#agent ol[aria-label="Conversation"] > li').count() == 1)
    ctx.close()

    ctx, page = open_seed(browser, [saved(warm=True, provider='synthetic'), saved(local=True, provider='synthetic')])
    page.locator('#agent-tab-trace').click()
    check('tab_origin_explicit', page.locator('#agent [data-origin]').get_attribute('data-origin') == 'tab')
    page.locator('#agent-question-picker').select_option('0')
    page.locator('#agent-tab-trace').click()
    check('build_origin_explicit', page.locator('#agent [data-origin]').get_attribute('data-origin') == 'build')
    ctx.close()

    actions = [saved(action={'ok':True,'kind':'draft','subject':subject,'body':subject+' body','mailto':'mailto:fixture@example.invalid?subject='+subject}) for subject in ('First','Second')]
    ctx, page = open_seed(browser, actions)
    articles = page.locator('#agent ol[aria-label="Conversation"] article')
    check('tool_outcomes_pair_with_turns', 'First body' in articles.nth(0).inner_text() and 'Second body' in articles.nth(1).inner_text())
    ctx.close()

    ctx, page = open_seed(browser, [], blocked=True)
    check("blocked_storage_remains_usable", page.locator('#ask').is_editable())
    page.get_by_role('button', name='Close full screen', exact=True).click()
    page.wait_for_timeout(150)
    check('focus_restored_to_opener', page.evaluate("document.activeElement?.getAttribute('aria-label')==='Open full screen'"))
    ctx.close()
    browser.close()

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"synthetic": True, "checks": results, "axe": axe_details}, indent=2))
for name, passed in results.items():
    print(("PASS " if passed else "FAIL ") + name)
raise SystemExit(0 if all(results.values()) else 1)
