# kushal-portfolio-v2

**Live: [kushal-portfolio-223.netlify.app](https://kushal-portfolio-223.netlify.app)**

[![ci](https://github.com/Kushal9889/kushal-portfolio-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/Kushal9889/kushal-portfolio-v2/actions/workflows/ci.yml)

The badge is the claim, not decoration. It goes red when a link rots, when a
corrected fact reappears, when the availability date passes, or when a colour is
written outside the token file.

A portfolio whose agent answers questions about my work, grounded in one corpus
file and routed through a LangGraph state machine. Every figure on the page is
measured or links to something that can be checked. There are no placeholder
numbers, and the build fails if a claim stops being true.

## The two things worth checking first

**A silent bug I reported in LangChain's deepagents SDK.** `CompositeBackend.ls("/")`
discarded errors from the default backend and returned a successful route-only
listing, so an agent read an unavailable filesystem as healthy and nearly empty.
I traced it to a recurring class of error-handling defect rather than a one-off
and filed a reproduction covering the synchronous and asynchronous paths. A
maintainer wrote and merged the fix 57 hours later and credited the reproduction.

- Issue: [langchain-ai/deepagents#4846](https://github.com/langchain-ai/deepagents/issues/4846)
- Merged fix: [langchain-ai/deepagents#4925](https://github.com/langchain-ai/deepagents/pull/4925)

**The retrieval table, which shows the run that just happened.** BM25 rank,
dense rank, and the reciprocal rank fusion of the two, per passage, redrawn from
whatever you ask the agent on `/stage`.

## What the gates enforce

```bash
npm run audit          # 98 requirements across 12 domains
npm test               # 30 unit and integration tests
npm run test:evals     # 16 agent evals, asserts answer quality
npm run verify:links   # every external URL, HEAD-checked
npm run verify:facts   # corpus consistency, prose gates, staleness
```

The facts gate fails the build when the availability date passes, when a
corrected claim reappears, or when the em-dash rate suggests the prose was not
written by a person.

---

## Run it

```bash
npm install
npm run build:index
npm run dev
```

Works with no API key: retrieval falls back to keyword-only and the agent returns
the retrieved section directly instead of a generated answer. Add a key to get
generated answers.

```bash
cp .env.example .env.local
```

## Providers

One env var switches production. OpenRouter, NVIDIA NIM and OpenAI are all
OpenAI-compatible, so they run through the same LangChain `ChatOpenAI` client
with a different `baseURL`.

```bash
LLM_PROVIDER=openrouter          # default
LLM_PROVIDER=nvidia              # free NIM credits, also serves embeddings
LLM_PROVIDER=openai              # add OPENAI_API_KEY
```

Unset keys degrade rather than error. Configured providers are tried in order, so
a free tier hitting its daily cap produces a slower answer rather than none.

## How it works

```
question
   │
   ▼
route ──────────────────────────────────────────────┐
   │ keyword classification, no model call          │
   ├─ answer ──▶ retrieve ──▶ answer ──▶ END        │
   ├─ handoff ─▶ retrieve ──▶ answer ──▶ END        │  intent to hire
   ├─ authorisation ──────────────────▶ END         │  fixed text
   └─ deflect ────────────────────────▶ END         │  compensation, personal
```

**route** classifies by keyword. Deterministic, free, and adds nothing to the
latency a visitor waits on.

**retrieve** fuses BM25 with cosine over vectors baked into the bundle at build
time, merged by reciprocal rank fusion. The corpus is a few dozen passages, so
the bundled vectors answer without a database; Neon serves the dense half only
when configured and inside its time cap. Every question is embedded: a keyword
shortcut was measured and removed because it fired only on the weakest query in
the eval set.

**answer** streams tokens over Server-Sent Events. No checkpointer: LangGraph
writes one after every node by default, which is 20–50ms per write for
statefulness a stateless question does not need.

## Content

`content/facts.md` is the only source of truth. It feeds the rendered page, the
retrieval index, `llms.txt`, and the share card. A claim that is not in that file
cannot appear on the site.

- `@metric value | label` lines are lifted out of prose into the figures strip.
- `**bold**` marks the one sentence per section worth stopping on.
- `[text](url)` and bare URLs both render as links.

`content/certifications.json` holds credentials. A course with a `url` counts as
earned; the progress count is derived from that rather than hand-maintained.

## Checks

```bash
npm run check          # typecheck + lint:tokens + verify:facts
npm run verify:links   # every external URL, HEAD then ranged GET
npm run test:evals     # 16 questions against the live agent
```

`lint:tokens` fails on any colour outside `app/globals.css`.
`verify:facts` fails if a required section is missing, a credential has no
verification link, or the em-dash rate rises above 2 per 1,000 words.

## Deploy

The deployment target is Netlify. Use the committed retrieval index and media:
`npm ci`, then `npm run build:release`. The normal `build` command regenerates
artifacts and is for authoring, not release promotion.

Netlify runs fact verification, the production build, repository checks and unit
tests. CI also checks HTTP behavior, browser journeys and production dependency
advisories. Failed checks block readiness; skipped live-provider tests do not
certify the agent. Configure the matching required checks in GitHub and verify
Netlify publication controls before enabling automatic production publication.

See [the release contract](release/production-readiness.md) for numeric targets,
preview verification, pending integration work and the rollback procedure.

## Voice

Speech recognition uses the browser's built-in Web Speech API. Speech synthesis
tries Kokoro-82M over WebGPU first, an on-device neural model that costs nothing
per minute and sends no audio anywhere, and falls back to the built-in
synthesiser where WebGPU is unavailable. The model is fetched on the first spoken
answer, never on page load.

Audio needs a user gesture. Browsers do not accept scrolling as one, so nothing
here promises audio before a click, and a blocked microphone says so rather than
failing silently.

## Layout

```
app/
  page.tsx              sections composed, no logic
  api/agent/            settled answer, used by evals and the hero trace
  api/agent/stream/     SSE token stream, used by the visitor-facing agent
lib/agent/
  graph.ts              the StateGraph
  model.ts              provider selection and failover
  retrieve.ts           BM25 + cosine + RRF over the baked index
  policy.ts             routing, refusals, system prompt, answer cleanup
lib/voice/              speech in and out
content/                facts.md and certifications.json
scripts/                index build and the verification gates
docs/                   ADRs and the research this was built from
```

## Docs

- `docs/adr-001-visual-hierarchy.md` — why metrics are pulled out of prose
- `docs/adr-002-emphasis-and-placement.md` — emphasis marks, agent placement, motion
- `docs/research/00-findings-to-build-map.md` — every research finding and where it landed
