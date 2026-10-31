# PRODUCT.md

Product truth for this repository. What the thing is, who reads it, and what has
to remain true. No visual decisions live here; those are in `DESIGN.md`.

## What it is

Kushal Gaddamwar's portfolio. One Next.js app containing a LangGraph agent that
answers questions about him from a corpus of his own facts, retrieved live.

The site's argument is that the agent on it is a working artifact rather than a
claim. Everything follows from that: **anything that makes a claim the reader
cannot check is a defect**, not a style choice.

## Platform

Web. Next 16 App Router, React 19, CSS Modules, no UI framework. Deployed on
Netlify, one build serving two URLs.

The home page is the stage, and it is desktop-first: the pinned chapters are
composed for 1440x900 and have not been adapted below about 1024px yet. The
earlier responsive document is still served at `/classic`, and the reduced-motion
path of the stage is a complete static page at any width.

## Who reads it

Three readers, in descending order of how much the design owes them.

1. **Someone deciding whether to talk to him.** Engineering managers, founders,
   researchers. They arrive from a resume link or a referral, they are reading
   many of these, and they are looking for a reason to stop reading. They want
   evidence they can verify without taking his word for anything.
2. **Someone technical checking the work.** They will open the pull request, read
   the eval assertions, expand the trace, and look at the source. The page has to
   survive that, and it is built to invite it.
3. **A machine.** `llms.txt`, JSON-LD, the OG card, and the corpus itself. An
   assistant summarising him should get the same facts a person does.

## What it must do

- Answer a stranger's question about him, live, grounded in a named source, and
  show what it retrieved and what it rejected.
- Let a reader verify any figure on the page by following a link.
- Give a reader who has decided to make contact a complete path to doing so,
  with the message already drafted.
- Degrade rather than break: no API key, a blocked microphone, an exhausted free
  tier, no WebGL, no JavaScript. Each falls back to something that works and says
  what happened. Silence is the failure mode to avoid.

## What it must never do

- State a number that is not in `content/facts.md` or does not resolve to a link.
- Render telemetry that was not measured.
- Volunteer work-authorisation status. The agent answers it accurately when asked
  and no section raises it unprompted. Reviewed and deliberately kept.
- Claim he authored the LangChain patch. He reported the defect and offered to
  write the fix; a maintainer wrote and merged it in 57 hours.
- Send anything on the reader's behalf. Contact tools open the reader's own mail
  client with an editable draft.

## Ground truth

`content/facts.md` and `content/certifications.json` are the single source. Every
figure, link and date on the page is parsed from them at build time. A fact
inlined in a component fails `verify:facts`. A dead external link fails
`verify:links`.

## Constraints that shape the design

- Section `id`s are a public API: `compose_intro`'s parameter enum is literally
  the section id list. Headings are free; ids are not.
- Content is authored as prose with directives (`@metric`, `@artifact`,
  `@defect`, `@ask`), and each directive binds a claim to its evidence as one
  object. The design may move those objects anywhere and may never split one.
- The audit (`npm run audit`) is a build gate with six blocking domains. It is
  part of the product, not scaffolding: the page's claim to be measured rather
  than asserted is only true because the gate is real.
