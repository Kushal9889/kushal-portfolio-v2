'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ASK_AGENT_EVENT, COMPANION_EVENT, OPEN_AGENT_EVENT, type CompanionProgress, type CompanionStop } from '@/lib/companion';
import { reducedMotion } from '@/lib/verbs';
import styles from './AgentCompanion.module.css';
import Glyph from './stage/Glyph';
import { useBorderGuide, useCtaLight } from './useBorderGuide';
import { clamp, solveArm, springStep, type Point } from '@/lib/robot-motion';

export function appendActivity(log: CompanionProgress[], item: CompanionProgress) {
  const previous = log.at(-1)?.phase;
  return item.phase === 'received' || previous === 'done' || previous === 'failed' || previous === 'stopped'
    ? [item] : [...log.slice(-7), item];
}

/** Original CSS illustration inspired by the supplied robot silhouette. */
function Robot({ pose, targetId }: { pose: string; targetId?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const rig = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const lowerLeft = useRef<HTMLSpanElement>(null);
  const lowerRight = useRef<HTMLSpanElement>(null);
  const motion = useRef({ x: 0, y: 0, vx: 0, vy: 0, aimX: 32, aimY: 90 });

  useEffect(() => {
    let frame = 0, previous = 0;
    let { x, y, vx, vy, aimX, aimY } = motion.current;
    let pointer: Point | null = null;
    const cue = () => {
      const el = targetId ? document.getElementById(targetId)?.querySelector('h1,h2') : root.current?.closest('#agent')?.querySelector(pose === 'working' ? '#ask' : 'article:last-of-type');
      const box = el?.getBoundingClientRect();
      return box ? { x: box.left + box.width / 2, y: clamp(box.top + box.height / 2, 24, innerHeight - 24) } : { x: innerWidth / 2, y: innerHeight / 2 };
    };
    const draw = (now: number) => {
      frame = 0;
      if (!root.current?.getClientRects().length || root.current.closest('[inert]') || document.hidden) return;
      const box = root.current.getBoundingClientRect();
      const scale = box.width / 64 || 1;
      const world = pointer ?? cue();
      const desired = { x: (world.x - box.left) / scale, y: (world.y - box.top) / scale };
      const blend = reducedMotion() ? 1 : 1 - Math.exp(-18 * (previous ? Math.min((now - previous) / 1000, .032) : .016));
      aimX += (desired.x - aimX) * blend; aimY += (desired.y - aimY) * blend;
      const local = { x: aimX, y: aimY };
      const tx = clamp((local.x - 32) / 32, -5, 5), ty = clamp((local.y - 44) / 40, -4, 4);
      const calm = reducedMotion();
      const dt = previous ? Math.min((now - previous) / 1000, .032) : .016;
      previous = now;
      const sx = springStep(x, vx, tx, dt), sy = springStep(y, vy, ty, dt);
      x = calm ? 0 : sx.position; y = calm ? 0 : sy.position; vx = calm ? 0 : sx.velocity; vy = calm ? 0 : sy.velocity;
      const tilt = calm ? 0 : clamp(vx / 80, -.08, .08);
      if (rig.current) rig.current.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}rad)`;
      // Invert the body's current transform before solving the joint targets.
      const dx = local.x - x - 32, dy = local.y - y - 44;
      const target = { x: 32 + dx * Math.cos(tilt) + dy * Math.sin(tilt), y: 44 - dx * Math.sin(tilt) + dy * Math.cos(tilt) };
      for (const [shoulder, upper, lower, bend] of [
        [{x: 8, y: 50}, left.current, lowerLeft.current, -1],
        [{x: 57, y: 50}, right.current, lowerRight.current, 1],
      ] as const) {
        const arm = solveArm(shoulder, target, bend);
        if (upper) upper.style.transform = `rotate(${arm.upper}rad)`;
        if (lower) lower.style.transform = `rotate(${arm.lower}rad)`;
      }
      if (head.current) head.current.style.transform = `rotate(${clamp(Math.atan2(target.y - 25, Math.abs(target.x - 32) + 35) * Math.sign(target.x - 32) * .2, -.2, .2)}rad)`;
      motion.current = { x, y, vx, vy, aimX, aimY };
      if (!calm && (Math.abs(tx-x) + Math.abs(ty-y) + Math.abs(vx) + Math.abs(vy) + Math.abs(desired.x-aimX) + Math.abs(desired.y-aimY) > .03)) frame = requestAnimationFrame(draw);
    };
    const wake = () => { if (!frame) { previous = 0; frame = requestAnimationFrame(draw); } };
    const point = (event: PointerEvent) => { if (event.pointerType === 'mouse' || event.type === 'pointerdown') { pointer = { x: event.clientX, y: event.clientY }; wake(); } };
    const reset = () => { pointer = null; wake(); };
    const focus = (event: FocusEvent) => {
      const box = (event.target as HTMLElement)?.getBoundingClientRect?.();
      if (box) { pointer = { x: box.left + box.width/2, y: box.top + box.height/2 }; wake(); }
    };
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else reset(); };
    document.addEventListener('pointermove', point, { passive: true });
    document.addEventListener('pointerdown', point, { passive: true });
    document.addEventListener('pointerleave', reset);
    document.addEventListener('focusin', focus);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', reset);
    wake();
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointermove', point); document.removeEventListener('pointerdown', point); document.removeEventListener('pointerleave', reset); document.removeEventListener('focusin', focus); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', reset); };
  }, [pose, targetId]);

  return <span ref={root} className={styles.robot} data-pose={pose} aria-hidden="true"><span ref={rig} className={styles.rig}>
    <span className={styles.antenna} />
    <span ref={head} className={styles.head}><span className={styles.face}><i /><i /></span></span>
    <span className={styles.neck} />
    <span className={styles.body}><span className={styles.screen}>ASK</span><span className={styles.vents} /></span>
    <span ref={left} className={styles.armLeft}><span ref={lowerLeft} className={styles.forearm}><span className={styles.hand} /></span></span>
    <span ref={right} className={styles.armRight}><span ref={lowerRight} className={styles.forearm}><span className={styles.hand} /></span></span>
    <span className={styles.legLeft} /><span className={styles.legRight} />
    <span className={styles.shadow} />
  </span></span>;
}

export default function AgentCompanion({ stops = [], chat = false, busy = false, visible = true }: { stops?: CompanionStop[]; chat?: boolean; busy?: boolean; visible?: boolean }) {
  const [active, setActive] = useState(0);
  const border = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [calm, setCalm] = useState(true);
  const [draft, setDraft] = useState('');
  const [progress, setProgress] = useState<CompanionProgress | null>(null);
  const [log, setLog] = useState<CompanionProgress[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const stop = stops[active];
  useBorderGuide(border, chat || expanded || hidden, stop?.id);
  useCtaLight(!chat);

  useLayoutEffect(() => {
    if (!returnFocus.current) return;
    (hidden ? restore : trigger).current?.focus({ preventScroll: true });
    returnFocus.current = false;
  }, [hidden]);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setCalm(reducedMotion());
    sync(); mq.addEventListener('change', sync);
    const onProgress = (event: Event) => {
      const item = (event as CustomEvent<CompanionProgress>).detail;
      setProgress(item);
      setLog(old => appendActivity(old, item));
    };
    window.addEventListener(COMPANION_EVENT, onProgress);
    return () => { mq.removeEventListener('change', sync); window.removeEventListener(COMPANION_EVENT, onProgress); };
  }, []);

  useEffect(() => {
    if (chat || !stops.length) return;
    // One narrow reading band works for tall sections and reverse scrolling.
    const observer = new IntersectionObserver(() => {
      const current = stops.map((stop, index) => ({ index, box: document.getElementById(stop.id)?.getBoundingClientRect() }))
        .filter((item): item is {index: number; box: DOMRect} => !!item.box && item.box.bottom > innerHeight * .12 && item.box.top < innerHeight * .34)
        .sort((a, b) => b.box.top - a.box.top)[0];
      if (current) setActive(current.index);
    }, { rootMargin: '-12% 0px -66% 0px', threshold: 0 });
    stops.forEach(s => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [chat, stops]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node) || trigger.current?.contains(event.target as Node)) return;
      const recover = panel.current?.contains(document.activeElement);
      setExpanded(false);
      if (recover) requestAnimationFrame(() => {
        if (document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
      });
    };
    const leave = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('focusin', leave);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('focusin', leave); };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const position = () => {
      if (!panel.current || !border.current) return;
      const r = border.current.getBoundingClientRect();
      const view = window.visualViewport;
      const top = view?.offsetTop ?? 0, bottom = top + (view?.height ?? innerHeight);
      const above = r.top - top - 20, below = bottom - r.bottom - 20;
      const down = below > above;
      panel.current.style.top = down ? 'calc(100% + 14px)' : 'auto';
      panel.current.style.bottom = down ? 'auto' : 'calc(100% + 14px)';
      panel.current.style.maxHeight = `${Math.max(0, Math.min(520, (down ? below : above) - 14))}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => { window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position); };
  }, [expanded]);

  const pose = busy ? (progress?.phase === 'checking' ? 'checking' : 'working') : progress?.phase === 'failed' ? 'failed' : progress?.phase === 'done' ? 'done' : 'idle';
  const ask = (question: string) => {
    if (!question.trim()) return;
    trigger.current?.focus({ preventScroll: true });
    setExpanded(false);
    window.dispatchEvent(new CustomEvent<string>(ASK_AGENT_EVENT, { detail: question.trim() }));
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.trim()) { ask(draft); setDraft(''); } };
  const message = progress?.message ?? (busy ? 'Following your question through the agent.' : 'Ask about the work. Inspect the evidence.');

  if (chat) return <div hidden={!visible} className={styles.chat} data-calm={calm} data-phase={progress?.phase ?? (busy ? 'received' : 'idle')}>
    <Robot pose={pose} />
    <details className={styles.activity}>
      <summary><span role="status">{message}</span><span className={styles.logLabel}>Activity</span></summary>
      <ol aria-label="Agent activity">{log.length ? log.map((item, i) => <li key={i}><span>{item.phase}</span>{item.message}</li>) : <li>No run events in this view yet.</li>}</ol>
    </details>
  </div>;

  if (hidden) return <button ref={restore} className={styles.restore} type="button" onClick={() => { returnFocus.current = true; setHidden(false); }}>Show guide</button>;
  return <aside ref={border} className={styles.companion} data-calm={calm} data-stop={active} aria-label="Portfolio guide"
    onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" className={styles.launcher} aria-label={`Ask the work. ${stop?.label ?? "Meet Kushal"}`} aria-expanded={expanded} aria-controls={expanded ? 'portfolio-guide-panel' : undefined} onClick={() => setExpanded(!expanded)}>
      <Robot pose={pose} targetId={stop?.id} />
      <span className={styles.phoneLabel}>Ask</span>
      <span className={styles.caption}><strong>Ask the work.</strong><span>{stop?.label ?? 'Meet Kushal'} <Glyph name="ArrowUpRight:regular" size={16} /></span></span>
    </button>
    {expanded && <div ref={panel} id="portfolio-guide-panel" className={styles.panel} role="region" aria-label="Ask the portfolio guide">
      <div className={styles.panelHead}><span>Meet the work behind the résumé.</span><button type="button" aria-label="Close guide" onClick={() => { setExpanded(false); trigger.current?.focus(); }}><Glyph name="X:regular" size={18} /></button></div>
      <p className={styles.invitation}>{stop?.invitation ?? 'Curious about Kushal? Start anywhere.'}</p>
      {stop && <button type="button" className={styles.seed} onClick={() => ask(stop.question)}>{stop.question}<Glyph name="ArrowUpRight:regular" size={16} /></button>}
      <label className={styles.fieldLabel} htmlFor="guide-question">Ask anything about Kushal</label>
      <form onSubmit={submit} className={styles.composer}>
        <input id="guide-question" value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask anything about Kushal…" />
        <button type="submit" aria-label="Send guide question" disabled={!draft.trim()}><Glyph name="ArrowUp:bold" size={20} /></button>
      </form>
      <div className={styles.panelFoot}><button type="button" onClick={() => { trigger.current?.focus({ preventScroll: true }); setExpanded(false); window.dispatchEvent(new Event(OPEN_AGENT_EVENT)); }}>Open full chat</button><button type="button" onClick={() => { returnFocus.current = true; setHidden(true); setExpanded(false); }}>Hide guide</button></div>
      <p className={styles.disclosure}>Same agent. Answers with sources. No question sent until you ask.</p>
    </div>}
  </aside>;
}
