"use client";

import { Fragment } from "react";
import { typeset } from "@/lib/typeset";

/**
 * Inline emphasis for the corpus.
 *
 * Four marks, each with one job, so weight stays meaningful:
 *   **bold**        a claim worth stopping on
 *   `code`          an identifier, exactly as it is spelled in the source
 *   [text](url)     external proof a reader can open and check
 *   bare url        the same, when the address itself is the useful part
 *
 * A full markdown renderer would ship a parser for syntax this content does not
 * use. If the notes ever need lists, tables or headings, that is the point to
 * add one.
 *
 * The first sentence of every paragraph is set one step larger and at full ink,
 * and the rest of the paragraph steps back to --ink-soft. Reading only the leads
 * gives a complete pass over the section, which is what someone spending seven
 * seconds actually does. Nothing is hidden and no wording changes: the same
 * paragraph is simply legible at two speeds.
 */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<>"']+)/;
const BOLD = /^\*\*([^*]+)\*\*$/;
const CODE = /^`([^`]+)`$/;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;
const BARE = /^https?:\/\//;

function trimUrl(url: string) {
  return url.replace(BARE, "").replace(/\/$/, "");
}

/**
 * Where the opening sentence ends.
 *
 * The boundary is a full stop followed by a space, which is safe against the
 * decimals and version numbers in this corpus because those have no space after
 * the point. It has to ignore any boundary that falls inside a mark, though:
 * the strongest line in the open-source section is a whole sentence wrapped in
 * bold, and cutting at the stop inside it would split `**` from its closing pair
 * and print the asterisks.
 */
function leadEnd(para: string) {
  const marks: Array<[number, number]> = [];
  for (const m of para.matchAll(new RegExp(TOKEN, "g"))) {
    marks.push([m.index, m.index + m[0].length]);
  }

  for (const m of para.matchAll(/[.!?]\s+/g)) {
    const stop = m.index;
    const enclosing = marks.find(([a, b]) => stop > a && stop < b);
    // A mark that closes the sentence is part of the lead, so the lead runs to
    // the end of the mark rather than stopping inside it.
    if (enclosing) {
      if (enclosing[1] >= para.length - 1) return para.length;
      if (stop === enclosing[1] - 3) return enclosing[1];
      continue;
    }
    return stop + 1;
  }
  return para.length;
}

function render(text: string, keyPrefix: string, claimHref?: string) {
  return text.split(new RegExp(TOKEN, "g")).map((part, j) => {
    const key = `${keyPrefix}-${j}`;

    const bold = part.match(BOLD);
    if (bold) {
      // A claim is a link when its section names a witness: the one mark here
      // that says "check this".
      return claimHref ? (
        <strong key={key}>
          <a href={claimHref} target="_blank" rel="noreferrer">
            {typeset(bold[1])}
          </a>
        </strong>
      ) : (
        <strong key={key}>{typeset(bold[1])}</strong>
      );
    }

    const code = part.match(CODE);
    if (code) return <code key={key}>{code[1]}</code>;

    const link = part.match(LINK);
    if (link)
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );

    if (BARE.test(part))
      return (
        <a key={key} href={part} target="_blank" rel="noreferrer">
          {trimUrl(part)}
        </a>
      );

    return <Fragment key={key}>{typeset(part)}</Fragment>;
  });
}

/**
 * Closed by default, everywhere, until the reader asks for more.
 *
 * The detail is always in the markup regardless of state: `hidden` is not
 * used and nothing is fetched on expand, so a crawler indexes the closed
 * content and `<details>` carries the open/closed state to assistive
 * software without any of it being reimplemented here. Native behaviour also
 * means there is nothing to wire up for a reader who opens a section
 * themselves -- the browser already remembers that across a resize; no
 * effect, no ref, no width check needed.
 */
function Foldable({ children, label, topic }: { children: React.ReactNode; label: string; topic?: string }) {
  return (
    <details className="more">
      {/* The subject is on screen, not only in the accessible name (WCAG 2.5.3):
          a page of bare "Read more"s reads the same everywhere. */}
      <summary>
        <span className="more-open">{topic ? `${label} about ${topic}` : label}</span>
        <span className="more-close">Show less</span>
      </summary>
      {children}
    </details>
  );
}

/**
 * Paragraphs that render open before the fold.
 *
 * One is what shipped, and it hid the reading face; see the seam comment below.
 */
const OPEN = 2;

export default function Prose({
  body,
  className,
  claimHref,
  phoneOpen,
  topic,
}: {
  body: string;
  className?: string;
  claimHref?: string;
  /** Paragraphs left open on a phone, where the seam moves up. Desktop keeps OPEN. */
  phoneOpen?: number;
  /** Names the folded text on screen, so several folds do not all read "Read more". */
  topic?: string;
}) {
  const paras = body.split(/\n{2,}/);

  const render_ = (para: string, i: number) => {
    const cut = leadEnd(para);
    const lead = para.slice(0, cut);
    const rest = para.slice(cut);
    return (
      <p key={i}>
        <span className="lead">{render(lead, `l${i}`, claimHref)}</span>
        {rest && render(rest, `r${i}`, claimHref)}
      </p>
    );
  };

  const root = className ? `prose ${className}` : "prose";

  // A phone seam above the desktop one. The paragraphs between the two seams
  // render twice: open for the desktop, inside the fold for the phone, and
  // CSS shows exactly one copy, so neither reader loses a sentence.
  if (phoneOpen !== undefined && paras.length > phoneOpen && phoneOpen < OPEN) {
    const seam = Math.min(OPEN, paras.length);
    const between = paras.slice(phoneOpen, seam);
    const after = paras.slice(seam);
    return (
      <div className={root}>
        {paras.slice(0, phoneOpen).map(render_)}
        <div data-desk-only>{between.map((p, i) => render_(p, i + phoneOpen))}</div>
        {after.length > 0 && (
          <div data-desk-only>
            <Foldable label="Read more" topic={topic}>{after.map((p, i) => render_(p, i + seam))}</Foldable>
          </div>
        )}
        <div data-phone-only>
          <Foldable label="Read more" topic={topic}>
            {paras.slice(phoneOpen).map((p, i) => render_(p, i + phoneOpen))}
          </Foldable>
        </div>
      </div>
    );
  }

  // Two paragraphs or fewer have no seam worth folding at.
  if (paras.length <= OPEN) {
    return <div className={root}>{paras.map(render_)}</div>;
  }

  // Where the seam goes, and why it moved.
  //
  // It used to fall after the first paragraph, on the argument that the opener
  // carries the claim and the rest is evidence for it. That reasoning is sound
  // and the placement still cost the page a typeface.
  //
  // Three voices ship here and one of them, the reading serif, sets prose and
  // nothing else. Folding at paragraph two meant that on first paint almost
  // every serif line on the page was inside a closed `details`. The page argues
  // that paper means written, and it was making that argument in a face the
  // reader could not see until they opened something.
  //
  // Two paragraphs open is enough to establish the voice in every section and
  // still short enough that no section becomes a wall.
  const open = paras.slice(0, OPEN);
  const folded = paras.slice(OPEN);

  return (
    <div className={root}>
      {open.map(render_)}
      <Foldable label="Read more" topic={topic}>
        {folded.map((p, i) => render_(p, i + OPEN))}
      </Foldable>
    </div>
  );
}
