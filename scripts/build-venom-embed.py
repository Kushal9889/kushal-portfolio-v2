"""Build a sandboxed decorative CTA from the pinned, MIT-licensed Venom source."""
from pathlib import Path
import re, hashlib
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT.parent/'vendor/venom-button'
s=(SOURCE/'index.html').read_text()
original=hashlib.sha256(s.encode()).hexdigest()
assert 'window.VenomButton =' in s and s.count('requestAnimationFrame(frame);')==2
s=re.sub(r'<script type="application/octet-stream" id="font-geist-bold">.*?</script>','',s,flags=re.S)
a=s.index('const fontReady =');b=s.index('const LABEL_TEXT',a)
s=s[:a]+'const fontReady = Promise.resolve();\n'+s[b:]
s=s.replace("const LABEL_TEXT = 'let’s collaborate';", "const LABEL_TEXT = ' ';")
s=s.replace("powerPreference: 'high-performance'", "powerPreference: 'low-power'")
s=s.replace('Math.min(devicePixelRatio || 1, 2)', '1')
# The hidden demo button needs no layout; its metrics initialize after the GL guard.
s=s.replace("  layoutButton();\n  addEventListener('resize', layoutButton);\n  return;", "  return;")
s=s.replace('btn.hh = 30;', 'btn.hh = Math.max(18, viewH() / 2 - 12);')
s=s.replace('btn.hw = ((labelInkW || 520) * sc) / 2 + 30;', 'btn.hw = Math.max(36, viewW() / 2 - 14);')
a=s.index('// SVG label: drag-drop');b=s.index('window.VenomButton =',a)
s=s[:a]+s[b:]
s=s.replace('requestAnimationFrame(frame);','queueFrame();')
s=s.replace("addEventListener('resize', resize);\nresize();", """addEventListener('resize', resize);
resize();
// Opaque srcDoc can initialize before its iframe has a nonzero layout box.
const surfaceSize = new ResizeObserver((entries) => {
  const { width, height } = entries[0].contentRect;
  if (width > 0 && height > 0) { resize(); queueFrame(); }
});
surfaceSize.observe(canvas);""")
s=s.replace('function frame(now) {', '''let embedActive = false, frameQueued = false;
function queueFrame() { if (embedActive && !frameQueued) { frameQueued = true; requestAnimationFrame(frame); } }
function frame(now) {
  frameQueued = false;
  if (!embedActive || document.hidden) { last = now; return; }''')
bridge='''
addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'portfolio:venom') return;
  const data = event.data;
  if (data.dispose) { embedActive=false; surfaceSize.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); return; }
  embedActive = data.active === true;
  if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
    dispatchEvent(new PointerEvent('pointermove', {clientX:data.x,clientY:data.y,pointerType:'mouse'}));
  }
  if (!embedActive) { cur.present=false; setOver(false); }
  queueFrame();
});
addEventListener('pagehide',()=>{ surfaceSize.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); });
parent.postMessage({type:'portfolio:venom-ready'}, '*');
'''
s=s.replace('})();\n</script>\n</body>',bridge+'\n})();\n</script>\n</body>')
s=s.replace('<title>Venom Button</title>', '''<title>Decorative Venom CTA surface</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'">''')
s=s.replace('</style>', '\n.hint,.tune-toggle,.panel,#venom{display:none!important}body{cursor:auto!important}\n</style>',1)
s=s.replace('</style>', '''
.standalone-help{position:fixed;inset:0;z-index:2;display:grid;place-content:center;gap:16px;padding:24px;background:#111;color:#fafafa;font:16px/1.6 system-ui,sans-serif}
.standalone-help[hidden]{display:none!important}.standalone-help h1,.standalone-help p{max-width:38rem;margin:0}.standalone-help h1{font-size:clamp(24px,5vw,40px);line-height:1.15}
.standalone-help a{display:inline-flex;align-items:center;min-height:44px;color:inherit;text-underline-offset:4px}.standalone-help a:focus-visible{outline:2px solid currentColor;outline-offset:4px}
</style>''',1)
s=s.replace('<body>', '''<body>
<section id="standalone-help" class="standalone-help" hidden aria-label="Open the portfolio">
<h1>This effect belongs inside the portfolio.</h1>
<p>This is the embedded Venom resource. Its animation is activated by the portfolio’s Email him button. Touch and reduced-motion settings use a static button.</p>
<a href="/#top">Open the portfolio →</a><a href="/#agent">Open the interactive agent →</a>
</section>''',1)
# Direct navigation needs a useful destination, rather than a blank, inactive canvas.
s=s.replace('(() => {\n', '''(() => {
if (parent === window) {
  document.getElementById('stage').hidden = true;
  document.getElementById('standalone-help').hidden = false;
  return;
}
''',1)
s='<!-- Adapted from exteestudio/venom-button ca890bde95e81230c075879518bb70c1f2885c53, MIT. Original SHA256 '+original+'. See LICENSE. Native parent anchor owns all input and navigation. -->\n'+s
assert 'portfolio:venom-ready' in s and 'drag-drop a file' not in s and 'application/octet-stream' not in s
out=ROOT/'public/venom';out.mkdir(exist_ok=True)
(out/'cta.html').write_text(s)
(out/'LICENSE').write_text((SOURCE/'LICENSE').read_text())
(out/'README.md').write_text('Pinned source: https://github.com/exteestudio/venom-button/tree/ca890bde95e81230c075879518bb70c1f2885c53\n\nGenerated by scripts/build-venom-embed.py. Preserves upstream WebGL2 renderer and physics. Changes: bounded native-anchor decoration, blank embedded label, no upload/tuning UI, DPR1, low-power hint, active-only scheduling, sandbox message bridge and no-network CSP. No cursor takeover, iframe focus, navigation or model calls.\n')
print('Built sandboxed Venom surface',len(s.encode()),'bytes')
