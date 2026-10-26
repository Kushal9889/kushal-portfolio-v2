import { loadContent } from "../content";
import type { Offer } from "./offers";
import type { Chunk } from "./retrieve";

const { sections, profile } = loadContent();

/**
 * What the reader can do next, computed rather than generated.
 *
 * A model asked to suggest follow-ups will suggest good ones and will also
 * suggest questions the corpus cannot answer, which is worse than suggesting
 * nothing: the reader clicks, gets "that is outside what I cover", and stops
 * trusting the box. So none of this comes from a model.
 *
 * Two sources, both already in the corpus and both already checked by a build
 * gate. `artifacts` are openable proof -- a merged pull request, a DOI, a
 * repository -- and every URL in that list is resolved by `npm run verify:links`
 * on each build, so an offer can never point at a dead page. `asks` are
 * questions written by hand beside the section that answers them, so accepting
 * one is guaranteed to land somewhere the retriever can reach.
 *
 * The cost of this is that the offers are only as good as the corpus. That is
 * the correct cost: it makes them true.
 */
/**
 * Reads as an offer rather than a link, because it is answering a question.
 *
 * Distinct per artifact, not per category. Both publications first produced
 * "Want to read the paper?" and the reader was shown the same sentence twice
 * pointing at two different things -- an IEEE paper and an IGI Global book
 * chapter -- which is indistinguishable from a bug.
 */
function openLabel(kind: string, label: string): string {
  const k = kind.toLowerCase();
  if (k.includes("fix") || k.includes("pull")) return "Want to see the merged fix?";
  if (k.includes("issue")) return "Want to see the issue he filed?";
  if (k.includes("ieee")) return "Want to read the IEEE paper?";
  if (k.includes("igi")) return "Want to see the book chapter?";
  if (/repo|source|code/.test(k)) return "Want to see the repository?";
  return `Want to see ${label.length > 44 ? label.slice(0, 41).trimEnd() + "..." : label}?`;
}

/**
 * Sections that are about code but ship no artifact of their own.
 *
 * Most of the work has no public repository -- it was done inside a company, or
 * it is a paper rather than a program. Offering "see the code" there would be a
 * promise the corpus cannot keep. But a reader who has just been told about a
 * pipeline or a platform is asking a code question, and there is something real
 * to show them: the repository for the page they are reading. It is the one
 * piece of his code anybody can open, and it is the thing the answer is running
 * on.
 */
const CODE = /\b(pipeline|platform|service|api|endpoint|graph|agent|retriev|deploy|container|schema|backend|frontend|orchestrat)\w*/i;

export function offersFor(chunks: Chunk[], limit = 3): Offer[] {
  const offers: Offer[] = [];
  const seen = new Set<string>();

  const picked = chunks
    .map((c) => sections.find((s) => s.title === c.title))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  /*
   * Concrete proof first, and only from the sections the answer is actually
   * about.
   *
   * Retrieval returns up to four sections and the last two are supporting
   * context, not the subject. Reading artifacts from all four offered "Want to
   * read the IEEE paper?" under an answer about a document-parsing pipeline at
   * IMG Systems, because Publications happened to rank fourth. An offer that
   * changes the subject is worse than no offer: it reads as the page trying to
   * sell something rather than answering.
   */
  const SUBJECT = 2;
  for (const s of picked.slice(0, SUBJECT)) {
    for (const a of s.artifacts) {
      const label = openLabel(a.kind, a.label);
      if (seen.has(a.url) || seen.has(label)) continue;
      seen.add(a.url);
      seen.add(label);
      offers.push({ kind: "open", label, url: a.url, what: a.label });
    }
  }

  // Nothing openable, but the answer was about code. Show the code that is
  // running underneath the answer. Placed before the authored questions so a
  // code question ends in code rather than in more prose.
  if (!offers.length && profile.repo && picked.some((s) => CODE.test(s.body))) {
    offers.push({
      kind: "open",
      label: "Want to see the code for this page?",
      url: profile.repo,
      what: profile.repo.replace("https://github.com/", ""),
    });
  }

  // Then the questions written beside the sections that answer them.
  for (const s of picked) {
    for (const q of s.asks) {
      if (seen.has(q.question)) continue;
      seen.add(q.question);
      offers.push({ kind: "ask", label: q.question, question: q.question });
    }
  }

  return offers.slice(0, limit);
}

/*
 * Re-exported so callers have one import for this feature. The definitions live
 * in ./offers because a "use client" component needs them and this file reads
 * the corpus off disk.
 */
export type { Offer };
export { isAcceptance } from "./offers";
