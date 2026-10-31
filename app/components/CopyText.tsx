"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import styles from "./CopyText.module.css";

/** Clipboard refusal keeps the exact value available for manual copying. */
export default function CopyText({ text, label, what }: { text: string; label: string; what: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
      track('contact', `copy-${what}`);
      timer.current = setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
    }
  }
  return <>
    <button type="button" className={styles.copy} data-copied={state === 'copied' || undefined} onClick={copy}>
      <span aria-live="polite"><span key={state} className={styles.say}>{state === 'copied' ? 'Copied' : label}</span></span>
    </button>
    {state === 'failed' && <label className={styles.fallback}>
      <span role="status">Copy unavailable. Select this value and copy it manually.</span>
      <input readOnly aria-label={`Manual copy: ${label}`} value={text} onFocus={e => e.currentTarget.select()} />
    </label>}
  </>;
}
