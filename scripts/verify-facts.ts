import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent, loadCertifications } from "../lib/content";
import { SUBJECT, OPENER } from "../lib/reach";
import evals from "../content/evals.json";
import index from "../lib/agent/index.json";

/**
 * Guards the single source of truth.
 *
 * The previous site kept every fact twice, once in the retrieval corpus and once
 * inline in a component, and the two had already drifted: one claimed a
 * technology the other did not, and the résumé disagreed with both. This checks
 * that the page can only render what the corpus contains.
 */

const REQUIRED_SECTIONS = [
  "Who he is",
  "What he is good at",
  "Boston University, Questrom Computational Lab",
  "IMG Systems",
  "Growaza",
  "BU Life AI",
  "Open source, LangChain deepagents",
  "Certifications",
  "Education",
  "Publications",
  "Achievements",
  "Availability",
  "Work authorisation",
  "This site",
];

const { profile, sections } = loadContent();
const titles = new Set(sections.map((s) => s.title));
const problems: string[] = [];

for (const title of REQUIRED_SECTIONS) {
  if (!titles.has(title)) problems.push(`missing section: "${title}"`);
}

for (const key of ["name", "role", "tagline", "email", "linkedin", "github", "site"]) {
  if (!profile[key]) problems.push(`missing frontmatter: ${key}`);
}

const featured = loadCertifications().filter((c) => c.featured);
if (featured.length !== 1) {
  problems.push(`expected exactly one featured certification, found ${featured.length}`);
}
if (featured[0] && !featured[0].url) {
  problems.push("featured certification has no verification URL");
}

// Claims are only worth making if a reader can check them, so a standalone
// credential without a link is treated as incomplete rather than acceptable.
// A program is exempt: its components carry the links, and an unlinked component
// is a course not yet finished rather than an unverifiable claim.
for (const c of loadCertifications()) {
  if (c.kind !== "program" && !c.url) problems.push(`certification "${c.name}" has no URL`);
  if (c.kind === "program" && !c.components?.length) {
    problems.push(`program "${c.name}" lists no components`);
  }
}

// A stack entry is the name of a technology. When a sentence leaks into the
// list, the row renders prose between rules and reads as broken; this caught
// exactly that after the extraction was added.
for (const s2 of sections) {
  for (const tech of s2.stack) {
    if (tech.length > 24 || /[.]/.test(tech.replace(/^(Node|Next)\.js$/, ""))) {
      problems.push(`"${s2.title}" stack entry looks like prose: "${tech}"`);
    }
  }
}

// The em-dash rate is the most reliable single tell of machine-written prose.
// Human baseline sits near 3 per thousand words; generated copy runs three times
// that. This keeps the corpus on the human side of the line.
// Includes the drafts in lib/reach.ts. Those strings are prose a stranger reads
// in their own inbox, which makes them the single most exposed copy on the site,
// and they sat outside every gate that governs the corpus.
const prose = [
  ...sections.map((s) => s.body),
  ...Object.values(SUBJECT),
  ...Object.values(OPENER),
].join(" ");
const words = prose.split(/\s+/).length;
const emDashes = (prose.match(/—/g) ?? []).length;
const rate = (emDashes / words) * 1000;
if (rate > 2) problems.push(`em-dash rate ${rate.toFixed(2)} per 1000 words (limit 2)`);

console.log(`${sections.length} sections, ${words} words, em-dash rate ${rate.toFixed(2)}/1000`);

/**
 * The eval figures on the page decay whether or not anyone edits them.
 *
 * `content/evals.json` is written by a run and read at build time, so the number
 * is always true of *some* build. What it stops being true of is this one. Thirty
 * days is a warning, sixty is a failure: past that the page is publishing a
 * latency measured against a provider, a model and a corpus that have all moved.
 */
const measuredDays = Math.floor(
  (Date.now() - new Date(evals.measured).getTime()) / 86_400_000,
);
if (measuredDays > 60) {
  problems.push(`evals measured ${measuredDays} days ago; run \`npm run test:evals\``);
} else if (measuredDays > 30) {
  console.warn(`  note: evals measured ${measuredDays} days ago`);
}

/**
 * `lastVerified` is a promise about the corpus, and nothing was keeping it.
 *
 * Editing facts.md without touching the stamp leaves the page claiming a
 * verification date that predates its own content, which is a worse failure than
 * no stamp at all: it is a specific, checkable claim that happens to be false.
 */
