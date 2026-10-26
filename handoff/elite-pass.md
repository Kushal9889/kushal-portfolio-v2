# ELITE PASS: plan and rules (Kushal's portfolio v2)

## Who owns what (read first)
- Another session ("Portfolio v2: agent card + Apple pass (continue)") is working on branch `wip/agent-card-2026-10-26` and OWNS the Q-items: Q1 removing the load turn, Q2 record chips and the NVIDIA chip, Q3 memory cue, Q4 ten UX features, Q5 film card copy, Q6 Apple leftovers, home page restyle and DESIGN.md. **You do not touch Q-items.**
- You own the F-items (verified fixes) and the N-items (new) below.
- Your branch is `wip/elite-pass-2026-10-26`, started on top of the other session's work. Save ONLY with `bash handoff/checkpoint-elite.sh "<note>"`. It merges the other session's latest work first, so your changes always sit on top. **Never run handoff/checkpoint.sh**, which would overwrite the other session's branch.
- If the merge conflicts, or an F/N item would change a file the other session is clearly editing for a Q-item, STOP and ask Kushal with AskUserQuestion (2 to 4 options, your recommendation first). Do not guess.

## Setup
```bash
git clone --depth 40 --filter=blob:none --no-checkout -b wip/elite-pass-2026-10-26 https://github.com/Kushal9889/kushal-portfolio-v2 v2 && cd v2
git sparse-checkout set --no-cone '/*' '!/public/film/' && git checkout
npm ci --no-audit --no-fund && pip install -q playwright
npx next build && (nohup npx next start -p 3002 >/tmp/srv.log 2>&1 &)
python3 scripts/ui-agent-screen.py   # must print PASS
```
Kill the server by PID, never `pkill -f "next start"`. `public/film` is left out on purpose; the unit test "every clip the map names is a shipped file" fails only because of that.

## Rules (strict; Kushal asked for these)
- No git commits on any real branch. Checkpoints only (above). Never touch `main`, `main-2026-10-25` or PR #2. No deploy.
- No live model calls: no prewarm, no agent-scenarios, no bench-models. `npm run bench` is cached and allowed.
- No `anthropic-skills:*`. Use design:design-critique, design:accessibility-review, gstack:design-review.
- No AI-slop colors (no neon lime, gold, cream accents, purple or indigo gradients, cyan glows). One accent: Apple blue. Do not undo the Apple restyle.
- Facts about Kushal only from content/facts.md, content/certifications.json, /api/health. Ask before editing facts.md.
- CSS class names must not contain: frame, cta, source, status, stack, label, link, item, value, code, stop, send, primary, detail, wrap, seed, cell, count.
- Build with `npx next build`. No AI attribution anywhere. Never commit `.env*`.
- Kushal reads on a phone: reply in two plain lines, Done / Pending. No jargon, no em dashes. After every batch, send before|after screenshots with SendUserFile.

## Method
1. Write handoff/plan-elite.md: every item with its evidence, pass condition and owner.
2. Parallel read-only sub-agents, one per domain, each returning: id | evidence (file:line or screenshot + measurement) | law | fix | pass condition. You dedupe, rank by impact divided by effort, and write all the code yourself (one writer).
3. Brutal means evidence: no finding without a reproduction, no fix without a pass condition.
4. Per batch: before shots, change, build, screen check PASS, tsc, unit, survivors 13/13, lint:tokens no worse than 4, audit no worse than 92/107, after shots, a side-by-side PNG to Kushal, checkpoint, two-line reply.
5. A fix that fails its gate twice gets reverted and logged.
6. Order: F1-F19, then F20-F44, then the N domains D1-D12.

