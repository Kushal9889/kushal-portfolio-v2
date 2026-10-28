"""Read-only offline recruiter-demo checks; never activates links or submits questions."""
import importlib.util, json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui', ROOT / 'scripts/ui-agent-screen.py')
ui = importlib.util.module_from_spec(spec); spec.loader.exec_module(ui)
checks, details, errors, external = {}, {}, [], []
try:
    with sync_playwright() as p:
        browser = ui.launch(p)
        for width, height in [(360, 800), (1440, 900)]:
            ctx = browser.new_context(viewport={'width': width, 'height': height})
            def guard(route):
                url = route.request.url
                parts = urlsplit(url)
                if parts.scheme in ('http', 'https') and parts.hostname not in ('localhost', '127.0.0.1'):
                    external.append(url); route.abort()
                else:
                    route.continue_()
            ctx.route('**/*', guard)
            ui.install_offline(ctx)
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(ui.ORIGIN, wait_until='domcontentloaded', timeout=15000)
            page.wait_for_selector('[data-venom-surface][data-listening]', timeout=15000)
            key = str(width)
            snapshot = page.evaluate('''() => {
              const visible = e => !!e && e.checkVisibility() && !e.closest('[inert], [hidden], dialog:not([open])');
              const first = e => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
              const hero = document.querySelector('#top');
              const email = hero?.querySelector('a[data-email-draft]');
              const resume = [...(hero?.querySelectorAll('a[href]') || [])].find(a => /r[eé]sum[eé]/i.test(a.textContent || ''));
              const links = [...document.querySelectorAll('a[href]')].filter(visible);
              return { h1: [...document.querySelectorAll('h1')].filter(visible).map(e => e.innerText.trim()),
                identity: [...(hero?.querySelectorAll('a,span,p') || [])].some(e => visible(e) && /kushal/i.test(e.innerText || '')),
                email: first(email) && email.href.startsWith('mailto:'), resume: first(resume) && !!resume.getAttribute('href'),
                github: links.some(a => /^https?:\\/\\/(www\\.)?github\\.com\\//i.test(a.href)),
                agent: visible(document.querySelector('#agent')),
                overflow: document.documentElement.scrollWidth - innerWidth,
                title: document.title, description: document.querySelector('meta[name="description"]')?.content || '' };
            }''')
            details[key] = snapshot
            checks[key + '_one_visible_h1'] = len(snapshot['h1']) == 1
            checks[key + '_visible_identity'] = snapshot['identity']
            checks[key + '_hero_email_first_screen'] = snapshot['email']
            checks[key + '_hero_resume_first_screen'] = snapshot['resume']
            checks[key + '_github_link'] = snapshot['github']
            checks[key + '_agent_present'] = snapshot['agent']
            checks[key + '_no_horizontal_overflow'] = snapshot['overflow'] <= 1
            checks[key + '_title'] = bool(snapshot['title'].strip())
            checks[key + '_description'] = bool(snapshot['description'].strip())
            ctx.close()
        browser.close()
except Exception as error:
    errors.append(f'{type(error).__name__}: {error}')
checks['no_external_requests'] = not external
checks['no_page_errors'] = not errors
result = {'checks': checks, 'details': details, 'external_requests': external, 'errors': errors, 'scope': 'Offline local UI; no link activation, external navigation, or model requests.'}
(ROOT / 'docs/companion-shots/demo-essential-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(0 if len(checks) == 20 and all(checks.values()) else 1)
