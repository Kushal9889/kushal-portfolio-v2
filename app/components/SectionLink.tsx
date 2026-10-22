"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import styles from "./SectionLink.module.css";

/**
 * A section address, as something a reader can send.
 *
 * This was a numeral stacked over the heading. Numerals over headings are the
 * enumeration eyebrow, and an eyebrow costs a heading its own weight: a reader
 * who sees "05" learns their position and not what they arrived at, while the
 * heading beside it already said both. So the heading takes the size back and
 * the address becomes a mark inside it, shown when the head is pointed at.
 *
 * Clicking copies the absolute URL, because the commonest reason to want one of
 * these is to put it in a message. Navigating still works: the href is real, so
 * a middle-click, a keyboard activation, or a blocked clipboard all behave the
 * way a link is supposed to.
 */
export default function SectionLink({ id, title }: { id: string; title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <a
      className={styles.mark}
      href={`#${id}`}
      aria-label={`Copy a link to ${title}`}
      data-copied={copied || undefined}
      onClick={(e) => {
        // Only intercept a plain click. A modifier means the reader wants the
        // browser's behaviour, not ours.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        navigator.clipboard?.writeText(url).then(
          () => {
            setCopied(true);
            track("contact", `section-link-${id}`);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {
            // Clipboard refused. The anchor still moved the page.
          },
        );
      }}
    >
      <span aria-hidden="true">{copied ? "copied" : "#"}</span>
    </a>
  );
}
