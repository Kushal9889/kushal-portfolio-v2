"""Offline Venom lifecycle checks; no mail activation or provider calls."""
import importlib.util, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui', ROOT / 'scripts/ui-agent-screen.py')
ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)
out = ROOT / 'docs/companion-shots'
checks, details, errors = {}, {}, []
draw_counter = """(() => { const p = WebGL2RenderingContext.prototype, original = p.drawArrays;
  window.__venomDraws = 0; p.drawArrays = function(...args) { window.__venomDraws++; return original.apply(this, args); }; })();"""
no_gl = """(() => { const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); }; })();"""
try:
    with sync_playwright() as p:
        browser = ui.launch(p)
        standalone = browser.new_context(viewport={'width':390,'height':844})
        ui.install_offline(standalone)
        direct = standalone.new_page()
        direct.goto(ui.ORIGIN+'/venom/cta.html', wait_until='domcontentloaded', timeout=15000)
        checks['direct_resource_has_visible_guidance'] = direct.locator('#standalone-help').is_visible()
        checks['direct_resource_links_to_portfolio'] = direct.get_by_role('link',name='Open the portfolio →',exact=True).get_attribute('href') == '/#top'
        checks['direct_resource_links_to_agent'] = direct.get_by_role('link',name='Open the interactive agent →',exact=True).get_attribute('href') == '/#agent'
        checks['direct_resource_does_not_start_renderer'] = direct.evaluate("typeof window.VenomButton === 'undefined'")
        standalone.close()
        for label, init in [('draw', draw_counter), ('no_gl', no_gl)]:
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='no-preference')
            ctx.add_init_script(init); ui.install_offline(ctx)
            if label == 'no_gl':
                def force_no_gl(route):
                    response = route.fetch()
                    body = response.text()
                    needle = "const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });"
                    if body.count(needle) != 1:
                        raise RuntimeError('WebGL setup did not match the expected fixture')
                    route.fulfill(response=response, body=body.replace(needle, 'const gl = null;'))
                ctx.route('**/venom/cta.html', force_no_gl)
            page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_default_navigation_timeout(15000)
            page.goto(ui.ORIGIN, wait_until='domcontentloaded')
            page.wait_for_selector('[data-venom-surface][data-listening]')
            link = page.locator('#top a[data-email-draft]'); surface = link.locator('[data-venom-surface]')
            href, name = link.get_attribute('href'), link.inner_text().strip()
            box = link.bounding_box()
            page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
            if label == 'draw':
                page.wait_for_function("document.querySelector('[data-venom-surface]')?.dataset.ready==='true'", timeout=10000)
                frame = page.frames[-1]
                checks['embedded_guidance_stays_hidden'] = frame.locator('#standalone-help').get_attribute('hidden') is not None
                frame.wait_for_function('window.__venomDraws > 0', timeout=10000)
                details['draws_active'] = frame.evaluate('window.__venomDraws')
                checks['actual_draw'] = details['draws_active'] > 0
                page.screenshot(path=str(out / 'venom-lifecycle-active.png'))
                page.wait_for_timeout(1500)
                before = frame.evaluate('window.__venomDraws')
                page.wait_for_timeout(400)
                after = frame.evaluate('window.__venomDraws')
                details['idle_draws_before_after'] = [before, after]
                checks['idle_stops_draw'] = before == after and surface.get_attribute('data-active') is None
                page.emulate_media(reduced_motion='reduce')
                checks['reduced_motion_hidden'] = not surface.is_visible()
                page.screenshot(path=str(out / 'venom-lifecycle-reduced.png'))
            else:
                page.wait_for_timeout(1800)
                link.focus()
                checks['no_gl_native_href'] = bool(href and href.startswith('mailto:'))
                checks['no_gl_native_label'] = 'Email him' in name
                checks['no_gl_native_focus'] = link.evaluate('e => document.activeElement === e')
                checks['no_gl_forced'] = page.frames[-1].locator('body.no-gl').count() == 1
                checks['no_gl_no_ready'] = surface.get_attribute('data-ready') is None
                checks['no_gl_hidden'] = surface.evaluate("e=>getComputedStyle(e).opacity==='0'")
                page.screenshot(path=str(out / 'venom-lifecycle-no-gl.png'))
            ctx.close()
        browser.close()
except Exception as error:
    errors.append(f'{type(error).__name__}: {error}')
checks['no_page_errors'] = not errors
result = {'checks': checks, 'details': details, 'errors': errors, 'scope': 'Offline provider-disabled preview; WebGL draw calls, not visual quality or real mail activation.'}
(out / 'venom-lifecycle.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(0 if checks and all(checks.values()) and not errors else 1)
