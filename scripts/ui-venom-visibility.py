"""Compare the real host CTA before and during bundled Venom rendering offline."""
import importlib.util, json, time
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui', ROOT/'scripts/ui-agent-screen.py')
ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)
out = ROOT/'docs/companion-shots'
checks, details, errors = {}, {}, []
try:
    with sync_playwright() as p:
        browser = ui.launch(p)
        ctx = browser.new_context(viewport={'width':1440,'height':900}, reduced_motion='no-preference')
        ctx.add_init_script("""(() => {const p=WebGL2RenderingContext.prototype, original=p.drawArrays; window.__draws=0; p.drawArrays=function(...args){window.__draws++;return original.apply(this,args)};})();""")
        ui.install_offline(ctx)
        page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        console = []; page.on('console', lambda msg: console.append({'type':msg.type,'text':msg.text[:500]}) if msg.type in ('warning','error') and len(console)<20 else None)
        page.goto(ui.ORIGIN, wait_until='domcontentloaded', timeout=15000)
        page.wait_for_selector('[data-venom-surface][data-listening]', timeout=15000)
        link = page.locator('#top a[data-email-draft]'); surface = link.locator('[data-venom-surface]')
        box = link.bounding_box(); x=box['x']+box['width']/2; y=box['y']+box['height']/2
        page.mouse.move(x,y)
        page.wait_for_function("document.querySelector('[data-venom-surface]')?.dataset.ready==='true'", timeout=15000)
        page.wait_for_timeout(1600)
        before = out/'venom-visibility-before.png'; active = out/'venom-visibility-active.png'
        link.screenshot(path=str(before), animations='disabled')
        start = time.monotonic()
        samples = []
        before_img = Image.open(before).convert('RGB')
        for attempt in range(3):
            for i in range(8):
                page.mouse.move(x + (i%2)*18 - 9, y + (i%3)*4 - 4)
                page.wait_for_timeout(100)
            page.mouse.move(x+5,y)
            sample = out / f'venom-visibility-active-{attempt+1}.png'
            link.screenshot(path=str(sample), animations='disabled', timeout=6000)
            image = Image.open(sample).convert('RGB')
            pixels = list(ImageChops.difference(before_img, image).getdata())
            samples.append({'elapsed_seconds': round(time.monotonic()-start, 3), 'changed_pixels_over_16': sum(max(rgb)>16 for rgb in pixels), 'total_pixels': len(pixels)})
        active.write_bytes((out/'venom-visibility-active-3.png').read_bytes())
        details['samples'] = samples
        frame = page.frames[-1]
        state = '''() => {const c=document.querySelector('#stage'), gl=c?.getContext('webgl2'), d=window.VenomButton?._debug;
          return {innerWidth,innerHeight,hidden:document.hidden,canvasRect:c?.getBoundingClientRect().toJSON(),canvasWidth:c?.width,canvasHeight:c?.height,
            glError:gl?.getError(),drawingBufferWidth:gl?.drawingBufferWidth,drawingBufferHeight:gl?.drawingBufferHeight,draws:window.__draws,
            btn:d?.btn,cur:d?.cur,hand:d?.hand ? {ready:d.hand.ready,on:d.hand.on,m:d.hand.m} : null};}'''
        details['frame_state'] = frame.evaluate(state)
        details['host_geometry'] = page.evaluate("() => ({width:innerWidth,height:innerHeight,scrollX,scrollY})")
        details['last_pointer'] = {'x': x+5, 'y': y}
        details['console_warnings_errors'] = console
        details['surface'] = surface.evaluate("e=>({opacity:getComputedStyle(e).opacity,rect:e.getBoundingClientRect().toJSON(),active:e.dataset.active,ready:e.dataset.ready})")
        details['anchor'] = link.bounding_box()
        state_before = details['frame_state']
        checks['canvas_backing_matches_viewport'] = state_before['canvasWidth'] > 1 and state_before['canvasHeight'] > 1 and state_before['drawingBufferWidth'] > 1 and state_before['drawingBufferHeight'] > 1
        checks['button_center_matches_viewport'] = abs(state_before['btn']['cx'] - state_before['innerWidth']/2) < 1 and abs(state_before['btn']['cy'] - state_before['innerHeight']/2) < 1
        checks['ready_and_active'] = details['surface']['ready']=='true' and details['surface']['active']=='true'
        checks['opacity_visible'] = float(details['surface']['opacity']) > .99
        r=details['surface']['rect']; a=details['anchor']
        checks['surface_matches_anchor'] = abs(r['width']-a['width'])<1 and abs(r['height']-a['height'])<1
        checks['pixels_changed'] = any(sample['changed_pixels_over_16'] > 0 for sample in samples)
        checks['native_mailto'] = link.get_attribute('href').startswith('mailto:')
        checks['no_page_errors'] = not errors
        ctx.close(); browser.close()
except Exception as error:
    errors.append(f'{type(error).__name__}: {error}')
result={'checks':checks,'details':details,'errors':errors,'scope':'Offline host CTA captures; pixel change alone does not establish quality or legibility.'}
(out/'venom-visibility.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
raise SystemExit(0 if len(checks)==8 and all(checks.values()) and not errors else 1)
