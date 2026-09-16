/**
 * Builds a prefilled `mailto:` draft, the same text as plain text for clients
 * that ignore `mailto:`, and the note the LinkedIn flow copies.
 *
 * One function builds each string once: the subject and body handed to the mail
 * client are the same values the page prints on screen, so the two cannot drift.
 * Every value comes from `content/facts.md` through the caller; nothing here
 * restates a fact.
 *
 * Bodies are written in the sender's voice and assert nothing about who the
 * sender is, because the text is typed into a stranger's outbox under their own
 * name.
 */

/** Where the reader was when they decided to write. Shapes the opener only. */
export type ReachContext =
  | "general"
  | "opensource"
  | "measured"
  | "approach"
  | "work"
  | "research"
  | "credentials";

/**
 * Subject lines are the part an inbox shows before anything else, so they carry
 * the specific hook and nothing else.
 *
 * The general subject once read "Your portfolio, and a role I think fits",
 * which asserts who is writing before they have written a word. A subject line
 * here states what the message is about and nothing about its sender.
 */
export const SUBJECT: Record<ReachContext, string> = {
  general: "Your portfolio",
  opensource: "The LangChain deepagents fix",
  measured: "The eval suite on your site",
  approach: "How your retrieval fusion works",
  work: "Your work at the Questrom Computational Lab",
  // Section 05 became Research and kept pointing at the projects context, so a
  // reader who had just read about the IEEE paper got a draft about BU Life AI.
  research: "Your paper on contextual bug detection",
  // Section 06 became Credentials. The context was still called `projects` and
  // still opened a draft about a side project that no longer has a heading
  // there, so the one section a reader reaches after the certifications sent a
  // message about something else entirely.
  credentials: "Your NVIDIA certification",
};

/**
 * Openers name what the reader was looking at and assert nothing about who is
 * writing.
 *
 * Two constraints hold every string below. The text states which chapter the
 * draft was opened from, never an opinion of it. And no body may include a
 * claim about the sender, because the sender is whoever pressed the link.
 */
export const OPENER: Record<ReachContext, string> = {
  general: "I came across your portfolio and read through it.",
  opensource:
    "I read about the CompositeBackend bug you reported to LangChain, and the fix that was merged 57 hours later.",
  measured:
    "I looked at the eval suite behind the agent on your site, and the latency you publish alongside it.",
  approach:
    "I read how retrieval works on your site, including the point where the dense retriever overrules keyword rank.",
  work: "I read about the agentic RAG platform you shipped on Azure at the Questrom Computational Lab.",
  research: "I read your ICAICCIT paper on contextual bug detection.",
  credentials:
    "I went through your credentials, including the NVIDIA agentic AI certification.",
};

/**
 * The ask, identical in every draft.
 *
 * Choosing a time is the real work in a reply, and a message that leaves it
 * open gets answered with "sure, when?" and then not answered again. Naming two
 * is one line for the sender and removes the whole round trip.
 */
const ASK =
  "I'd like to talk to you about it. If you're open to a short call, name two times that suit you and I'll take one.";

/** Kept short deliberately: a long prefilled body is a form, and a form is work. */
function body(context: ReachContext, site: string) {
  return [OPENER[context], "", ASK, "", `(Sent from ${site})`, ""].join("\n");
}

/**
 * `mailto:` with subject and body, encoded once.
 *
 * Newlines have to be percent-encoded rather than passed raw: an unencoded
 * newline truncates the body silently in several clients, which would ship a
 * half-written draft and look worse than no draft at all.
 */
export function mailtoLink(email: string, site: string, context: ReachContext = "general") {
  const params = new URLSearchParams({
    subject: SUBJECT[context],
    body: body(context, site),
  });
  // URLSearchParams encodes spaces as "+", which mail clients render literally
  // in a subject line. Only %20 is safe in a mailto query.
  return `mailto:${email}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * The same draft as plain text.
 *
 * A `mailto:` press on a machine with no mail client registered raises no event,
 * so the failure cannot be detected and is covered instead: every caller that
 * opens a draft can also show the identical text to copy.
 */
export function mailDraft(email: string, site: string, context: ReachContext = "general") {
  return {
    to: email,
    subject: SUBJECT[context],
    body: body(context, site).trimEnd(),
  };
}

/** LinkedIn refuses a note longer than this, and truncates without saying so. */
export const LINKEDIN_NOTE_LIMIT = 300;

/**
 * LinkedIn accepts no prefilled message by URL.
 *
 * The message parameter on /messaging/thread was removed and the connect flow
 * takes no note from a link, so the profile opens and the note is copied to the
 * clipboard at the same moment, with a line on the page saying so.
 *
 * Trimmed to the connection-note limit rather than trusted to fit. An earlier
 * version appended a claim about the sender to the longest opener and never checked the
 * total, so the two longest contexts were over the cap and LinkedIn would have
 * cut them mid-sentence in front of the person being written to.
 */
export function linkedinNote(context: ReachContext = "general") {
  const note = `${OPENER[context]} I'd like to talk about it. Are you open to a short call?`;
  if (note.length <= LINKEDIN_NOTE_LIMIT) return note;
  // Cut at a sentence end rather than mid-word, so a trimmed note still reads
  // as something a person wrote.
  const room = note.slice(0, LINKEDIN_NOTE_LIMIT);
  return room.slice(0, room.lastIndexOf(". ") + 1) || room.trimEnd();
}

/**
 * Three lines and a link, short enough to paste into a message.
 *
 * A URL alone tells the next reader nothing before they open it, so the three
 * strongest facts travel with it, and the link is the condensed view, which is
 * the version that survives being opened on a phone in a meeting.
 *
 * Generated from the corpus like everything else here. Nothing in it is a
 * second copy of a fact.
 */
export function forwardBlurb(
  profile: { name: string; current: string; proof: string; site: string },
  evals: { passed: number; cases: number; p50: number },
) {
  return [
    `${profile.name} - ${profile.current}.`,
    profile.proof,
    `His site runs a live agent over his own resume: ${evals.passed}/${evals.cases} eval assertions pass, ${evals.p50}ms median answer.`,
    `${profile.site}?mode=condensed`,
  ].join("\n");
}
