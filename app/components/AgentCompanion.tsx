'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ASK_AGENT_EVENT, COMPANION_EVENT, OPEN_AGENT_EVENT, type CompanionProgress, type CompanionStop } from '@/lib/companion';
import { reducedMotion } from '@/lib/verbs';
import styles from './AgentCompanion.module.css';

/** Original CSS illustration inspired by the supplied robot silhouette. */
function Robot({ pose }: { pose: string }) {
  return <span className={styles.robot} data-pose={pose} aria-hidden="true">
    <span className={styles.antenna} />
    <span className={styles.head}><span className={styles.face}><i /><i /></span></span>
    <span className={styles.neck} />
    <span className={styles.body}><span className={styles.screen}>ASK</span><span className={styles.vents} /></span>
    <span className={styles.armLeft} /><span className={styles.armRight} />
    <span className={styles.legLeft} /><span className={styles.legRight} />
    <span className={styles.shadow} />
  </span>;
}

export default function AgentCompanion({ stops = [], chat = false, busy = false, visible = true }: { stops?: CompanionStop[]; chat?: boolean; busy?: boolean; visible?: boolean }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [calm, setCalm] = useState(true);
  const [draft, setDraft] = useState('');
  const [progress, setProgress] = useState<CompanionProgress | null>(null);
  const [log, setLog] = useState<CompanionProgress[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stop = stops[active];

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setCalm(reducedMotion());
    sync(); mq.addEventListener('change', sync);
    const onProgress = (event: Event) => {
      const item = (event as CustomEvent<CompanionProgress>).detail;
      setProgress(item);
      setLog(old => [...old.slice(-7), item]);
    };
    window.addEventListener(COMPANION_EVENT, onProgress);
    return () => { mq.removeEventListener('change', sync); window.removeEventListener(COMPANION_EVENT, onProgress); };
  }, []);

  useEffect(() => {
    if (chat || !stops.length) return;
    // One narrow reading band works for tall sections and reverse scrolling.
    const observer = new IntersectionObserver(entries => {
      const arrived = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!arrived) return;
      const index = stops.findIndex(s => s.id === arrived.target.id);
      if (index >= 0) setActive(index);
    }, { rootMargin: '-12% 0px -66% 0px', threshold: 0 });
    stops.forEach(s => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [chat, stops]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [expanded]);

  const pose = busy ? (progress?.phase === 'checking' ? 'checking' : 'working') : progress?.phase === 'failed' ? 'failed' : progress?.phase === 'done' ? 'done' : ['welcome', 'point', 'think', 'point', 'welcome', 'think', 'point', 'welcome'][active % 8];
  const ask = (question: string) => {
    if (!question.trim()) return;
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

  if (hidden) return <button className={styles.restore} type="button" onClick={() => setHidden(false)}>Show guide</button>;
  return <aside className={styles.companion} data-calm={calm} data-stop={active} aria-label="Portfolio guide"
    style={{ transform: calm ? 'none' : `translateY(${[0, -24, -48, -16, -40, -8, -32, 0][active % 8]}px)` }}
    onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); trigger.current?.focus(); } }}>
    {expanded && <div ref={panel} id="portfolio-guide-panel" className={styles.panel} role="region" aria-label="Ask the portfolio guide">
      <div className={styles.panelHead}><span>Meet the work behind the résumé.</span><button type="button" aria-label="Close guide" onClick={() => { setExpanded(false); trigger.current?.focus(); }}>×</button></div>
      <p className={styles.invitation}>{stop?.invitation ?? 'Curious about Kushal? Start anywhere.'}</p>
      {stop && <button type="button" className={styles.seed} onClick={() => ask(stop.question)}>{stop.question}<span aria-hidden="true">↗</span></button>}
      <form onSubmit={submit} className={styles.composer}>
        <label className={styles.srOnly} htmlFor="guide-question">Ask anything about Kushal</label>
        <input id="guide-question" value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask anything about Kushal…" />
        <button type="submit" aria-label="Send guide question" disabled={!draft.trim()}>↑</button>
      </form>
      <div className={styles.panelFoot}><button type="button" onClick={() => { setExpanded(false); window.dispatchEvent(new Event(OPEN_AGENT_EVENT)); }}>Open full chat</button><button type="button" onClick={() => { setHidden(true); setExpanded(false); }}>Hide guide</button></div>
      <p className={styles.disclosure}>Same agent. Answers with sources. No question sent until you ask.</p>
    </div>}
    <button ref={trigger} type="button" className={styles.launcher} aria-expanded={expanded} aria-controls={expanded ? 'portfolio-guide-panel' : undefined} onClick={() => setExpanded(!expanded)}>
      <Robot key={active} pose={pose} />
      <span className={styles.caption}><strong>Ask the work.</strong><span>{stop?.label ?? 'Meet Kushal'} <span aria-hidden="true">↗</span></span></span>
    </button>
  </aside>;
}
