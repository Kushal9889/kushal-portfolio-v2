"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Palette.module.css";
import { track } from "@/lib/analytics";
import { ASK_EVENT } from "./Agent";

/**
 * A palette row.
 *
 * `kind` is a scanning aid, not decoration. Fourteen rows of label-and-hint read
 * as one undifferentiated list, and a reader hunting for the way out of the
 * page has to read every line to find it. Four glyphs sort them into what they
 * do -- move you, copy something, open something elsewhere, change the page --
 * which is the distinction a reader is actually making.
 */
type Kind = "jump" | "copy" | "open" | "toggle";

type Command = { label: string; hint: string; kind: Kind; run: () => void };

const GLYPH: Record<Kind, string> = {
  jump: "\u2192",
  copy: "\u29C9",
  open: "\u2197",
  toggle: "\u25E7",
};

/**
 * Command palette on Cmd/Ctrl+K.
 *
 * Six sections with no navigation is a scroll trap, and a fixed nav bar would
 * spend permanent screen space on something used once. This costs nothing until
 * summoned, and it is the interaction an engineer reaching for Cmd+K expects to
 * find. The jump links below the fold cover everyone who does not.
 */
export default function Palette({
  email,
  github,
  repo,
  asks,
}: {
  email: string;
  github: string;
  repo: string;
  /** Questions the corpus marks as answerable, for the copy-out command. */
  asks: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const inputRef = useRef<HTMLInputElement>(null);
  const previous = useRef<HTMLElement | null>(null);

  const go = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const commands: Command[] = [
    // The agent lives in the hero, not in a section of its own. This pointed at
    // an anchor that was removed when it moved.
    {
      kind: "jump",
      label: "Ask the agent",
      hint: "top of page",
      run: () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => document.querySelector<HTMLInputElement>("#ask")?.focus(), 400);
      },
    },
    /* Every section, in the order the page reads them.
     *
     * Two were missing: "How this is measured" and "How he works" had no jump
     * at all, so a palette advertising itself as "jump anywhere" could not
     * reach the section holding the eval suite or the one holding the compiled
     * graph. The labels match the headings, because a reader who has seen the
     * page is looking for the words they saw. */
    { kind: "jump", label: "A bug in LangChain", hint: "section", run: go("opensource") },
    { kind: "jump", label: "How this is measured", hint: "section", run: go("measured") },
    { kind: "jump", label: "How he works", hint: "section", run: go("approach") },
    { kind: "jump", label: "Work", hint: "section", run: go("work") },
    { kind: "jump", label: "Research", hint: "section", run: go("research") },
    { kind: "jump", label: "What else checks out", hint: "section", run: go("proof") },
    { kind: "jump", label: "Get in touch", hint: "section", run: go("contact") },
    {
      kind: "copy",
      label: "Copy email address",
      hint: email,
      run: () => {
        navigator.clipboard?.writeText(email);
        track("contact", "palette-email");
      },
    },
    {
      // Strips the page to headings, metrics and links for a reader who has
      // seven seconds rather than two minutes. Toggled rather than a separate
      // route so nothing has to be maintained twice.
      // Was "Recruiter mode". Naming the reader's category back at them is a
      // guess about who they are, and it is wrong for the engineer on the
      // hiring panel who is the other half of this audience. Say what it does.
      kind: "toggle",
      label: "Condense this page",
      hint: "headings, metrics and links only",
      run: () => document.documentElement.classList.toggle("condensed"),
    },
    { kind: "open", label: "Print or save as PDF", hint: "uses the print stylesheet", run: () => window.print() },
    { kind: "open", label: "Open the source for this page", hint: "repo", run: () => window.open(repo, "_blank") },
    { kind: "open", label: "Open GitHub profile", hint: "external", run: () => window.open(github, "_blank") },
    // The prop feeding "Open GitHub" used to be called `resume`, from a time
    // when no resume existed. There is one now, so it gets its own entry.
    {
      /* The dark scheme has existed in the stylesheet since it was written and
         nothing has ever been able to reach it: `data-theme` was set by no code
         anywhere in the repo, so eleven tokens and their measured commentary
         shipped dead on every page load. The ADR keeps light unconditional and
         ignores the system preference on purpose, which makes a switch the only
         honest way to offer the other half. */
      kind: "toggle",
      label: theme === "dark" ? "Switch to light" : "Switch to dark",
      hint: theme === "dark" ? "paper and ink" : "console ground everywhere",
      run: () => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          // Private mode. The choice still applies for this page view.
        }
        setTheme(next);
      },
    },
    {
      // Hands an interviewer the prep list rather than making them invent one.
      // The questions are written in the corpus beside the sections that answer
      // them, so this cannot drift from what the agent can actually handle.
      kind: "copy",
      label: "Copy the questions worth asking",
      hint: `${asks.length} from the corpus`,
      run: () => {
        navigator.clipboard?.writeText(asks.map((a) => `- ${a}`).join("\n"));
        track("contact", "palette-asks");
      },
    },
    {
      // Was "Download resume", and it was the only path on the page that forced
      // a file onto someone who had asked to read one. The contact block opens
      // the PDF in the browser, which is what a reader deciding whether to keep
      // reading actually wants; the viewer has its own download button for the
      // reader who wants the file. Both paths now do the same thing.
      kind: "open",
      label: "Open resume",
      hint: "pdf, opens in the browser",
      run: () => window.open("/kushal-gaddamwar-resume.pdf", "_blank", "noopener"),
    },
  ];

  const matches = commands.filter((c) =>
    c.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Read after mount rather than rendered on the server: the attribute is set
  // by the pre-hydration script from storage, which the server cannot know.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, [open]);

  // Focus moves into the dialog on open and returns to wherever it came from on
  // close, so a keyboard user is never dropped at the top of the document.
  useEffect(() => {
    if (open) {
      previous.current = document.activeElement as HTMLElement;
      setQuery("");
      setCursor(0);
      inputRef.current?.focus();
    } else {
      previous.current?.focus();
    }

    // Published on the root so the printed keys next to the agent depress when
    // the real shortcut is used. The hint then demonstrates itself rather than
    // describing something happening elsewhere on the page.
    document.documentElement.dataset.palette = open ? "open" : "closed";
  }, [open]);

  if (!open) return null;

  function choose(index: number) {
    matches[index]?.run();
    setOpen(false);
  }

  return (
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          placeholder="Jump to, or ask a question"
          aria-label="Jump to, or ask a question"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              // A palette that only filters commands throws away the most
              // natural thing someone types into a box on this page. A trailing
              // question mark is unambiguous: no command label contains one.
              if (query.trim().endsWith("?")) {
                window.dispatchEvent(
                  new CustomEvent<string>(ASK_EVENT, { detail: query.trim() }),
                );
                setOpen(false);
                return;
              }
              choose(cursor);
            }
          }}
        />
        <ul className={styles.list}>
          {matches.map((c, i) => (
            <li key={c.label}>
              <button
                className={i === cursor ? `${styles.item} ${styles.on}` : styles.item}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
              >
                <span className={styles.glyph} aria-hidden="true" data-kind={c.kind}>
                  {GLYPH[c.kind]}
                </span>
                <span>{c.label}</span>
                <span className={styles.hint}>{c.hint}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className={styles.empty}>
              {query.trim().endsWith("?")
                ? "Press Enter to ask the agent this."
                : "Nothing matches that. End with a question mark to ask the agent instead."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
