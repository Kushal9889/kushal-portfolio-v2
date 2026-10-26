# Elite pass plan (2026-10-26)

## Decisions from Kushal
- Branch stands alone. checkpoint-elite.sh no longer merges wip/agent-card-2026-10-26; Kushal merges both later.
- Safe files first. Fixes in files the other session edits (Agent.tsx, Agent.module.css, Hero.*, ClassicPage.tsx, *.module.css, globals/base/scenes/stage.css, stage/*, film/*, chips.ts, events.ts, stream.ts, DESIGN.md) come last, as small separate edits.
- F4 wording: "LangChain's deepagents SDK" everywhere.

## Baseline (before any change)
screen check PASS · tsc 0 · unit 163 pass, 0 fail, 3 skipped · survivors 13/13 · lint:tokens 4 · audit 91/107 (handoff says 92; 91 is the measured start, gate is "no worse than 91")

## Batch A: safe files
| id | evidence | fix | pass condition |
|---|---|---|---|
| F4 | facts.md:15 "LangChain's Python SDK" vs facts.md:250 "deepagents SDK" | facts.md:15 to "deepagents SDK" | grep "LangChain's Python SDK" in content/app/lib = 0; MCP "Python SDK" lines unchanged |
| F14 | survivors.sh:11 literal 'PROMPT_VERSION = "v3.5"' | read version from policy.ts, floor v3.5 | bump to v3.6 keeps survivors n/n; v3.4 fails |
| F15 | film.test.ts:95 fails when clips not checked out | skip only when every clip is absent | sparse checkout: skipped with message; partial missing still fails |
| F1 | demo/route.ts:91 caches any answer incl. provider null | cache only provider != null and route answer; else serve authored brief + note | AGENT_FAULT=chat: brief + "Models resting, showing the summary", not cached |
| F2 | demo route calls ask() on cold start; prewarm.json has no hero entry, no timestamp | route serves prewarm entry when present with ranAt; prewarm.ts writes ranAt | cold GET with entry makes no model call. Re-bake needs a live run (not allowed): PENDING Kushal |
| F9 | track/route.ts:43 logs detail; Agent.tsx:643 sends raw question | server drops detail for agent_asked and any non-allowlisted event | free-text ask logs "agent_asked" with no text |
| F10 | budget.ts in-memory Map | Neon counter (hashed IP) with memory fallback | two instances share count; works with Neon unset |
| F13 | health has no degraded or seed age | add degraded24h, seedAgeMs; scripts/smoke.ts | smoke fails on providers=0 or degraded seed |
| N31 | ask/page.tsx only sets og title | title, twitter title, descriptions | /ask?q=foo: title, og:title, twitter:title contain foo |
| N32 | layout.tsx:192 Person JSON-LD exists | none | verified, skip |

## Needs Kushal
- F18: facts.md:435 marks visa under "@kind private, answered only when asked". Showing it in the UI breaks that rule.
- F2 re-bake: needs one live prewarm run.

## Batch B on (other session's files, last)
F3 F5-F8 F11 F12 F16-F44 N1-N30 N33 N34, each a small edit; listed per batch with evidence when started.

## Batch A result (gates: build ok, screen PASS, tsc 0, unit 163/0/3 skip, survivors 13/13, tokens 4, audit 91/107)
| id | state | evidence |
|---|---|---|
| F4 | DONE | facts.md:15 now "deepagents SDK"; grep "LangChain's Python SDK" = 0 |
| F14 | DONE | survivors reads policy.ts; 3.5/3.10/4.0 pass, 3.4 fails |
| F15 | DONE | skips only when every clip is absent; a partial gap still fails |
| F1 | DONE | no providers here: /api/agent/demo twice = brief + "Models resting, showing the summary", no-store, never cached. Hero.tsx ignores a degraded reply (1 line) so no fake 0 ms |
| F2 | PARTIAL | route serves the baked entry with its bake time; prewarm.ts writes ranAt. The bake has no hero entry and re-baking needs a live run: Kushal |
| F9 | DONE | agent_asked logs len=N only; a non-token detail ("jane@x.com call me") is dropped |
| F10 | DONE server | Neon upsert on hashed IP, 400 ms cap, memory fallback (bad URL falls back in 17 ms; 60 asks hit the wall). Stream sends {type:"budget"}; the "N left" line is Agent.tsx, batch B |
| F13 | DONE | health: degraded24h, seedAgeMs; `npm run smoke <origin>` fails on providers=0 or no seed |
| N31 | DONE | /ask?q= title, og:title, twitter:title lead with the question; site name and description restored |
| N32 | SKIP | Person JSON-LD already at layout.tsx:192 |
| N34 | DONE server | degraded counter + one "degraded" warn line per fallback (grep -c per day) |
| F18 | DONE | facts.md frontmatter `sponsorship:` (Kushal's wording, 2026-10-26); hero role line in ClassicPage.tsx:394 appends it. Gates: screen PASS, unit 0, survivors 13/13, facts ok, tokens 4, audit 91/107. Phone: line adds one row, Email button moves down about 14px |

## Batch C: agent card words, trust, flows (gates: build ok, screen PASS, unit 165/0/3, survivors 13/13, tokens 4, audit 91/107)
| id | state | evidence |
|---|---|---|
| F3 | DONE | warm answers read "Cached run · N ms · <age>"; age from the bake's ranAt, sent by the server in the done event |
| F5 | DONE | "in 57 hours" cut from the brief (facts.md brief). Kept: hero proof line and the opensource section claim, which is the evidence with its link (N4/N6) |
| F6 | DONE | free-tier note: "92% of a 95% target"; target served live by /api/health targets.groundedness from ground.ts GROUNDEDNESS_TARGET (also used by the release gate) |
| F7 | DONE | trace board: "Matched by words and meaning", tier row removed, "Sentences with a source", no-model answers say "Answered from his record, no model" |
| F8 | DONE | footer from /api/health live: "Running on cached answers" when 0 models ready, "Up · N of M models ready" otherwise |
| F11 | DONE | vote beacon: down/up + reason slug + prompt version + route + FNV hash of the question, never its text; vote already visible inline |
| F12 | DONE | track("ui"): journeys, tally, full view open/close, strip, sources, trace, free-tier chip, copy/share, paste-jd |
| F16 | DONE | thread saved to sessionStorage after each finished turn, restored on reload (verified by shot) |
| F17 | DONE, as a tool | match_job: fourth agent tool (tools.ts), enum-only param per the repo rule, runs first on any pasted job description with no model, rows lead the answer; "Paste a job description" opener; unit tests |
| F21 | DONE | brief spells out "Lead Backend Engineer (Research Assistant)" once |
| F22 | DONE | island states 24 chars or fewer; "Neon pgvector" gone from the island |
| F23 | DONE | "A draft is ready to send" |
| F24 | DONE | strip reads "Read the rest"; the Read: list and second Full view removed |
| F25 | DONE | tally "tests it never saw, Oct 26", date never wraps |
| F26 | DONE | chip "Free models · why slow?" |
| F27 | DONE | "Try to break it · ask something it should refuse", visible, not a hover title |
| F34 | DONE | island aria-live off while running, polite on the final state |
| F35 | DONE | tally buttons named "4 tools it can call. Ask: ..." |
| F36 | DONE | Résumé button shows "PDF · 1 page" |
| N33 | DONE | read-80% fires scroll_deep (was never fired); funnel now land, interact (ui), ask, read 80%, contact |
| F28 | REJECTED for now | "RECORDED · 2 S AGO" lives in app/components/film/*, the other session's film files |
| F19 | VERIFIED | recruiter journey already opens experience + résumé path; no change |

## Batches D-F result (gates: build ok, screen PASS, a11y PASS, unit 166/0, survivors 13/13, hardcoded colours 4 -> 0, audit 91 -> 94/107)
| id | state | before -> after |
|---|---|---|
| F29 | DONE | phone typing: chip + dock stayed on screen -> both step aside; asserted in ui-agent-screen.py |
| F30 | DONE | chip row scrolled with no cue -> "N records · swipe" label (edge fade refused by audit 2.5) |
| F31 | DOCUMENTED | Referrer route is phone-only by design (data-only="phone"); desktop has the Introduce panel in contact |
| F32 | DONE | full-view arrow sat on chip rows -> own gutter, full view only |
| F33 | DONE | 3-4 glance hints -> 2 + "N more" |
| F37 | DONE | scripts/ui-a11y.py: 70 tabs, Esc closes full view, contrast, title-only names |
| F38 | DONE | Email hint 3.0:1 (old lime-sheen rule painted link blue) -> #0071e3, passes 4.5:1 |
| F39 | PARTIAL | lime sheen + loop removed (-22 lines); 0 provably dead declarations among repeated selectors, so no blind -40% |
| F40 | DONE | 17 dead classes deleted (Agent, Artifacts, Compare, Measured, page.module.css); CSS still 57.5 KB gzip vs 20 KB budget |
| F41 | DONE | docs/adr-011..014; audit 9.7, 13.1, 13.4 now pass |
| F42 | DONE | 4 mask #000 -> var(--mask-solid) |
| F43 | REJECTED | backdrop-filter: none is what stops the film-live 12px blur on the console |
| F44 | DONE | island oklch literals -> --island-* tokens |
| F20 | DONE | ADR-014 voice: hero first person, agent third, status no person |
| N1 | DONE | 390: proof + Email below fold -> both in first screen (order on phone) |
| N2 | DONE | opener labels were accent on static text -> ink; accent left on Email and the 57 link |
| N4/N6 | VERIFIED | first-screen claims are links or ask-the-agent taps; 57 links the merged PR |
| N7 | NOT DONE | 38 interactive items at 1440: brief terms + record chips are Q2, other session |
| N9 | DONE | job coverage was shown twice -> once (match_job) |
| N10 | MEASURED | first visible change 107-108 ms after Ask |
| N11 | VERIFIED | island phases come from stream events (route, sources, token, done) |
| N12 | PASS | LCP 392 ms / 2.3 s, CLS 0.072 / 0 |
| N13 | PASS | Email, Résumé, Ask 44 px+ in phone bottom zone |
| N14 | DONE | Back left the site with full view open -> closes the full view |
| N15 | DONE | 2 cert logos named only by hover title -> aria-label |
| N16 | DONE | refusal said "Done in 20 ms" -> "Answered, off topic"; fallback note 17 -> 10 words; offline 13 -> 7 words |
| N17 | PASS | offline mid-run: Retry recovers, no reload |
| N18 | DONE | "Open in a window" -> "Full view" everywhere (label in name) |
| N19 | DONE | "Copy" -> "Copy answer", "Share" -> "Copy link" |
| N20 | PASS | no filler in visible copy |
| N21-N24 | NOT DONE | 10 font sizes, off-8pt em gaps: type scale is the Apple restyle / DESIGN.md, other session |
| N25 | VERIFIED | paced streaming is the one motion on the answer; respects reduced motion |
| N26 | NOT DONE | contact section layout is Q home restyle |
| N27 | DONE | 2 next questions -> 1, ranked by sources |
| N28 | DONE | "Questions aren't saved. Your thread stays in this tab; a hashed address counts today's limit." |
| N29 | DONE | looping CTA sheen removed; pulse only while running |
| N30 | DONE | "Also running" -> "The agent on this page"; "What else checks out" -> "Certificates you can check" |
| N31 | DONE | /og?q= renders (image/png); /ask title + og:title carry the question |
| F28 | NOT DONE | film/* is the other session's |
| F2 | PENDING KUSHAL | run `npm run prewarm` once with keys |
