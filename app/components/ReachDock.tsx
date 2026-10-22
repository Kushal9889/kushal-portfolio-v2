"use client";

import { useEffect, useState } from "react";
import { mailtoLink, type ReachContext } from "@/lib/reach";
import { track } from "@/lib/analytics";
import { reducedMotion } from "@/lib/verbs";
import { MailMark, LinkedInMark } from "./Mark";
import styles from "./ReachDock.module.css";

/**
 * Reaching him from wherever the reader happens to be.
 *
 * The contact block sits at section seven. A reader persuaded by the LangChain
 * fix in section one had to scroll past everything else to act on it, and
 * arrived at the least specific of the seven drafts, because `Reach` is called
 * once with no `context` and the other six openers have never been reachable.
 *
 * This is deliberately not a floating chat bubble. That shape is the most
 * generic object on the web and gets filtered as chrome before it is read. What
 * makes this worth putting on screen is that it knows which section is in view
 * and offers the draft written for that section: "the deepagents bug you
 * reported" while the bug is on screen, "your eval suite" while the suite is.
 * Same machinery the corpus already carries, finally connected to something.
 *
 * It hides itself inside the contact section, because a reader who has arrived
 * at the real thing does not need a shortcut to it.
 */
const CONTEXTS: Record<string, { context: ReachContext; about: string }> = {
  opensource: { context: "opensource", about: "the LangChain fix" },
  measured: { context: "measured", about: "the eval suite" },
  approach: { context: "approach", about: "how retrieval works here" },
  work: { context: "work", about: "his work at Questrom" },
  research: { context: "research", about: "the paper" },
  proof: { context: "credentials", about: "his certifications" },
};

export default function ReachDock({
  email,
  site,
  linkedin,
  resumeHref,
}: {
  email: string;
  site: string;
  linkedin: string;
  resumeHref: string;
}) {
  const [at, setAt] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("main > section[id]")];
    if (sections.length === 0) return;

    /*
     * The section occupying the middle of the viewport wins.
     *
     * Picking the first intersecting section makes the label flip on every
     * boundary while two are on screen at once, which reads as a twitch rather
     * than as a change. A single line across the middle is only ever inside one
     * section, so the label changes once per section and stays put.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          if (id === "contact") {
            setHidden(true);
            continue;
          }
          setHidden(false);
          if (CONTEXTS[id]) setAt(id);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );

    for (const s of sections) observer.observe(s);
    return () => observer.disconnect();
  }, []);

  const here = at ? CONTEXTS[at] : null;
  const context: ReachContext = here?.context ?? "general";

  return (
    <div className={styles.dock} data-hidden={hidden || undefined} data-print="hide">
      <nav className={styles.inner} aria-label="Contact">
        <a
          className={styles.primary}
          href={mailtoLink(email, site, context)}
          onClick={() => track("contact", `dock-${context}`)}
        >
          <MailMark />
          <span className={styles.label}>
            Email him
            {/* The specific thing, when there is one. A generic label on a
                persistent bar is the definition of chrome. */}
            {here ? <span className={styles.about}> about {here.about}</span> : null}
          </span>
          <span className={styles.hint} aria-hidden="true">
            draft written
          </span>
        </a>

        <SearchKey />
        <MotionSwitch />

        <a
          className={styles.side}
          href={resumeHref}
          download
          onClick={() => track("contact", "dock-resume")}
        >
          Résumé
        </a>

        <a
          className={styles.side}
          href={linkedin}
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn profile"
          onClick={() => track("contact", "dock-linkedin")}
        >
          <LinkedInMark size={14} />
          <span className={styles.sideLabel}>LinkedIn</span>
        </a>
      </nav>
    </div>
  );
}

/**
 * The command palette, findable. It has opened on Cmd/Ctrl+K since it shipped
 * and nothing on the page said so; a shortcut nobody can see is a feature only
 * its author uses. The key is shown for the reader's platform after mount (the
 * server cannot know it). Hidden where there is no keyboard to press it on.
 */
function SearchKey() {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  return (
    <button
      type="button"
      className={`${styles.side} ${styles.search}`}
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      onClick={() =>
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: mac, ctrlKey: !mac, bubbles: true }))
      }
    >
      Search
      <kbd className={styles.kbd}>{mac ? "\u2318K" : "Ctrl K"}</kbd>
    </button>
  );
}

/**
 * The reader's own motion choice. The film, the video loops and every
 * animation follow the OS reduced-motion setting by default; this flips it for
 * this site only and remembers it (FilmBoot applies it before the next paint,
 * so the page reloads once). With Reduce Motion on in macOS nothing moved
 * and there was no way to see it.
 */
function MotionSwitch() {
  const [moving, setMoving] = useState<boolean | null>(null);
  useEffect(() => setMoving(!reducedMotion()), []);

  return (
    <button
      type="button"
      className={styles.side}
      aria-pressed={moving ?? undefined}
      onClick={() => {
        try {
          localStorage.setItem("motion", moving ? "reduced" : "allowed");
        } catch {
          return;
        }
        location.reload();
      }}
    >
      {moving === false ? "Motion off" : "Motion on"}
    </button>
  );
}
