"use client";

import { useId, useMemo, useState } from "react";
import { find, redact } from "@/lib/redact";
import Panel from "./Panel";
import styles from "./Redact.module.css";

/** Fictional sample: example.com, a 555 number, the standard test card. */
const SAMPLE =
  "Ticket from Ana Ruiz (ana.ruiz@example.com, +1 (555) 010-0199): the export failed from 10.0.4.12. " +
  "She pasted her card 4111 1111 1111 1111 and a key sk-test_4f9a2c1d8e7b6a5f3c2d to show us. Reply to ana.ruiz@example.com.";

/**
 * Redact it yourself: type or paste anything and the personal data in it is
 * replaced by typed placeholders as you type, by lib/redact.ts in this tab.
 * The same redaction step sits in front of the model in the Azure pipeline
 * described under Work. Nothing typed here is sent anywhere.
 */
export default function Redact() {
  const id = useId();
  const [text, setText] = useState(SAMPLE);
  const hits = useMemo(() => find(text), [text]);
  const out = useMemo(() => redact(text, hits), [text, hits]);
  const found = hits.length;
  const parts = out.text.split(/(\[[A-Z]+_\d+\])/g);

  return (
    <Panel label="Redact it yourself" kind="instrument" surface="console" heading={3} state={found ? "running" : "idle"} status={`${found} found · nothing sent`}>
      <p className={styles.lede}>What the model is allowed to see. Emails, phone numbers, card numbers, IP addresses, SSNs and keys are replaced before it would leave; names are not.</p>
      <label className={styles.label} htmlFor={`${id}-in`}>
        Raw text
      </label>
      <textarea id={`${id}-in`} className={styles.input} value={text} onChange={(e) => setText(e.target.value)} rows={4} spellCheck={false} />
      <p className={styles.label} id={`${id}-out`}>
        What the model receives
      </p>
      <p className={styles.output} aria-labelledby={`${id}-out`} aria-live="polite">
        {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
      </p>
      <p className={styles.counts}>
        {Object.entries(out.count).map(([kind, n]) => (
          <span key={kind}>
            {kind.toLowerCase()} <data value={n}>{n}</data>
          </span>
        ))}
      </p>
    </Panel>
  );
}
