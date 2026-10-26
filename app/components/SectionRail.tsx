"use client";

import { useEffect, useState } from "react";
import styles from "./SectionRail.module.css";

/**
 * Where the reader is, and how to get anywhere else.
 *
 * The page had no navigation at all. It has seven sections, it is roughly
 * fifteen thousand pixels tall, and the only way to reach any part of it was to
 * scroll from the top or to already know the anchor. The progress rule at the
 * top edge answers "how much more is there"; it cannot answer "where am I" or
 * "take me to the work".
 *
 * Real anchors, in a real list, inside a real `nav`. Every keyboard behaviour a
 * reader expects from this comes from the elements rather than from a handler:
 * tab reaches them, enter follows them, the browser puts focus at the
 * destination, and `:target` already styles the arrival. Nothing here is a
 * div listening for a click.
 *
 * Server-rendered from the same list the page builds its sections from, so a
 * visitor with no JavaScript gets working navigation and loses only the
 * highlight. The highlight is the one part that has to be scripted, because no
 * amount of scroll-driven CSS can set `aria-current`, and a highlight a screen
 * reader cannot read is decoration.
 */
export type RailItem = { id: string; label: string };

export default function SectionRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  // The hero carries its own routes, so the rail waits until the reader leaves it.
  const [atTop, setAtTop] = useState(false);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const top = document.getElementById("top");
    if (top) sections.unshift(top);

    /*
     * IntersectionObserver, not a scroll listener and not a scroll timeline.
     *
     * A scroll listener is banned outright here and deserves to be: it runs on
     * every frame to answer a question whose answer changes about seven times in
     * a full read. A CSS scroll timeline is the right tool for anything visual
     * and the wrong one for this, because the thing being computed is an ARIA
     * state and a stylesheet cannot set one.
     *
     * The band is the top third of the viewport. A section counts as current
     * once its heading has reached reading position, which is what a reader
     * means by "where am I", rather than the instant its first pixel appears.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setActive(entry.target.id === "top" ? null : entry.target.id);
          setAtTop(entry.target.id === "top");
        }
      },
      { rootMargin: "-12% 0px -66% 0px", threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <>
    <details className={`more ${styles.mobile}`}>
      <summary>Sections</summary>
      <nav aria-label="Sections on this page">
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
    <nav className={styles.rail} aria-label="Sections" data-at-top={atTop || undefined}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              className={styles.link}
              href={`#${item.id}`}
              aria-current={active === item.id ? "true" : undefined}
            >
              {/* The mark carries the state. It is not the accessible name:
                  the heading text beside it is, and it stays in the DOM at
                  every width so the link is never an unlabelled tick. */}
              <span className={styles.tick} aria-hidden="true" />
              <span className={styles.label}>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
    </>
  );
}
