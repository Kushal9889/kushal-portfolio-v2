// Deep UI audit: every visible text node, line, box, figure, image and link on
// the page, checked against the design rules. Paste into the browser console, or
// run through Playwright: page.evaluate(fs.readFileSync(this file) + "; deepAudit()").
// Returns { counts, findings } where each finding is [rule, where, detail].
// Agent UI is skipped (owned by another branch).
/* eslint-disable */
async function deepAudit({ openDisclosures = true } = {}) {
  const AGENT = '[class*="Agent-module"],[class*="AgentCompanion"],#agent-panel';
  const F = [];
  const add = (rule, el, detail) => {
    const where = el ? (el.closest("section[id]")?.id || el.closest("header,footer,nav")?.tagName.toLowerCase() || "root") : "page";
    F.push([rule, where, String(detail).slice(0, 140)]);
  };
  if (openDisclosures) {
    for (let i = 0; i < 4; i++) document.querySelectorAll("details:not([open])").forEach((d) => { if (!d.closest(AGENT)) d.open = true; });
    await new Promise((r) => setTimeout(r, 600));
  }
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
      if (e.matches(".sr-only,.visually-hidden,[class*='srOnly']")) return false;
    }
    return true;
  };
  const leafText = [...document.querySelectorAll("main *, body > header *, body > footer *")].filter(
    (el) => !el.closest(AGENT) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el),
  );

  // 1. Text and copy
  const textRules = [
    [/\\u[0-9a-f]{4}|\\n|&amp;|&#\d+;|&nbsp;/i, "text.escape-literal"],
    [/[—–]/, "text.em-or-en-dash"],
    [/ {2,}/, "text.double-space"],
    [/\s[,.;:!?](\s|$)/, "text.space-before-punct"],
    [/\b(\w+) \1\b/i, "text.repeated-word"],
    [/\bTODO|lorem|undefined|NaN|null\b/, "text.placeholder"],
    [/ - /, "text.hyphen-as-dash"],
    [/\.\.\.|…/, "text.ellipsis"],
    [/\s·\s.*\s·\s/, "text.middot-chain"],
  ];
  const quotes = { straight: 0, curly: 0 };
  for (const el of leafText) {
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
    for (const [re, rule] of textRules) if (re.test(t)) add(rule, el, t.trim());
    if (/'|"/.test(t)) quotes.straight++;
    if (/[‘’“”]/.test(t)) quotes.curly++;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.fontSize) < 12) add("type.below-12px", el, `${cs.fontSize} «${t.trim().slice(0, 40)}»`);
    if (cs.textTransform === "uppercase" && t.trim().split(/\s+/).length > 2) add("type.uppercase-strip", el, t.trim());
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow === "ellipsis") add("text.truncated", el, t.trim());
  }
  if (quotes.straight && quotes.curly) add("text.mixed-quotes", null, `straight ${quotes.straight} vs curly ${quotes.curly}`);

  // 2. Numbers, units and dates
  const all = leafText.map((el) => el.textContent.trim());
  const unitSpace = { spaced: [], tight: [] };
  for (const t of all) {
    for (const m of t.matchAll(/\b\d+(?:\.\d+)?( ?)(s|ms|%|x|KB|MB|GB)\b/g)) (m[1] ? unitSpace.spaced : unitSpace.tight).push(m[0]);
  }
  if (unitSpace.spaced.length && unitSpace.tight.length)
    add("number.unit-spacing-mixed", null, `spaced ${[...new Set(unitSpace.spaced)].slice(0, 6)} | tight ${[...new Set(unitSpace.tight)].slice(0, 6)}`);
  const dates = { iso: new Set(), long: new Set(), short: new Set() };
  for (const t of all) {
    for (const m of t.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) dates.iso.add(m[0]);
    for (const m of t.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/g)) dates.long.add(m[0]);
    for (const m of t.matchAll(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? 20\d\d\b/g)) dates.short.add(m[0]);
  }
  const used = Object.entries(dates).filter(([, s]) => s.size);
  if (used.length > 1) add("date.formats-mixed", null, used.map(([k, s]) => `${k}: ${[...s].slice(0, 3).join(", ")}`).join(" | "));
  const approx = new Set(all.flatMap((t) => [...t.matchAll(/[~≈]\s?\d[\d.,]*/g)].map((m) => m[0])));
  if (approx.size) add("number.approximate-figures", null, [...approx].join(", "));

  // 3. Type scale, colours, radii, borders, shadows, gradients
  const tally = (key) => new Map();
  const sizes = new Map(), colors = new Map(), radii = new Map(), borders = new Map(), tracking = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const el of document.querySelectorAll("main *, body > header *, body > footer *")) {
    if (el.closest(AGENT) || !vis(el)) continue;
    const cs = getComputedStyle(el);
    if (leafText.includes(el)) { bump(sizes, Math.round(parseFloat(cs.fontSize) * 10) / 10); bump(colors, cs.color); bump(tracking, cs.letterSpacing); }
    if (cs.borderTopLeftRadius !== "0px" || cs.borderTopRightRadius !== "0px") bump(radii, cs.borderRadius);
    const bw = ["Top", "Right", "Bottom", "Left"].map((s) => cs[`border${s}Width`]);
    if (bw.some((w) => w !== "0px")) bump(borders, `${bw.join("/")} ${cs.borderTopColor}`);
    if (cs.boxShadow !== "none" && /\d+px \d+px [1-9]\d*px/.test(cs.boxShadow)) add("elevation.drop-shadow", el, cs.boxShadow);
    if (cs.textShadow !== "none" && !document.documentElement.dataset.film) add("glow.text-shadow", el, cs.textShadow);
    if (/gradient/.test(cs.backgroundImage) && !/repeating/.test(cs.backgroundImage)) add("glow.gradient", el, cs.backgroundImage);
    if (/inset (2|3|4)px 0/.test(cs.boxShadow) || parseFloat(cs.borderLeftWidth) >= 3) add("slop.side-tab", el, cs.boxShadow);
    if (cs.borderTopLeftRadius !== cs.borderTopRightRadius && cs.borderRadius !== "0px") add("shape.asymmetric-radius", el, cs.borderRadius);
  }
  const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join("  ");
  add("scale.font-sizes", null, `${sizes.size} sizes: ${top(sizes, 20)}`);
  add("scale.text-colours", null, `${colors.size}: ${top(colors, 8)}`);
  add("scale.letter-spacing", null, `${tracking.size}: ${top(tracking, 8)}`);
  add("shape.radii", null, `${radii.size}: ${top(radii, 10)}`);
  add("line.borders", null, `${borders.size}: ${top(borders, 10)}`);

  // 4. Alignment: content left edges per section, and section widths
  const edges = new Map();
  for (const s of document.querySelectorAll("main > section[id]")) {
    const wrap = s.querySelector(":scope > .wrap") || s;
    const r = wrap.getBoundingClientRect();
    edges.set(s.id, `x${Math.round(r.left)} w${Math.round(r.width)}`);
    const xs = new Set([...wrap.children].filter(vis).map((c) => Math.round(c.getBoundingClientRect().left)));
    if (xs.size > 2) add("align.ragged-left-edges", s, [...xs].join(","));
  }
  const frames = new Set(edges.values());
  if (frames.size > 1) add("align.section-frames", null, [...edges].map(([k, v]) => `${k}:${v}`).join(" "));

  // 5. Headings
  let last = 1;
  for (const h of document.querySelectorAll("main h1, main h2, main h3, main h4, main h5")) {
    if (h.closest(AGENT)) continue;
    const lvl = +h.tagName[1];
    if (lvl > last + 1) add("heading.skip", h, `${h.tagName} after h${last}: ${h.textContent.trim()}`);
    last = lvl;
    const rects = (() => { const rg = document.createRange(); rg.selectNodeContents(h); return [...rg.getClientRects()]; })();
    const lines = new Set(rects.map((r) => Math.round(r.top)));
    if (lines.size > 1) {
      const lastLine = Math.max(...lines);
      const lastWidth = rects.filter((r) => Math.round(r.top) === lastLine).reduce((a, r) => a + r.width, 0);
      if (lastWidth < h.getBoundingClientRect().width * 0.18) add("heading.widow", h, h.textContent.trim());
    }
  }
  if (document.querySelectorAll("h1").length !== 1) add("heading.h1-count", null, document.querySelectorAll("h1").length);

  // 6. Links and controls
  const hrefsByText = new Map();
  for (const a of document.querySelectorAll("a[href]")) {
    if (a.closest(AGENT)) continue;
    const t = (a.innerText || a.getAttribute("aria-label") || "").trim();
    if (a.target === "_blank" && !/noreferrer|noopener/.test(a.rel)) add("link.blank-without-rel", a, a.href);
    if (a.getAttribute("href") === "#") add("link.dead-hash", a, t);
    if (t) { const s = hrefsByText.get(t) || new Set(); s.add(a.href); hrefsByText.set(t, s); }
    if (/^(click here|here|read more|learn more|more|link)$/i.test(t)) add("link.vague-text", a, t);
  }
  for (const [t, s] of hrefsByText) if (s.size > 1 && t.length > 2) add("link.same-text-different-target", null, `«${t}» -> ${s.size} targets`);
  const touch = matchMedia("(pointer: coarse)").matches || innerWidth < 768;
  if (touch) for (const c of document.querySelectorAll("main a, main button, main summary, body > header a, body > header button")) {
    if (c.closest(AGENT) || !vis(c)) continue;
    const r = c.getBoundingClientRect();
    if (r.height < 44 && r.width < 44 && !c.closest("p,li")) add("touch.under-44", c, `${Math.round(r.width)}x${Math.round(r.height)} ${c.textContent.trim().slice(0, 30)}`);
  }

  // 7. Images
  for (const img of document.querySelectorAll("main img, body > header img, body > footer img")) {
    if (img.closest(AGENT) || !vis(img)) continue;
    const r = img.getBoundingClientRect();
    if (!img.getAttribute("width") || !img.getAttribute("height")) add("img.no-dimensions", img, img.src);
    if (!img.src.endsWith(".svg") && img.naturalWidth && img.naturalWidth < r.width * Math.min(devicePixelRatio, 2) * 0.9)
      add("img.upscaled", img, `${img.naturalWidth}px drawn at ${Math.round(r.width)}px`);
    if (img.complete && img.naturalWidth === 0) add("img.broken", img, img.src);
  }

  // 8. Fixed chrome covering content
  const fixed = [...document.querySelectorAll("body *")].filter((el) => getComputedStyle(el).position === "fixed" && vis(el) && el.getBoundingClientRect().height < innerHeight * 0.9);
  const cover = fixed.reduce((a, el) => { const r = el.getBoundingClientRect(); return a + Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)); }, 0);
  add("chrome.fixed-coverage", null, `${fixed.length} fixed layers cover ${Math.round((cover / (innerWidth * innerHeight)) * 100)}% of the viewport`);

  // 9. Contrast (opaque grounds only)
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ground = (el) => { for (let e = el; e; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; const a = bg.match(/[\d.]+/g); if (a && (a.length < 4 || +a[3] > 0.95) && !/^rgba\(0, 0, 0, 0\)/.test(bg)) return bg; } return "rgb(0, 0, 0)"; };
  for (const el of leafText) {
    const cs = getComputedStyle(el);
    if (!/^rgb\(/.test(cs.color)) continue;
    const L1 = lum(cs.color), L2 = lum(ground(el));
    if (L1 == null || L2 == null) continue;
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) add("contrast.low", el, `${ratio.toFixed(2)}:1 ${cs.color} on ${ground(el)} «${el.textContent.trim().slice(0, 30)}»`);
  }

  const counts = {};
  for (const [rule] of F) counts[rule] = (counts[rule] || 0) + 1;
  return { viewport: `${innerWidth}x${innerHeight}`, counts, findings: F };
}
