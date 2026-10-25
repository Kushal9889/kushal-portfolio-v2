import { loadContent } from "../content";
import { nearestTerm } from "./vocab";
import { STOPWORDS } from "./tokenize";

/** Heading words too generic to mark a question as being about one section. */
const STOP = new Set([
  "what", "does", "this", "site", "page", "work", "works", "open", "source",
  "defects", "shipped", "then", "fixed", "retrieval", "good", "about", "how",
  "authorisation", "publications", "skills", "education", "availability",
]);

const { profile, sections } = loadContent();

/** The person, however a visitor refers to them: any pronoun or the first name. */
const FIRST = (profile.name ?? "").split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "") || "he";
const WHO = String.raw`(?:he|she|they|${FIRST})`;
const WHOM = String.raw`(?:him|her|them|himself|herself|themselves|${FIRST})`;
/** Possessive for the rewrite of "your", from the profile's pronouns. */
const POSSESSIVE = /^she/i.test(profile.pronouns ?? "") ? "her" : /^they/i.test(profile.pronouns ?? "") ? "their" : "his";

/**
 * Distinctive words from the section headings: "Growaza", "Questrom", "IMG".
 *
 * A question that names one of these is asking about that thing, whatever verb
 * it uses. Without this, "What did he do at IMG Systems?" was read as a general
 * work question and the weights pushed his current role above the employer he
 * had actually been asked about -- the ranking overruling the reader.
 *
 * Built from the corpus, so a new section is covered the moment it is written.
 * Short and common words are dropped because a heading like "This site" would
 * otherwise make every question specific.
 */
