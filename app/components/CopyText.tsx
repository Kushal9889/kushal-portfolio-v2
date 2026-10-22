"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import styles from "./CopyText.module.css";

/**
 * One value a reader would otherwise select by hand, copied in one press.
 *
 * The label says what will be copied, and changes to say it was: completion
 * feedback in the control itself, where the eye already is, rather than a toast
 * somewhere else. A refused clipboard leaves the label alone; the value is
 * still on the page beside it.
 */
export default function CopyText({ text, label, what }: { text: string; label: string; what: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.copy}
      data-copied={copied || undefined}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            track("contact", `copy-${what}`);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        )
      }
    >
      {/* The live region stays mounted so the change is announced; the keyed
          word inside it remounts so the new word fades in. */}
      <span aria-live="polite">
        <span key={copied ? "done" : "idle"} className={styles.say}>
          {copied ? "Copied" : label}
        </span>
      </span>
    </button>
  );
}
