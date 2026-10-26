import { loadContent } from "../content";
import { queryTokens } from "./tokenize";
import { correct } from "./vocab";
import { mailtoLink, mailDraft, type ReachContext } from "../reach";
import { CASES } from "./evals";
import { coverage } from "./retrieve";

const { profile, sections } = loadContent();

/**
 * What the agent can do, as opposed to what it can say.
 *
 * Four verbs, and the rule is not the count: no two of these could ever be the
 * right answer to the same request. A reader asking to see the merged fix wants
 * `open_evidence`; a reader asking to write to him wants `compose_intro`; a
 * reader who does not believe the eval number wants `run_eval`. If a person
 * cannot say which tool applies, a model cannot either, and an overlapping pair
 * is a selection error waiting to happen.
 *
 * Two decisions shape everything below.
 *
 * **No loop.** The model is called once, with tools and without the corpus, and
 * whatever it asks for is executed and rendered. Nothing is fed back for a
 * second opinion. The dominant failure mode in production tool use is the retry
 * loop -- a tool errors, the agent re-invokes it identically, and the cost
 * compounds until a timeout kills the session. A pipeline with no second turn
 * cannot loop, and on a corpus this size there is nothing a second turn would
 * learn.
 *
 * **A failure is an answer, never an exception.** Every executor returns a
 * typed result carrying `say`, the sentence a reader gets. Tool calls fail
 * between three and fifteen percent of the time in production, and the worst
 * kind is the silent one: a call that succeeds and returns nothing, so no error
 * surfaces anywhere. So "worked" and "returned nothing" are different results
 * here, and both are sentences rather than a broken control.
 */

/**
 * Everything a reader can be shown, gathered from the corpus, not written here.
 *
 * Each entry carries `about`: the words a person would actually use for this
 * thing, assembled from the artifact's own kind and label and the heading of
 * the section it belongs to. That string is what the model matches a question
 * against, and it is the difference between a registry the model can route
 * with and one it has to guess at.
 *
 * The keys alone were the guess. `merged_fix`, `reported_issue`, `ieee_paper`
 * are identifiers, not language: a reader asking to see "the deep agents repo"
 * or "the open source thing" gave the model nothing to match, so it either
 * declined or opened whichever key read closest to the query as a string.
 * Composed from the corpus rather than typed here, so a new artifact arrives
 * already described and nothing has to be kept in step by hand.
 */
function targets() {
  const found = new Map<string, { url: string; label: string; about: string }>();

  // Section artifacts first. Every URL in this list is resolved by
  // `npm run verify:links` on each build, so a tool cannot open a dead page.
  for (const section of sections) {
    for (const artifact of section.artifacts) {
      const key = slug(artifact.kind, artifact.label);
      if (!found.has(key)) {
        found.set(key, {
          url: artifact.url,
          label: artifact.label,
          about: `${artifact.kind}: ${artifact.label}. From the section "${section.title}".`,
        });
      }
    }
  }

  // Then the three links that belong to him rather than to a section.
  found.set("linkedin", {
    url: profile.linkedin,
    label: "his LinkedIn profile",
    about: "His LinkedIn profile: professional profile, work history, contact.",
  });
  found.set("github", {
    url: profile.github,
    label: "his GitHub profile",
    about: "His GitHub profile: all of his public repositories and activity.",
  });
  found.set("repository", {
    url: profile.repo,
    label: "the source for this page",
    about:
      "The source code for this website and the agent answering you: repo, repository, how this page is built.",
  });

  return found;
}

/**
 * A stable key for an artifact, so the same thing keeps the same name across
 * builds even if its label is reworded.
 */
function slug(kind: string, label: string): string {
  const k = kind.toLowerCase();
  if (k.includes("fix") || k.includes("pull")) return "merged_fix";
  if (k.includes("issue")) return "reported_issue";
  if (k.includes("ieee")) return "ieee_paper";
  if (k.includes("igi")) return "book_chapter";
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
}

export const TARGETS = targets();

