import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * The corpus folder. `AGENT_CORPUS` points the whole agent at another person's
 * facts (a folder holding facts.md, optional certifications.json and its own
 * index.json), which is how the fixtures in tests/fixtures prove the retrieval
 * code holds nothing specific to this corpus.
 */
export const CONTENT_DIR = join(process.cwd(), process.env.AGENT_CORPUS ?? "content");

export type Metric = { value: string; label: string; source?: string };

/**
 * A question the corpus can already answer well, marked where it is answerable.
 *
 * A reader who does not know what to ask asks nothing, and the openers in the
 * hero can only carry three. These sit at the close of the section that answers
 * them, so the prompt appears exactly where the curiosity does.
 */
/** One tile of the evidence wall: a short label, what it is for a screen reader,
 *  and where a reader can check it (a URL, or the resume PDF). */
export type Badge = { group: string; label: string; name: string; href: string; mark?: string };
export type Ask = { question: string; source: string };

/** A failure this codebase shipped, and the thing that now stops it returning. */
export type Defect = { symptom: string; guard: string };

/**
 * A public thing a reader can open, with the state it is actually in upstream.
 *
 * Kept in the corpus beside the prose rather than in a component, for the same
 * reason the metrics are: a URL written into a component is a URL the link
 * checker never sees, and an artifact section whose links have rotted is worse
 * than one that never claimed them.
 */
export type Artifact = { kind: string; state: string; label: string; url: string };

export type Section = {
  /** The `##` heading, verbatim. Doubles as the chunk id for retrieval. */
  title: string;
  body: string;
  /** `facts` for the resume corpus, or the note filename for authored depth. */
  source: string;
  /** Quantified outcomes, lifted out of the prose so they survive a scan. */
  metrics: Metric[];
  /** Technologies, lifted out for the same reason: a reader scans for these. */
  stack: string[];
  /** Openable proof, rendered as its own row rather than buried in a sentence. */
  artifacts: Artifact[];
  /** Questions this section answers, offered to the agent in one click. */
  asks: Ask[];
  /** Failures, each paired with the test or gate that holds it down. */
  defects: Defect[];
  /** "Role: ... " line. Rendered as the section heading, so it is kept out of the
   *  prose to avoid printing it twice, and folded back into the retrieval text. */
  role: string;
  /** The Role line, split. Components rendered these as string literals until
   *  2026-08-20, which is exactly the duplication hard rule 1 exists to stop:
   *  editing a date in the corpus left the heading showing the old one. */
  roleParts: { title: string; dates: string; location: string };
  /** Where this section's bold claims point: a URL, or `resume` (the PDF). Every
   *  bold claim on the page is a link, so a section with bold text needs one. */
  claim?: string;
  /** Tiles for the evidence wall, from `@badge` lines. */
  badges: Badge[];
  /** Stable id from `@id`, else a slug of the title. Evals reference this, so a renamed heading does not break them. */
  id: string;
  /** From `@kind` (docs/facts-format.md). `private` sections are answered by a fixed route and never retrieved. */
  kind?: string;
  /** Other names a reader may type for this section's subject, from `@alias a, b`. */
  aliases: string[];
};

export type Profile = Record<string, string>;

/**
 * Frontmatter is a flat key/value block, so a YAML parser would be a dependency
 * for one regex. Values may be quoted to protect a leading `+` or `#`.
 */
function parseFrontmatter(raw: string): { profile: Profile; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { profile: {}, body: raw };

  const profile: Profile = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) profile[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { profile, body: raw.slice(match[0].length) };
}

/**
 * Split on `##` headings. Header-aware chunking beats fixed-size windows here
 * because the corpus is authored prose with meaningful headings: a chunk ends up
 * being one coherent topic rather than an arbitrary 1000 characters that can cut
 * a sentence, or worse, separate a claim from the number that supports it.
 */
/**
 * "AI Engineer, Graduate Researcher. May 2026 to present. Boston, MA."
 * becomes title, dates and location.
 *
 * Split on sentence boundaries rather than commas, because both the title and
 * the location contain commas and a comma split puts "Graduate Researcher" in
 * the date field. The middle clause is whichever piece carries a year; anything
 * after it is location. A Role line that does not match simply yields empty
 * strings, so a malformed corpus degrades to a missing date rather than a
 * wrong one.
 */