const NAMED = new Set(
  sections
    .flatMap((s) => s.title.toLowerCase().split(/[^a-z0-9+#.-]+/))
    // Grammar words in a heading ("What they do not do") are not names; without
    // the shared stopword list every question saying "they" named a section.
    .filter((w) => w.length > 3 && !STOP.has(w) && !STOPWORDS.has(w)),
);

function namesASection(question: string): boolean {
  return question
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .some((w) => {
      if (w.length <= 3) return false;
      if (NAMED.has(w)) return true;
      // "IMG Sytems" defeated this check, so the question was reclassified from
      // `specific` to `shipped` and the weights then promoted his current role
      // over the employer he had been asked about. A typo must not be able to
      // change what the question is about.
      const near = nearestTerm(w);
      return near ? NAMED.has(near) : false;
    });
}

/**
 * What the question is actually asking, decided before anything is retrieved.
 *
 * Retrieval on a corpus this small is decided by a handful of terms, and a
 * handful of terms is not enough to tell "what did he ship" from "what does
 * this page ship". Measured, that exact collision shipped: "What did he ship?"
 * survives stopword removal as the single token "ship", the only chunk
 * containing that token is the section describing this website -- because it
 * says the page refuses to "ship claims it cannot support" -- and the agent
 * answered a question about a career with a paragraph about Netlify.
 *
 * No amount of prompt wording fixes that, because the right section never
 * reaches the prompt. So the question is classified first, expanded into the
 * vocabulary the corpus actually uses. Both are cheap,
 * deterministic, and costs no network call.
 */
export type Intent = "identity" | "shipped" | "limitation" | "system" | "specific";

/** The signals `scripts/build-index.ts` lifts out of each section at build time. */
export type ChunkMeta = {
  fromNotes: boolean;
  dated: boolean;
  current: boolean;
  year: number;
  yearStart?: number;
  yearEnd?: number;
  kind?: string;
  metrics: number;
  artifacts: number;
};

export type Analysis = {
  intent: Intent;
  /** What the retrievers score. May be wider than what the reader typed. */
  query: string;
  /**
   * The question as the model should receive it.
   *
   * "Tell me about yourself" is addressed to the assistant, and the assistant
   * answered it: "I am Kushal Gaddamwar, an AI Engineer at ...". Every rule in
   * the system prompt says third person and the model followed the pronoun in
   * the question instead, which is the stronger signal and always will be.
   *
   * Fixed by changing who is being asked rather than by adding a fourth
   * instruction telling it not to. The reader still sees what they typed; only
   * the model sees this.
   */
  asked: string;
  /**
   * How far below the leader a chunk may score and still reach the model.
   *
   * Overridden for one intent. "Does he know PyTorch?" matches a single chunk
   * lexically -- the section listing what he does not do -- so that chunk
   * carries both retrievers and scores 1/61 + 1/62, while every other chunk
   * carries dense only and scores 1/62. The ratio is 0.49, the default floor is
   * 0.55, and the model was handed a context containing nothing he has done and
   * an instruction to name something he has done. It invented one, and what it
   * reached for was the other half of the sentence denying PyTorch.
   *
   * A limitation question structurally needs both halves, so it gets a lower
   * floor rather than a longer prompt.
   */
  floor?: number;
};

const IDENTITY = new RegExp(
  String.raw`^\s*(?:so\s+)?(?:tell me (?:a bit )?about (?:yourself|${WHOM})|who (?:is|are) (?:${WHO}|you)|introduce (?:yourself|${WHOM})|walk me through (?:his|her|their|your) background|what should i know about ${WHOM}|give me (?:a |the )?(?:quick |short )?(?:intro|introduction|overview|summary|rundown)|(?:his|her|their) background|about (?:${WHOM}|yourself))\b`,
  "i",
);

/** Asking what he has done, in any of the ways people ask it. */
const SHIPPED =
  /\b(ship(?:ped|s)?|built|build(?:s|ing)?|deliver(?:ed|s)?|launch(?:ed|es)?|work(?:ed|ing)? on|working on right now|experience|projects?|portfolio of work|track record|what has he done|what did he do|where has he worked|his roles?|his jobs?)\b/i;

/** Asking about this page, this agent, or how it works. */
const SYSTEM =
  /\b(this (?:page|site|website|agent|demo|thing)|your (?:retrieval|agent|prompt|graph|stack|architecture))\b|\bhow (?:does|do) (?:this|it|the (?:retrieval|agent|graph|routing|fusion))\b/i;

/** Asking whether he can do a specific thing, which may be a no. */
/*
 * Asking whether he can do a specific thing, which may be a no.
 *
 * Narrower than it first looked. The first version accepted "did he do", which
 * classified "What did he do at IMG Systems?" as a limitation question and
 * weighted the ranking towards capability sections on a question about a
 * specific job. A limitation question names a skill, not a place, so the verb
 * has to be one of knowing or using rather than the general "do".
 */
const LIMITATION = new RegExp(
  String.raw`\b(?:does|do|can|has|have|did) ${WHO} (?:know|use[sd]?|used|work(?:ed)? with|have any|ever)\b|\b(?:is|are) ${WHO} (?:a|an) \w+`,
  "i",
);

/*
 * There were ranking weights here, one set per intent, multiplying the fused
 * score. Removed 2026-10-10: with the cross-encoder deciding the top five they
 * changed nothing on the held-out test split (nDCG@5 0.877 with and without;
 * dev 0.884 to 0.869), and with the reranker down they reordered the keyword
 * ranking so far that "Why does this site run without a checkpointer?" fell to
 * "don't know". A hand prior that cannot be measured to help is a liability.
 */

/**
 * Opinion and overview questions: why hire, what stands out, strongest work,
 * best at, a summary. No section shares their words, yet every profile written
 * to the template answers them in its `@kind profile` sections.
 */
const OVERVIEW =
  /\b(why (should|would|do) (we|i|you|anyone|a company|someone) (hire|pick|choose|consider)|what makes \w+ (different|stand out|unique|special|a good)|stand(s)? out|(strongest|best|most impressive|biggest|proudest) (project|work|skill|strength|achievement|result|thing)|(what|where) (is|are) \w+ (best|strongest|good) at|(his|her|their|key|main|biggest) strengths?|summar(y|ise|ize)|overview|(sell|pitch) (me|us)|elevator pitch|in (one|two|three) (line|sentence)s?)\b/i;

/**
 * Question shapes every profile answers, keyed by the template's `@kind`
 * (docs/facts-format.md). A short question like "when can they start" shares no
 * word with "Available from March" and scores weakly on every signal, but its
 * kind is unambiguous in any corpus written to the template.
 */
const KIND_INTENTS: [string, RegExp][] = [
  ["availability", /\b(when can \w+ (start|join|begin)|start date|notice period|availab(le|ility)|open to (work|roles|offers|relocat\w*)|relocat\w*|looking for (a |an )?(role|job|position)|kind of (role|job|position))\b/i],
  ["education", /\b(degree|universit(y|ies)|college|school|stud(y|ied|ying)|gpa|graduat\w*|major|master'?s|bachelor'?s|phd|coursework)\b/i],
  ["credential", /\b(certif\w*|licen[cs]\w*|accredit\w*)\b/i],
  ["publication", /\b(publication|published|papers?|journal|conference|research)\b/i],
  ["award", /\b(awards?|achievements?|prizes?|honou?rs?|ranks?|won|win)\b/i],
  // About the person's toolkit, not about tools a system has ("how many tools does the agent expose").
  ["skills", /\b((programming|spoken|coding) languages|what (languages|tools|technologies|frameworks) (do|does|did|has|have|can)|(his|her|their) (tools|stack|toolkit|languages)|tech stack|skills?|skill ?set|proficien\w*)\b/i],
];

/** Template kinds whose sections answer this question shape. */
export function kindsFor(question: string): string[] {
  const kinds = KIND_INTENTS.filter(([, re]) => re.test(question)).map(([k]) => k);
  return IDENTITY.test(question) || OVERVIEW.test(question) ? ["profile", ...kinds] : kinds;
}

export function analyze(question: string): Analysis {
  // A named section beats every heuristic below it. The reader has already said
  // what they want to know about; an intent classifier is only useful when they
  // have not.
  const intent: Intent = IDENTITY.test(question)
    ? "identity"
    : SYSTEM.test(question)
      ? "system"
      : namesASection(question)
        ? "specific"
        : LIMITATION.test(question)
          ? "limitation"
          : SHIPPED.test(question)
            ? "shipped"
            : "specific";

  /*
   * No expansion. Appending the current role and focus to every "what has he
   * done" question pulled the ranking toward the current job whatever the
   * question named: "What did he do at IMG?" became thirty words about the
   * current role and the employer asked about fell out of the top three. The
   * identity rewrite below already turns "yourself" into the name, which the
   * corpus does contain, so that is what gets scored.
   */
  const asked =
    intent === "identity"
      ? question
          .replace(/\byourself\b/gi, profile.name)
          .replace(/\bwho are you\b/gi, `who is ${profile.name}`)
          .replace(/\bare you\b/gi, `is ${profile.name}`)
          .replace(/\byou\b/gi, profile.name)
          .replace(/\byour\b/gi, POSSESSIVE)
      : question;

  const query = intent === "identity" ? asked : question;

  return { intent, query, asked, floor: intent === "limitation" ? 0.4 : undefined };
}
