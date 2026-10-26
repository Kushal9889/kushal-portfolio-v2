/**
 * Which chapter a retrieved section is shown in.
 *
 * The agent cites sections of `content/facts.md`; the stage renders chapters.
 * This is the one map between them, so "Show me" can put the reader in front of
 * the evidence the answer was drawn from rather than describing where it is.
 *
 * Sections that no chapter renders (who he is, skills, availability, work
 * authorisation) are absent on purpose: a button that leads nowhere, or that
 * pushes the reader toward the contact chapter, is worse than no button.
 */
const MAP: [test: RegExp, anchor: string][] = [
  [/questrom|boston university/i, "work-questrom"],
  [/img systems/i, "work-img"],
  [/growaza/i, "work-growaza"],
  [/open source|langchain|deepagents/i, "bug"],
  [/this site|built/i, "built"],
  [/publication|paper|ieee|igi/i, "research"],
  [/certification|credential|nvidia|coursera/i, "credentials"],
  [/education|achievement|jee|codechef|bitbyte|tarang/i, "beyond"],
  [/measured|eval/i, "measured"],
];

/** The anchor for a cited section title, or null when no chapter shows it. */
export function chapterFor(section: string) {
  return MAP.find(([test]) => test.test(section))?.[1] ?? null;
}

/** The chapter's own name, for the button's label. */
export function chapterName(anchor: string) {
  if (anchor.startsWith("work-")) return "Work";
  return anchor.charAt(0).toUpperCase() + anchor.slice(1);
}