function splitRole(role: string) {
  const empty = { title: "", dates: "", location: "" };
  if (!role) return empty;

  const parts = role
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return empty;

  const dateAt = parts.findIndex((p) => /\b(19|20)\d{2}\b|present/i.test(p));
  if (dateAt < 0) return { title: parts[0], dates: "", location: parts.slice(1).join(", ") };

  return {
    title: parts.slice(0, dateAt).join(". "),
    dates: parts[dateAt],
    location: parts.slice(dateAt + 1).join(", "),
  };
}

function splitSections(body: string, source: string): Section[] {
  return body
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const nl = block.indexOf("\n");
      const rest = block.slice(nl + 1);

      // `@metric value | label` lines are pulled out of the body. Keeping them
      // in the corpus rather than in a component means the page and the agent
      // read the same numbers, which is the only way they cannot disagree.
      const metrics: Metric[] = [];
      const artifacts: Artifact[] = [];
      const asks: Ask[] = [];
      const defects: Defect[] = [];
      let stack: string[] = [];
      let role = "";
      let claim: string | undefined;
      const badges: Badge[] = [];
      let id: string | undefined;
      let kind: string | undefined;
      const aliases: string[] = [];

      // Line-oriented directives are pulled out before the prose is assembled.
      // Stack and Role wrap in the source, so a continuation line is any line
      // that follows without a blank line between; matching only the first would
      // truncate the list and leave the remainder stranded as a paragraph.
      const kept: string[] = [];
      const lines = rest.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // `@metric value | label` or `value | label | source`, where source is a
        // URL or the literal `resume`. Optional rather than required: the audit
        // reports how many carry one, so the gap is visible without a bulk edit
        // turning every line into a citation exercise at once.
        const metric = line.match(/^@metric\s+(.+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(\S+)\s*)?$/);
        if (metric) {
          metrics.push({
            value: metric[1].trim(),
            label: metric[2].trim(),
            ...(metric[3] ? { source: metric[3].trim() } : {}),
          });
          continue;
        }

        // `@ask question | where the answer lives`. The second field is the
        // section title, so a seed can point at a section other than its own.
        const seed = line.match(/^@ask\s+(.+?)\s*\|\s*(.+)$/);
        if (seed) {
          asks.push({ question: seed[1].trim(), source: seed[2].trim() });
          continue;
        }

        // `@defect symptom | guard`. Paired on one line on purpose: a defect
        // without the thing that now catches it is an apology, and a guard
        // without the defect it was written for is a boast.
        const defect = line.match(/^@defect\s+(.+?)\s*\|\s*(.+)$/);
        if (defect) {
          defects.push({ symptom: defect[1].trim(), guard: defect[2].trim() });
          continue;
        }

        // `@artifact kind | state | label | url`. State is written out rather
        // than inferred, because "merged" and "closed" look identical to a
        // parser and mean opposite things to a reader.
        const artifact = line.match(/^@artifact\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\S+)$/);
        if (artifact) {
          artifacts.push({
            kind: artifact[1].trim(),
            state: artifact[2].trim(),
            label: artifact[3].trim(),
            url: artifact[4].trim(),
          });
          continue;
        }

        // `@badge group | label | name | url or resume | optional brand mark`.
        const badge = line.match(/^@badge\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\S+)(?:\s*\|\s*(.+?))?\s*$/);
        if (badge) {
          badges.push({
            group: badge[1],
            label: badge[2],
            name: badge[3],
            href: badge[4] === "resume" ? "/kushal-gaddamwar-resume.pdf" : badge[4],
            ...(badge[5] ? { mark: badge[5] } : {}),
          });
          continue;
        }

        // `@source url` or `@source resume`: the witness for every bold claim in
        // this section (strict rule, 2026-10-02).
        const witness = line.match(/^@source\s+(\S+)\s*$/);
        if (witness) {
          claim = witness[1] === "resume" ? "/kushal-gaddamwar-resume.pdf" : witness[1];
          continue;
        }

        const tag = line.match(/^@(id|kind|alias)\s+(.+?)\s*$/);
        if (tag) {
          if (tag[1] === "id") id = tag[2];
          else if (tag[1] === "kind") kind = tag[2].toLowerCase();
          else aliases.push(...tag[2].split(",").map((a) => a.trim()).filter(Boolean));
          continue;
        }

        const directive = line.match(/^(Stack|Role):\s*(.+)$/);
        if (directive) {
          let value = directive[2];
          while (i + 1 < lines.length && lines[i + 1].trim() && !/^(@|\w+:)/.test(lines[i + 1])) {
            value += " " + lines[++i].trim();
          }
          if (directive[1] === "Role") {
            role = value.trim();
          } else {
            stack = value
              .replace(/\.$/, "")
              .split(/,\s*(?![^(]*\))/)
              .map((t) => t.trim())
              .filter(Boolean);
          }
          continue;
        }

        kept.push(line);
      }

      const body = kept.join("\n");
      const title = block.slice(0, nl).trim();

      return {
        title,
        id: id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        ...(kind ? { kind } : {}),
        aliases,
        body: body.trim(),
        source,
        metrics,
        stack,
        artifacts,
        asks,
        defects,
        role,
        roleParts: splitRole(role),
        ...(claim ? { claim } : {}),
        badges,
      };
    })
    .filter((s) => s.body.length > 0);
}

