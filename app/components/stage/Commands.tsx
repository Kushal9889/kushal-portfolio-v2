"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { applyPalette, palettes } from "@/lib/palettes";
import styles from "./Commands.module.css";

export type CommandLinks = { email: string; resume: string; repo: string; github: string; linkedin: string };

type Command =
  | { key: string; group: string; label: string; hint: string; run: () => void }
  | { key: string; group: string; label: string; hint: string; href: string };

export type CommandsHandle = { open: () => void };

function reach(links: CommandLinks, copied: () => void): Command[] {
  return [
    {
      key: "copy-email",
      group: "Reach him",
      label: "Copy his email address",
      hint: links.email,
      run: () => {
        navigator.clipboard.writeText(links.email).then(
          () => copied(),
          () => undefined,
        );
      },
    },
    {
      key: "mail",
      group: "Reach him",
      label: "Write to him",
      hint: "opens your mail app",
      href: `mailto:${links.email}`,
    },
    {
      key: "linkedin",
      group: "Reach him",
      label: "LinkedIn",
      hint: new URL(links.linkedin).pathname,
      href: links.linkedin,
    },
    { key: "resume", group: "Read", label: "The résumé", hint: "PDF", href: links.resume },
    { key: "github", group: "Read", label: "GitHub", hint: new URL(links.github).pathname, href: links.github },
    { key: "repo", group: "Read", label: "Source for this page", hint: "repository", href: links.repo },
  ];
}

/**
 * The page's command palette, on ⌘K. Every chapter, the agent, and each way to
 * reach him, filtered as you type and run from the keyboard. The agent keeps its
 * own key, `/`, and its own button, so asking a question is never behind a menu.
 *
 * Links are real anchors, so a command that opens something behaves like any
 * other link under the pointer (a middle click opens a tab), and Enter follows
 * the same anchor rather than a second code path.
 */
const Commands = forwardRef<
  CommandsHandle,
  {
    chapters: { id: string; label: string }[];
    links?: CommandLinks;
    onJump: (id: string) => void;
    onAsk: () => void;
  }
>(function Commands({ chapters, links, onJump, onAsk }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = useId();

  useImperativeHandle(ref, () => ({
    open: () => {
      setQuery("");
      setActive(0);
      setCopied(false);
      dialog.current?.showModal();
      requestAnimationFrame(() => input.current?.focus());
    },
  }));

  const close = () => dialog.current?.close();

  const commands = useMemo<Command[]>(
    () => [
      ...chapters.map((c) => ({
        key: `jump-${c.id}`,
        group: "Go to",
        label: c.label,
        hint: "chapter",
        run: () => onJump(c.id),
      })),
      { key: "ask", group: "Ask", label: "Ask the agent about him", hint: "/", run: onAsk },
      ...(links ? reach(links, () => setCopied(true)) : []),
      ...palettes.map((p) => ({
        key: `palette-${p.id}`,
        group: "Palette",
        label: p.label,
        hint: "palette",
        run: () => applyPalette(p.id),
      })),
    ],
    [chapters, links, onJump, onAsk],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.group} ${c.label} ${c.hint}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(shown.length - 1, 0)));
  }, [shown.length]);

  // The active option stays in view as the arrow keys move past the list's edge.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (index: number) => {
    const command = shown[index];
    if (!command) return;
    if ("href" in command) {
      list.current?.querySelector<HTMLAnchorElement>(`[data-index="${index}"]`)?.click();
      close();
      return;
    }
    command.run();
    if (command.key !== "copy-email") close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (shown.length ? (i + 1) % shown.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  };

  let lastGroup = "";

  return (
    <dialog
      ref={dialog}
      className={styles.palette}
      aria-label="Commands"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.field}>
        <label htmlFor={`${id}-q`} className={styles.hidden}>
          Filter commands
        </label>
        <input
          ref={input}
          id={`${id}-q`}
          className={styles.input}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={shown[active] ? `${id}-${shown[active].key}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Go to a chapter, ask, or reach him"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <kbd className={styles.esc}>esc</kbd>
      </div>

      <ul ref={list} id={`${id}-list`} className={styles.list} role="listbox" aria-label="Commands">
        {shown.map((c, i) => {
          const heading = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          const body = (
            <>
              <span className={styles.label}>{c.label}</span>
              <span className={styles.hint}>{c.key === "copy-email" && copied ? "copied" : c.hint}</span>
            </>
          );
          return (
            <li key={c.key} role="presentation">
              {heading && (
                <p className={styles.group} aria-hidden="true">
                  {heading}
                </p>
              )}
              {"href" in c ? (
                <a
                  id={`${id}-${c.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  className={styles.option}
                  href={c.href}
                  tabIndex={-1}
                  onMouseMove={() => setActive(i)}
                  onClick={close}
                >
                  {body}
                </a>
              ) : (
                <div
                  id={`${id}-${c.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  className={styles.option}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li role="presentation" className={styles.empty}>
            Nothing matches &ldquo;{query}&rdquo;. The agent can answer questions about him: press / to ask.
          </li>
        )}
      </ul>
    </dialog>
  );
});

export default Commands;