## F-items (verified 2026-10-26)
BATCH 1, trust
F1 app/api/agent/demo/route.ts:74 caches degraded answers (provider null) for 60 s (lib/journeys.ts:13). Never cache or serve them; show the authored brief with "Models resting, showing the summary".
F2 The same route runs a live model on cold start or cache expiry. Serve the build-time run (lib/agent/prewarm.json) with its true age; refresh on a schedule.
F3 "Answered live on load in N ms" (Agent.tsx:1138) is a cache hit. Write "Cached run · N ms · <age> ago".
F4 facts.md:15 says "LangChain's Python SDK"; facts.md:250 and the brief say "deepagents SDK". Ask Kushal, then align.
F5 "57 hours" is repeated 3 times. Keep the hero mention.
F6 Groundedness 92% is shown against a 95% gate. Show "92% of a 95% target" or hide it.
F7 Debug values (tier, cos, logit, BM25, "Sentences sourced 0/20") shown to visitors. Put them behind "Raw"; a no-model answer reads "Answered from his record, no model".
F8 "Up · 0 of 0 providers ready". Write "Running on cached answers".
BATCH 2, privacy and production
F9 app/api/track/route.ts:41-44 logs raw questions (from Agent.tsx:690). Scrub PII or log length + route only.
F10 lib/agent/budget.ts is an in-memory per-instance limit. Persist it (Neon) and show "N questions left today" under 20%.
F11 Feedback (Agent.tsx:993) has no question, prompt or turn id, and is not visible inline. Send {promptVersion, route, questionHash, vote}; show it under each answer.
F12 No events for journeys, tally, Full view, strip, Sources, Trace, free-tier chip, share opens. Add them.
F13 Add degraded24h and seedAgeMs to /api/health, plus a post-deploy smoke check (fail if providers=0 or the seed is degraded).
F14 survivors.sh pins PROMPT_VERSION by hand. Read it from lib/agent/policy.ts.
F15 tests/film.test.ts:95 fails when public/film is absent. Skip with a message.
BATCH 3, state and flows
F16 Reload loses the thread (verified). Persist turn order and focus; restore.
F17 The job-description flow exists (policy.ts:79, retrieve.ts:857, stream.ts:483) but is invisible. Add a "Paste a job description" chip and lead that answer with coverage rows.
F18 facts.md:435-436 (F-1, OPT, STEM extension, about 3 years before H-1B) is nowhere in the UI. Add one line by availability.
F19 Recruiter journey opens one panel: role, availability + authorization, 3 proofs, résumé, email. One tap.
BATCH 4, words
F20 Voice: hero first person, agent third person. Document it.
F21 Spell out "Research Assistant" once.
F22 Island strings 24 characters or fewer; no "Neon pgvector" (Agent.tsx:1128).
F23 CTA subline "draft written · compose_intro" becomes "A draft is ready to send".
F24 Strip "Read: This site" and a duplicate "Full view". Name real sections or hide; the label becomes "Read the rest".
F25 "held-out evals" hint "tests it never saw"; tally date "Oct 26" with no wrap.
F26 "Free tier" becomes "Free models · why slow?".
F27 "Try to break it" hint: "ask something it should refuse".
F28 "RECORDED · 2 S AGO": say what was recorded, or remove it.
BATCH 5, layout and accessibility
F29 At 360x780 the composer, chip and dock stack up. Hide the chip and dock while the composer is focused.
F30 The chip row scrolls sideways on phone with no cue. Add an edge fade and a count.
F31 Journeys: desktop 3, phone 4. Make consistent or document.
F32 The full view's scroll arrow overlaps the chip row.
F33 Glance hints: show 2, the rest under "More".
F34 The island announces every phase via aria-live. Announce the final state only.
F35 Tally accessible names: "Ask: which tools it can call".
F36 Hero résumé button: "PDF · 1 page".
F37 UNVERIFIED keyboard trap test; add it to the screen check.
F38 UNVERIFIED contrast of the 0.75rem mono labels on #1d1d1f.
BATCH 6, old debt
F39 Collapse app/scenes.css stacked passes, aiming for -40% lines with identical screenshots.
F40 CSS 58 KB gzip against the audit's 20 KB budget. Delete the 10 unused classes first.
F41 Write ADRs for 9.7; clear 13.1 and 13.4.
F42 Tokenize the 4 #000 at Agent.module.css:1054.
F43 Delete `backdrop-filter: none` in Hero.module.css.
F44 Tokenize the island's oklch literals (Agent.module.css about 1121).
Verified fine, skip: tally derived from code; share links restore with an OG title; Ask stays above the fold at 1440/1280; the job-description backend works; the note animation respects reduced motion.

## N-items (new), by domain and law
D1 First 10 seconds (5-second test, serial position, F-pattern)
N1 In the first viewport at 1440 and 390: who, role, proof and next action must all be visible without scrolling.
N2 One accent object in the first screen (Von Restorff).
N3 The first words of each block on the left edge read as a sentence.
D2 Credibility (authority, social proof)
N4 Every claim in the first two screens has a verifiable link within one tap, or it goes.
N5 Order proofs by outside action (merged, certified) above self-description.
N6 Every number shows its date and method on tap.
D3 Cognitive load (Hick, Miller, progressive disclosure)
N7 7 or fewer interactive choices in the first viewport.
N8 Every panel answers one question.
N9 Three disclosure levels (glance, full view, raw); each element at exactly one.
D4 Perceived speed (Doherty 400 ms, labor illusion)
N10 Feedback within 100 ms of Ask; first content within 400 ms on the cached path.
N11 Progress steps map to real pipeline events.
N12 LCP under 2.5 s and CLS under 0.1 at 390 and 1440 (Playwright performance entries).
D5 Ergonomics (Fitts, thumb zone, Jakob)
N13 Ask, Email and Résumé in the phone thumb zone, 44px or larger.
N14 Esc, Enter, Shift+Enter, / and back button behave by convention.
N15 Hover-only information is reachable by tap and keyboard.
D6 States (visibility of status, error prevention)
N16 State matrix screenshots: empty, loading, streaming, done, partial, degraded, refused, rate-limited, offline, error. Each says what happened and what to do, in 12 words or fewer.
N17 Offline mid-run recovers without a reload.
D7 Microcopy
N18 A glossary: one name per concept across the page.
N19 Verb + object button labels where the object is ambiguous.
N20 Cut filler and hedges.
D8 Visual system (gestalt)
N21 Every gap on the 8pt scale.
N22 6 or fewer distinct font sizes.
N23 3 alignment lines at 1440.
N24 Equal things look equal.
D9 Emotion and memory (peak-end, Zeigarnik, goal gradient)
N25 The peak (a cited answer appearing) gets one restrained motion.
N26 The end (contact) keeps one action and one proof.
N27 One next question per answer, chosen by its sources.
D10 Trust (no dark patterns)
N28 One line on what is stored and for how long; it must match the code.
N29 No fake liveness or urgency.
D11 Discoverability (information scent, SEO, Open Graph)
N30 Headings predict their content.
N31 Correct OG and meta for /classic and /ask?q=; render the OG image and send it.
N32 JSON-LD Person from facts.md.
D12 Instrumentation
N33 Funnel events: land, interact, ask, read 80%, contact. No personal data.
N34 Count degraded answers per day.

## Final report
A table, id | DONE / MERGED / REJECTED | evidence | one-line result, plus side-by-side PNGs. Then two lines: Done / Pending.