let cache: { profile: Profile; sections: Section[] } | null = null;

export function loadContent() {
  if (cache) return cache;

  const raw = readFileSync(join(CONTENT_DIR, "facts.md"), "utf8");
  const { profile, body } = parseFrontmatter(raw);
  const sections = splitSections(body, "facts");

  // Authored engineering notes. Optional: the site is complete without them,
  // they just give the agent depth on "how do you think" questions that a
  // resume structurally cannot answer.
  const notesDir = join(CONTENT_DIR, "notes");
  if (existsSync(notesDir)) {
    for (const file of readdirSync(notesDir).filter((f) => f.endsWith(".md"))) {
      const note = readFileSync(join(notesDir, file), "utf8");
      const parsed = parseFrontmatter(note);
      sections.push(...splitSections(parsed.body, file.replace(/\.md$/, "")));
    }
  }

  cache = { profile, sections };
  return cache;
}

export function section(title: string): Section {
  const found = loadContent().sections.find((s) => s.title === title);
  if (!found) {
    // Loud on purpose. A missing section means the page and the corpus have
    // drifted, which is the failure that put contradictory facts on the last site.
    throw new Error(`content: no section titled "${title}" in facts.md`);
  }
  return found;
}

export type Certification = {
  id: string;
  name: string;
  short?: string;
  issuer: string;
  year: number;
  url: string | null;
  kind: string;
  featured: boolean;
  /** Shown as one of the two certificate cards, with its badge image. */
  pinned?: boolean;
  image?: string;
  /** The plate colour behind the artwork when it is drawn as a 3D medallion. */
  plate?: string;
  why?: string;
  components?: { name: string; url: string | null }[];
};

/**
 * Progress through a multi-course program, derived from which components carry a
 * verification link rather than from a separate counter. A hand-kept number and
 * a list of links are two sources for one fact, and they drift the first time
 * only one of them gets updated.
 */
export function progress(c: Certification) {
  if (!c.components) return null;
  return { earned: c.components.filter((x) => x.url).length, total: c.components.length };
}

export function loadCertifications(): Certification[] {
  const path = join(CONTENT_DIR, "certifications.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).certifications;
}

/** Every external URL the site renders, for the link checker. */
export function allLinks(): string[] {
  const { profile, sections } = loadContent();
  const found = new Set<string>();

  for (const value of Object.values(profile)) {
    if (value.startsWith("http")) found.add(value);
  }
  for (const s of sections) {
    for (const m of s.body.matchAll(/https?:\/\/[^\s)<>"']+/g)) {
      found.add(m[0].replace(/[.,]$/, ""));
    }
    // Artifact URLs are stripped out of the body by the parser, so scanning the
    // prose alone would quietly stop checking the strongest links on the site.
    for (const a of s.artifacts) found.add(a.url);
  }
  for (const c of loadCertifications()) {
    if (c.url) found.add(c.url);
    for (const comp of c.components ?? []) if (comp.url) found.add(comp.url);
  }
  return [...found];
}

/**
 * One hash for everything the retrieval index is built from. build-index stores
 * it and verify:facts compares, so an edit to facts.md or a note without a
 * rebuilt index fails the check instead of serving stale passages.
 */
export function corpusHash(): string {
  return createHash("sha256")
    .update(JSON.stringify(loadContent().sections.map((s) => [s.title, s.body])))
    .digest("hex");
}