try {
  const lastCorpusChange = execFileSync(
    "git",
    ["log", "-1", "--date=short", "--pretty=%ad", "--", "content/"],
    { encoding: "utf8", cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] },
  ).trim();

  if (lastCorpusChange && profile.lastVerified) {
    const drift = Math.floor(
      (new Date(lastCorpusChange).getTime() - new Date(profile.lastVerified).getTime()) /
        86_400_000,
    );
    if (drift > 60) {
      problems.push(
        `content/ last changed ${lastCorpusChange} but lastVerified says ${profile.lastVerified} (${drift} days behind)`,
      );
    }
  }
} catch {
  // Not a git checkout. The stamp is unverifiable here rather than wrong.
}

/**
 * The retrieval index has to be built from the corpus that shipped.
 *
 * An index left over from an earlier corpus answers questions from text the page
 * no longer contains, and it fails silently: the agent gives a fluent answer
 * sourced from a section nobody can find.
 */
if (index.parents.length !== sections.length) {
  problems.push(
    `index has ${index.parents.length} chunks but the corpus has ${sections.length} sections; run \`npm run build:index\``,
  );
}

/**
 * Same count is not same text. A section edited after the last build:index
 * leaves the counts equal and the index quoting words the page no longer has,
 * so compare every section body with the body the index holds. This warns and
 * never fails: the index belongs to the agent track, and a stale one is fixed
 * by rebuilding it there.
 */
const flat = (x: string) => x.replace(/\s+/g, " ").trim();
const staleSections = sections
  .filter((s, i) => {
    // The index puts Role, Stack and Measured lines ahead of the prose, so
    // match paragraph by paragraph rather than the whole body.
    const held = flat(index.parents[i]?.body ?? "");
    return s.body.split(/\n\s*\n/).map(flat).some((para) => para.length > 40 && !held.includes(para));
  })
  .map((s) => s.title);
if (staleSections.length) {
  console.warn(`  note: index text differs from the corpus in ${staleSections.length} section(s): ${staleSections.slice(0, 4).join(", ")}; run \`npm run build:index\``);
}

/**
 * The resume and the corpus have to carry the same vocabulary.
 *
 * A screener matches the resume; a person reads the page; an assistant reads the
 * corpus. When a term is on one and not the others, the candidate who gets
 * shortlisted and the candidate who gets read are different people. The list is
 * every keyword from the resume he supplied, and nothing may be dropped from it
 * to make this pass.
 */
const keywords = readFileSync(join(process.cwd(), "content/resume-keywords.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

// Matched on the bare term as well as the parenthesised expansion, because the
// resume writes "Retrieval-Augmented Generation (RAG)" where the corpus writes
// one or the other in a sentence.
// Whitespace is collapsed before matching. The corpus wraps at 100 columns, so
// "Google\nKickstart" is one term to a reader and two to a substring search;
// without this the gate reports terms that are plainly on the page.
const haystack = [
  prose,
  ...sections.flatMap((s) => s.stack),
  ...sections.flatMap((s) => s.artifacts.map((a) => `${a.kind} ${a.label}`)),
  Object.values(profile).join(" "),
]
  .join(" ")
  .replace(/\s+/g, " ")
  .toLowerCase();

const missing = keywords.filter((k) => {
  const bare = k.replace(/\s*\([^)]*\)/, "").toLowerCase();
  const inner = k.match(/\(([^)]*)\)/)?.[1]?.toLowerCase();
  return !haystack.includes(bare) && !(inner && haystack.includes(inner));
});

if (missing.length) {
  problems.push(
    `${missing.length} resume keywords absent from the corpus: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " ..." : ""}`,
  );
}

// A metric with no source is a number a reader has to take on faith, which is
// the one thing this page is not allowed to ask for. Reported rather than
// failed: the directive is new and the gap should be visible while it closes.
const allMetrics = sections.flatMap((s) => s.metrics);
const sourced = allMetrics.filter((m) => m.source).length;
console.log(
  `${keywords.length} resume keywords checked, ${allMetrics.length} metrics (${sourced} sourced), index ${index.parents.length} chunks`,
);

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
/**
 * Availability decays on a schedule nobody is watching.
 *
 * "Full-time from January 2027" is a strong line until January 2027, and then it
 * quietly becomes evidence that nothing here is maintained. A date is the one
 * kind of claim that can rot without anyone editing the file, so the build fails
 * once it is in the past rather than waiting for a reader to notice.
 */
const availability = profile.available ?? "";
const month = availability.match(
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
);
if (month) {
  const stated = new Date(`${month[1]} 1, ${month[2]}`);
  if (stated < new Date()) {
    problems.push(
      `availability "${availability}" is in the past; update content/facts.md frontmatter`,
    );
  }
}

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log("facts ok");