/**
 * The registry, ordered by what the question is actually about.
 *
 * Scored with the same tokenizer and the same compound repair the retriever
 * uses, so "deep agents" reaches the `deepagents` artifacts here for exactly
 * the reason it reaches that section in retrieval, rather than through a
 * second rule that could drift from the first.
 *
 * Nothing is dropped. A low-scoring target stays available and simply sits
 * lower in the list -- the ordering is there to make the right choice
 * obvious, not to make the others unreachable, because a reader is always
 * free to ask for something the wording of their question did not predict.
 */
export function rankTargets(question: string): string[] {
  /*
   * A compound speaks for its parts.
   *
   * `correct()` repairs "deep agents" by adding the term the corpus actually
   * indexes, "deepagents", while keeping the two words the reader typed. For
   * scoring that is one signal arriving three times, and the two weak copies
   * won: "deep" appears against exactly one target -- the IEEE paper, which
   * is titled "Deep Learning for Contextual Bug Detection" -- so the rarity
   * weighting below treated it as the most distinguishing word in the
   * question and opened a paper for someone asking about a repository.
   *
   * So a token is dropped when a longer asked token begins or ends with it,
   * which is precisely the shape a merge leaves behind. The compound keeps
   * its own weight and the halves stop competing with it.
   */
  const all = queryTokens(correct(question).text);
  const asked = new Set(
    all.filter(
      (token) =>
        !all.some(
          (other) =>
            other.length > token.length &&
            (other.startsWith(token) || other.endsWith(token)),
        ),
    ),
  );
  const vocab = [...TARGETS.entries()].map(([key, value]) => ({
    key,
    terms: new Set(queryTokens(`${key.replace(/_/g, " ")} ${value.about}`)),
  }));

  /*
   * A term is worth what it distinguishes.
   *
   * Counting matches evenly, "open the source for this page" tied the
   * repository against the deepagents issue at two hits each and lost on map
   * order: "open" and "source" are both in the heading "Open source,
   * LangChain deepagents", so the two words the reader leaned on were the two
   * that separated nothing. "page" appears against one target only, and that
   * is the word that should have decided it. Dividing by the number of
   * targets carrying a term is the smallest thing that says so.
   */
  const spread = new Map<string, number>();
  for (const entry of vocab) {
    for (const term of entry.terms) spread.set(term, (spread.get(term) ?? 0) + 1);
  }

  return vocab
    .map((entry) => {
      let score = 0;
      for (const term of entry.terms) {
        if (asked.has(term)) score += 1 / (spread.get(term) ?? 1);
      }
      return { key: entry.key, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.key);
}

export type ToolResult =
  | { ok: true; kind: "open"; url: string; label: string; say: string }
  | { ok: true; kind: "draft"; mailto: string; subject: string; body: string; say: string }
  | { ok: true; kind: "eval"; question: string; passed: boolean; asserts: string; say: string }
  | { ok: true; kind: "match"; rows: CoverageRow[]; covered: number; partial: number; total: number; say: string }
  | { ok: false; say: string };

export type CoverageRow = { req: string; status: "covered" | "partial" | "missing"; section: string | null };

/**
 * A pasted job description, mapped requirement by requirement against his record.
 *
 * A tool rather than a paragraph: the reader pasted a list and wants a list
 * back, each line marked covered, partial or missing with the section that
 * covers it. Local BM25 only (retrieve.ts coverage), so it runs with every model
 * down and costs nothing. The verdict line names the gaps instead of hiding them.
 */
export function matchJob(text: string): ToolResult {
  // The intro and the company pitch are not requirements; counting them inflates the score.
  const rows = coverage(text)
    .filter(({ req }) => !/^(about (the role|us|the team)|who we are|we('| a)re (looking|hiring)|the role|our mission)\b/i.test(req))
    .map(({ req, status, section }) => ({ req, status, section }));
  if (!rows.length) {
    return { ok: false, say: "Paste the requirements as lines or bullets and it maps each one against his record." };
  }
  const covered = rows.filter((r) => r.status === "covered").length;
  const partial = rows.filter((r) => r.status === "partial").length;
  const missing = rows.filter((r) => r.status === "missing").map((r) => r.req);
  const gaps = missing.length ? ` Not in his record: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? `; and ${missing.length - 3} more` : ""}.` : "";
  return {
    ok: true,
    kind: "match",
    rows,
    covered,
    partial,
    total: rows.length,
    say: `Covers ${covered} of ${rows.length} requirements${partial ? `, partly ${partial} more` : ""}.${gaps}`,
  };
}

/**
 * The schemas the model sees.
 *
 * Each description answers the three questions a model actually evaluates when
 * choosing: what does this do, when should I use it, what comes back. Vague
 * descriptions are not a documentation problem, they are a routing problem --
 * the description is the prompt.
 */
export function toolSchemas(question = "") {
  /*
   * The registry is handed over described and in order, not as bare keys.
   *
   * A model choosing between `merged_fix` and `ieee_paper` on identifiers
   * alone is reading variable names, and the failure that produced was a
   * question about "deep agents" opening the wrong artifact -- both keys are
   * plausible strings, neither contains the words asked. Every key now
   * arrives with the sentence describing what it is, drawn from the corpus,
   * and the list leads with whatever the question actually scored against.
   */
  const ordered = question ? rankTargets(question) : [...TARGETS.keys()];
  const catalogue = ordered
    .map((key) => `- ${key}: ${TARGETS.get(key)?.about ?? ""}`)
    .join("\n");

  return [
    {
      type: "function" as const,
      function: {
        name: "open_evidence",
        description:
          "Open a real, public artifact in the reader's browser: a merged pull request, " +
          "the issue behind it, a published paper, his LinkedIn, his GitHub, or the source " +
          "for this page. Use when the reader asks to see, open, pull up, visit or be linked " +
          "to something. Returns the label of what was opened. Do not use to describe " +
          "something; that is an ordinary answer.",
        parameters: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ordered,
              description:
                "Which artifact to open. Choose the one whose description matches what " +
                "the reader asked for, and prefer the earlier entries: this list is " +
                "ordered by how well each one scored against their question.\n" +
                catalogue,
            },
          },
          required: ["target"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "compose_intro",
        description:
          "Open the reader's own mail client with a complete, ready-to-send message to him, " +
          "and return the same text so it can be copied instead. Use when the reader says " +
          "they want to contact, email, reach out to, or get in touch with him. Nothing is " +
          "sent by this site; the reader sends it themselves and can edit every word.",
        parameters: {
          type: "object",
          properties: {
            about: {
              type: "string",
              enum: ["general", "opensource", "measured", "approach", "work", "research", "credentials"],
              description:
                "What the conversation was actually about, so the draft opens by naming it. " +
                "Use 'general' when nothing specific was discussed.",
            },
          },
          required: ["about"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "match_job",
        description:
          "Map a job description against his record, one requirement per line, and mark each " +
          "covered, partial or missing with the section that covers it. Use when the reader " +
          "pastes a job description or asks whether he fits a role they describe. Returns the " +
          "rows and a one-line verdict that names the gaps.",
        parameters: {
          type: "object",
          properties: {
            // The tool reads the reader's own message on the server. A model that
            // retyped the description could drop or invent a requirement.
            from: {
              type: "string",
              enum: ["reader_message"],
              description: "Always reader_message: the description is read from what the reader sent, never retyped.",
            },
          },
          required: ["from"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "run_eval",
        description:
          "Run one case from this site's own evaluation suite, live, and show whether its " +
          "assertion passes. Use when the reader doubts the agent, asks how it is tested, " +
          "asks whether it makes things up, or challenges a number on the page. Returns the " +
          "case, the assertion, and the result. It can fail, and that is the point.",
        parameters: {
          type: "object",
          properties: {
            about: {
              type: "string",
              enum: ["grounding", "policy", "authorisation", "out-of-corpus"],
              description:
                "Which kind of claim to demonstrate: grounding reproduces a figure from the " +
                "corpus, policy shows a prompt override being refused, authorisation shows " +
                "the visa answer, out-of-corpus shows a question it will not invent an answer to.",
            },
          },
          required: ["about"],
        },
      },
    },
  ];
}

export function openEvidence(target: string): ToolResult {
  const found = TARGETS.get(target);
  if (!found) {
    // The model named something that is not in the corpus. Saying so is more
    // useful than opening the wrong page, and far more useful than silence.
    return {
      ok: false,
      say: `That is not something this page can open. It has his LinkedIn, his GitHub, the source for this site, the LangChain issue and fix, and his two publications.`,
    };
  }
  return {
    ok: true,
    kind: "open",
    url: found.url,
    label: found.label,
    say: `Opening ${found.label}.`,
  };
}

export function composeIntro(about: string): ToolResult {
  const context = (
    ["general", "opensource", "measured", "approach", "work", "research", "credentials"].includes(about)
      ? about
      : "general"
  ) as ReachContext;

  const draft = mailDraft(profile.email, profile.site.replace("https://", ""), context);
  return {
    ok: true,
    kind: "draft",
    mailto: mailtoLink(profile.email, profile.site.replace("https://", ""), context),
    subject: draft.subject,
    body: draft.body,
    // `mailto:` does nothing on a machine with no mail client registered and
    // nothing in webmail, and there is no event for that failure, so it cannot
    // be detected and has to be covered instead. The text comes back either way.
    say: `Opening a draft to ${profile.email}. If nothing opens, the same message is below to copy.`,
  };
}

/** How many demonstrations one reader gets before the answer is no. */
export const EVAL_SESSION_CAP = 3;

/**
 * Runs one real case and reports whether its assertion held.
 *
 * The case is chosen here rather than by the caller. A model asked for an
 * arbitrary string would eventually ask for one that does not exist, and a
 * reader could otherwise pick the twenty-two cases one at a time and spend the
 * daily budget before a recruiter arrives.
 */
export async function runEval(
  about: string,
  ask: (question: string) => Promise<{ answer: string; route: string }>,
): Promise<ToolResult> {
  const pool = CASES.filter((c) => c.group === about);
  const chosen = pool[0];
  if (!chosen) return { ok: false, say: `There is no eval case of that kind.` };

  try {
    const result = await ask(chosen.question);
    const answer = (result.answer ?? "").toString();

    const problems: string[] = [];
    if (result.route !== chosen.route) problems.push(`routed to ${result.route}, expected ${chosen.route}`);
    for (const term of chosen.expect ?? []) {
      if (!answer.includes(term)) problems.push(`missing "${term}"`);
    }
    if (chosen.expectAny && !chosen.expectAny.some((t) => answer.includes(t))) {
      problems.push(`none of [${chosen.expectAny.join(", ")}]`);
    }
    for (const term of chosen.reject ?? []) {
      if (answer.toLowerCase().includes(term.toLowerCase())) problems.push(`leaked "${term}"`);
    }

    const asserts = [
      `routes to ${chosen.route}`,
      ...(chosen.expect ?? []).map((t) => `states ${JSON.stringify(t)}`),
      ...(chosen.reject ?? []).map((t) => `never says ${JSON.stringify(t)}`),
    ].join(" · ");

    const passed = problems.length === 0;
    return {
      ok: true,
      kind: "eval",
      question: chosen.question,
      passed,
      asserts,
      say: passed
        ? `Ran it just now: "${chosen.question}" — ${asserts}. Passed.`
        : `Ran it just now: "${chosen.question}" — ${asserts}. Failed: ${problems.join("; ")}.`,
    };
  } catch (err) {
    // A demonstration that cannot run is reported as one that could not run,
    // never as one that passed.
    return { ok: false, say: `The suite could not run just now: ${(err as Error).message.slice(0, 120)}.` };
  }
}
