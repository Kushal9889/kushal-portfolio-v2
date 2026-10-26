# Design System: Kushal Gaddamwar, portfolio v2 ("Context Window", Apple pass)

**Current system: Apple (2026-10-26).** Both `/` (`/classic`, `app/ClassicPage.tsx`)
and `/stage` follow the Apple product-page rules in section 0. Where a later
section still describes the September build (orange accent, square corners,
warm greys), section 0 wins. Keep it when editing: other sessions read this file.

## 0. The Apple system (read first)

**Colour.** One accent, Apple blue. Nothing else is saturated except the three
system status colours, and those only where they mean their status.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--paper` | `#000000` | `#f5f5f7` | Ground |
| `--paper-raised` | `#1d1d1f` | `#ffffff` | Tiles, cards, the agent console, the full view |
| `--paper-high` | `#2c2c2e` | `#ffffff` | A tile on a tile |
| `--ink` | `#f5f5f7` | `#1d1d1f` | Text |
| `--ink-soft` / `--ink-faint` | `#d2d2d7` / `#a1a1a6` | Apple light values | Secondary and tertiary text |
| `--rule` | `#424245` | Apple light value | Hairlines |
| `--signal` | `#2997ff` | Apple light blue | Marks, strokes, focus, links on dark |
| `--fill` / `--fill-hover` | `#0071e3` / `#0077ed` | same | Filled buttons; `--on-fill` is white (4.5:1) |
| `--live` / `--warn` / `--fail` | `#30d158` / `#ff9f0a` / `#ff453a` | system light values | Status only (ADR-003) |
| `--scrim` / `--scrim-deep` | black at 55% / 86% | same | Behind a sheet or the full view |

Values live in `app/globals.css` (`:root`) for `/classic` and in `app/stage.css`
(`[data-stage]`, written in OKLCH: blue `oklch(0.669 0.1808 251.84)`, fill
`oklch(0.5629 0.1933 256.16)`) for `/stage`. Components never carry a colour
literal (`npm run lint:tokens`, which also reads comments: describe a colour in
words, never by its hex).

**Type.** `--font-apple` and `--font-apple-display`: the system stack, so Apple
devices render SF Pro. Sentence case only, no `text-transform: uppercase`
anywhere. Mono is for code, identifiers and machine lines, not for labels.

**Shape.** Radii 8 (`--r-sm`), 12 (`--r-md`), 14 (`--r-lg`), 18 (`--r-panel`),
pill 980 (`--r-pill`). Chips and the island are pills; starter cards and tiles
use 14; the full view and large panels use 18. No corner brackets, no
viewfinder marks, no dot grids.

**Surfaces.** Flat tiles on black. No glow, no lit top edge, no sheen, no
gradient fill on a control. Elevation is one surface step; the only shadow is
the full view's soft drop onto the scrim.

**Components.**
- Primary action: `--fill` with white text, flat, `--fill-hover` on hover.
- Record chips under the brief: pills on `--paper-raised`, blue only on hover.
  Kind is the issuer or role, name is the rest (`remainder()` in
  `lib/agent/chips.ts`, so "NVIDIA" + "Professional: Agentic AI"). Order is
  picked by the answer in view (`rankChips`), never shuffled.
- Answers: only the first figure gets the blue underline wash; at most five
  points show, the rest behind "Show N more".
- Film cards: line, one small drawing (`FilmSketch.tsx`, grey shapes, one blue
  part), then rows tagged Measured (vitals), This site (code or corpus) or
  Typical (a cited standard size). Cards are hidden under 768px.
- Free-tier note: a card at top right on wide screens; on a phone it sits in
  the page flow under the agent, never fixed over content.

**Banned colours (AI tells).** Neon lime, gold or cream accents, purple or
indigo gradients, cyan glows, warm cream with oxblood, a blue radial glow behind
a scene (`--scene-light` is `none`). Frosted glass needs `backdrop-filter`,
which audit 2.6 bans; do not add it without changing the audit with Kushal.

**Class names** must not contain: frame, cta, source, status, stack, label,
link, item, value, code, stop, send, primary, detail, wrap, seed, cell, count.

---

The sections below are the September 2026 record of `/stage`. Read every
"International Orange" or "orange" as Apple blue (`--voltage` now holds it),
"square corners, no radius" as the radii above, and warm greys as the Apple
greys.

This file describes the stage home page as it shipped in September 2026. Every
value below is read from `app/stage.css` and the stylesheets in
`app/components/stage/`. It supersedes "Paper / Machine", which is kept at
`docs/design-paper-machine.md` as the record of the previous system. The
complete record at `/classic` still renders under that previous system.

Scope: verified at 1440x900 and at 390px. Nine chapters, in the order the graph
runs them: the agent (`#top`), Open source (`#bug`), Measured (`#measured`),
Work (`#work`), Built (`#built`), Research (`#research`), Credentials
(`#credentials`, with `#proof` kept as an alias), Beyond (`#beyond`), Contact
(`#contact`).

## 1. Visual Theme & Atmosphere

The page is a context window. He builds what goes into a model's context, so the
site behaves like one: the reader's scroll feeds it, evidence arrives out of his
own corpus and lands on the glass, and when the window is full the only thing
left to do is send.

- **Register.** Cinematic, over data a reader can check. Variance 9, motion 9,
  density bimodal: airy chapters (3) around one dense instrument (7, the
  Measured bento).
- **One ground, top to bottom.** Every chapter sits on Void. The page used to
  alternate full-width black and white chapters, so every chapter edge was a hard
  cut and the field vanished under the white ones. The off-white now appears only
  as what it physically is: the two sheets of paper on the page, the incident
  report in the bug chapter and the published paper in Research. The one change of
  ground left is the finale, and it is grown from a point rather than cut to.
- **One continuous field.** The corpus field, 871 particles from a PCA of the
  retrieval index (67 passages, 18 sections), runs behind every chapter for the
  whole length of the page. The camera travels a single curve through it: the
  dive, then a station per chapter at the cluster of the corpus that chapter was
  written from, then the finale's view of the whole field. It dims while a chapter
  is read over it and brightens and disperses between chapters, so a seam is the
  field's moment and a chapter is the reader's. It draws nothing at rest.
  On a machine reporting four cores or fewer the term particles are thinned to a
  third, so the field keeps its shape at about 360 points.

## 2. Color Palette & Roles

| Name | Value | Role |
|---|---|---|
| **Void** | `oklch(0.16 0.002 90)` (about #121211) | Ground of dark chapters, the page behind the document |
| **Void Raised** | `oklch(0.205 0.002 90)` | Console core, bento cards, role slabs, proof cards |
| **Sheet** | `oklch(0.975 0.004 90)` | Surface of the two paper objects (`data-surface="sheet"`): the bug report and the paper |
| **Ink on void** | `oklch(0.96 0.003 90)`, soft `oklch(0.76 0.003 90)` | All text on the ground |
| **Ink on sheet** | `oklch(0.18 0.003 90)`, soft `oklch(0.42 0.003 90)` | Text on the paper objects |
| **Hairline** | `oklch(0.96 0.003 90 / 0.14)`, strong `/ 0.26` | Every structural line; on sheet `oklch(0.18 0.003 90 / 0.14)` |
| **International Orange** | `oklch(0.6697 0.2218 37.48)`, #FF4F00 | The only accent |

The accent is scarce and every use names something:

- the primary action
- the impact flash
- wires from source chips and the clusters they retrieved
- the four nearest terms in the dive
- conditional edges in the compiled graph
- eval groups and cases that dropped a run
- the current chapter tick and role marker
- the merged state
- added lines in the merged patch, at 12%
- graph nodes the opening answer ran through
- the active command in the palette
- the finale ground

Measured contrast (WCAG, sRGB compositing):

- Ink on orange is about 6.0:1.
- Orange on void is about 5.9:1.
- Soft ink on orange is set at 86% alpha, which gives about 5.0:1 for the 14px sub-lines.

## 3. Typography Rules

Five voices plus one scoped exception, all self-hosted and subset to Latin
(`app/fonts/`, licences in `app/fonts/LICENSES.md`). Each chapter declares its own
scale; there is no shared type scale.

| Voice | Face | Where |
|---|---|---|
| Spine | **Switzer** 300 to 600 | UI, body, labels |
| Signature | **Mona Sans** variable, normal and italic | The wordmark, the hero qualifier, the Contact title |
| Plate | **Hubot Sans** variable (wght 200 to 900, wdth 75 to 125) | Every display figure and nameplate |
| Paper | **Sentient** 400 to 700 | The Research chapter, the one place a serif is earned |
| Data | **Martian Mono** | Units, identifiers, counts, stamps, machine lines |
| IBM Plex Mono | 400 and 500, **scoped** | Course names on the two IBM credential plates only |

Basement Grotesque, Cabinet Grotesk, Nippo and Commit Mono were retired in
phase 4 and their files deleted. Hubot Sans carries every weight and width they
covered, from one variable file.

**Axis coordinates.** A display object names its coordinate rather than setting
weight and width by hand: `signature` Mona 780/104 italic, `plate` 800/100,
`plate-narrow` 760/82, `plate-wide` 700/118, `nameplate` 680/96,
`nameplate-light` Mona 420/110, `monument` 820/90, `monument-wide` 700/120.

- **Macro sizes.**
  - "Work" `clamp(5rem, 11vw, 11rem)` at 800 and "Get in touch" `clamp(6rem, 13vw, 13rem)` at 900.
  - "57" `clamp(9rem, 22vw, 20rem)` and "91.4%" `clamp(6rem, 12vw, 11rem)`.
  - Tracking never goes tighter than -0.04em. Leading is 0.78 to 0.86.
- **Hero headline** Hubot `clamp(2.75rem, 4.4vw, 4.6rem)`, weight 800, -0.02em.
  - Two lines at 1440 in a 7-column identity, then an italic Mona qualifier at
    0.56em, weight 300.
  - The role line under it is a plate: a 6px square in Boston University's
    scarlet, the lab in full ink, a scarlet rule that draws in once, and one
    sheen pass on arrival and on hover.
  - The role line carries the live readout of the answer on load.
- **Body** 1rem to 1.125rem, leading 1.5 to 1.55, measure 38ch to 62ch.
- **Data: Martian Mono** 0.8125rem to 0.9375rem, for code, identifiers, counts, stacks and the reading meter.
- Sentence case everywhere. No uppercase micro-labels, no eyebrows, no section numbers.

## 4. Component Stylings

- **Buttons.**
  - Square corners.
  - The primary is International Orange with ink text, 52px tall, a lighter orange on hover and a 0.97 press.
  - Bar controls are 40px hairline outlines.
  - In the finale, the email row is the one reversed fill: void on orange.
- **Console.** A shadowless double bezel.
  - The outer tray is a 1px hairline at 94% void with 6px of padding.
  - The inner core is Void Raised with its own hairline and a brighter top edge.
  - Fixed height, so the arriving answer never resizes the hero.
- **Cards, slabs, sockets.** Void Raised, one hairline, brighter top edge, no shadow, no radius.
- **Measured bento.**
  - A 4 by 3 grid drawn by a 1px gap over the hairline colour: five sockets and one full-width disclosure row.
  - Sockets exist before the cards arrive.
- **Source chips.** Mono label, hairline, 6px orange end mark where the wire leaves.
- **Disclosure.** A summary row with a plus that turns to a minus. The list opens upward over the bento, so a pinned screen never grows.
- **Input.** The ask field is a hairline box whose border turns orange on focus. Its label is visually hidden and present in the markup.
- **States.**
  - The console says "Retrieving from the corpus" while waiting and "The agent is unreachable right now" on failure.
  - With scripts blocked the pending line is removed and replaced by one that says the panel needs JavaScript and the rest of the page does not.
  - It flags a degraded answer when no model responds.
  - The live probe says it "could not be checked from here" rather than reporting an outage.
- **Paper objects.** Sheet, no border, no shadow, no radius: their own edge is the
  only edge. The bug report carries the merged patch behind a disclosure in its
  caption row; the patch opens over the walk-through on the same sheet with old
  and new line numbers, so a pinned chapter never changes height.
- **Provenance chips.** The one component repeated across chapters on purpose,
  because the page's claim is that it cites itself. A small "source" outline
  beside a figure opens a native popover (anchored with CSS anchor positioning,
  centred by the browser where that is unsupported) naming the file the figure is
  read from, when it was measured, and a link to check it.
- **Command palette.** On ⌘K: every chapter, the agent, and each way to reach him,
  filtered as you type. Links are real anchors. The agent keeps its own `/` key and
  button.
- **Focus.** 2px orange outline, or ink on the orange ground.

## 5. Layout Principles

- Every chapter is one screen, pinned, 100vh with a 680px to 760px floor.
  - Side gutters `clamp(24px, 5vw, 88px)`.
  - A 64px bar and chapter ticks on the right edge.
  - The bar is clear over the hero and solid Void everywhere else, so it never
    changes colour between chapters. It turns orange only over the finale, read
    from the top 8% of the screen; the ticks read the chapter beside them from
    the middle of the screen.
  - Without a script the bar keeps its solid ground rather than letting a chapter
    scroll through the wordmark.
- No layout family repeats. Chapter by chapter:

| Chapter | Layout |
|---|---|
| Hero | 7/5 split |
| Bug | 5/7 claim and slab |
| Measured | Title over bento |
| Work | 4/8 pinned split with a rack |
| Research | 5/7 monolith and result |
| Proof | Horizontal track |
| Finale | 6/6 title and register |

- Pin lengths:

| Chapter | Pin |
|---|---|
| Dive | +100% |
| Bug | +150% |
| Measured | +100% |
| Work | +180% |
| Research | +110% |
| Proof | 0.7 times the track overflow |
| Finale | +90% |

  The document is 15,027px at 1440x900.
- Without the motion bundle (reduced motion or scripts blocked), nothing is assembled:
  - Work slabs stack in flow.
  - Proof cards wrap.
  - The finale is orange from the start.
  - The page is 8,484px and complete.

## 6. Motion & Interaction

- **One system.** GSAP with ScrollTrigger, fetched on the first idle after paint. Nothing is requested under `prefers-reduced-motion`.
  - Pins use `start: "top top"`, `pin`, `scrub: 0.8`, `anticipatePin`, `invalidateOnRefresh`.
  - Callbacks wait out a ScrollTrigger re-measure and then re-read the real position (`watchRefresh`).
- **Impact.**
  - Arrival over 620ms from `translateZ(-1400px) scale(0.7)` on `expo.out`, overshooting to 30px and 1.03.
  - Settles over 180ms on `back.out(2)`.
  - At the hit (about 340ms): a 2px shake and a 160ms orange hairline flash.
  - **Collide:** a docking card pushes seated neighbours about 4px, with a 500ms elastic return.
- **Signature moments.**
  1. **The wired answer.** Hairlines run from each source chip to the projected centroid of the cluster it came from.
  2. **The dive.**
     - The camera banks into the field along a curve through a bend point toward the LangChain cluster: field of view 40 to 70, the headline flying through the glass.
     - As the label naming that cluster arrives, the cluster answers it with one short flash of orange.
     - Real corpus terms pass the lens: nearest first, one copy each, never overlapping.
     - The terms are the ones that tell sections apart. They are scored by
       frequency against inverse document frequency and anything appearing in
       more than a third of the passages is dropped, because raw frequency filled
       the dive with "because", "already" and "enough".
  3. **The bug.**
     - "57" impacts.
     - The code slab tilts from 58 degrees to flat, and the bad line is struck.
     - The verdict and the fix arrive, then the merge sheet lands with a hit.
  4. **Measured.** Five cards dock one after another and shove their neighbours.
  5. **Work.** Each role arrives from below and shoves the previous one back into depth (z -220, 6 degree tilt, scale 0.9, raised 16px), and its figures land.
  6. **Research.**
     - The paper turns from edge-on (88 degrees) to face the reader.
     - "91.4%" impacts.
     - Accuracy and timing bars grow from a true zero.
  7. **Proof.** The title is held in its own column while the cards pass across the frame, each turning from -24 degrees as it enters. Moving the title with the track meant it left the screen before it could be read.
  8. **Context full.** The field gathers into one point, turning orange as it tightens; the point floods the screen and the title lands.
- **The field between chapters.** `app/components/stage/director.ts`.
  - One centripetal Catmull-Rom curve through the dive's end pose, a station per
    chapter (`stations.ts`), and the finale's opening pose, so neither handover is
    a cut. Each station looks at the centre of the sections that chapter draws on.
  - The camera follows scroll on a critically damped spring (ω 7.5), so it eases
    to rest when the reader stops instead of stopping dead, then draws nothing.
  - Midway between two chapters the particles are advected two steps along a
    divergence-free curl field (peak 0.85) and the field lifts in brightness; at a
    chapter it settles and dims to between 0.22 and 0.3. Each seam has its own
    seed.
  - The nearest station's sections glow at 0.3; the hero's answer glow returns
    when the reader scrolls back up.
  - Particles fade on a curve toward the far plane instead of clipping.
  - If the field cannot hold 50 frames a second while drawing continuously, it
    stops redrawing rather than taking the page's frames with it.
- **Settled anchors.** A pinned chapter is a range of scroll, so its own start is
  an empty stage: the bento with no cards in it, the paper edge-on. Every chapter
  publishes the scroll position at which it has finished assembling, and a link
  or a tick to that chapter lands there.
  - Bug 0.92 of its hold, Measured 0.70, Work 0.86, Research 0.88, the finale its
    end. Proof keeps its start, where the title and the first cards already read.
  - Each role in Work is linkable (`#work-questrom`, `#work-img`, `#work-growaza`)
    and lands on that sheet settled; the role index rows are those links. A shared
    link with a hash lands on the settled position once the page has measured.
- **Keyboard in the pan.** Tabbing into a Proof card the pan has not reached
  moves the page to the point in the hold where that card is on screen.
- **Reading meter.**
  - "≈ tokens read" is the words in each chapter, times the share of that chapter passed, times 1.33.
  - It is hidden when motion is off rather than reading zero.
- **Renderer.**
  - Raw WebGL2, one POINTS draw, render on demand, device pixel ratio capped at 1.5.
  - Curl dispersal, depth fog and field brightness are uniforms in the one shader.
  - The field is never a still picture: while it drifts it draws on every frame
    the display offers. At rest it wanders at full amplitude, while the reader
    scrolls it keeps a quarter of it, and a hidden tab draws nothing.
- **Bands.** Feedback 120ms to 150ms, state 200ms, authored arrivals 500ms to 800ms.

### 6.1 The eight verbs

Every motion on the stage is one of eight, named for what the graph does, so a
reader who watches the page learns the vocabulary the agent uses (`lib/verbs.ts`).

| Verb | Alias | Duration | What moves |
|---|---|---|---|
| condense | retrieve | 700ms | A title gathers out of the field cluster its chapter was written from |
| settle | persist | 900ms | A number rolls to its value, digits right to left |
| pulse | observe | 240ms | A live value reports, with the time it was read |
| stamp | verify | 420ms | A plate drops and seats, registration corners draw |
| print | generate | per line, word or character | A document types itself: 18ms a line, 28 words a second, 90 characters a second |
| dock | evaluate | 500ms | A card arrives from depth and shoves its seated neighbours 4px |
| dissolve | evict | 450ms | Something leaves toward the cluster it belongs to |
| flood | act | 1.1s | The ground changes, grown from the control that caused it |

Each verb has a reduced-motion variant that lands on the finished state without
the travel, and emits one `stage:verb` event, which is the only thing the audio
engine listens to.

### 6.2 Materials

- **Grain.** A 256px blue-noise tile generated at build time by
  `scripts/build-grain.ts` (void-and-cluster, fixed seed), on a fixed layer at
  3.5%, one texel per device pixel on a 2x screen. Never `feTurbulence`.
- **Foil.** The credential plates carry a 6px band of thin-film colour whose hue
  travels with the pointer or the device tilt, multiplied by a generated height
  tile of embossed security foil. Never behind text.
- **Chrome.** The Research figure is filled with a matcap through
  `background-clip: text`, sampled at a point that moves with the pointer. A
  browser without `background-clip` keeps the figure in ink.

### 6.3 Sound

Off on every first visit, and the toggle is the only thing that creates or
resumes the `AudioContext` (`lib/audio.ts`). `stamp`, `print` and `dock` are
recorded hits, fetched only after the first opt-in, Opus with an AAC fallback,
normalised to -12 dBFS; the other five voices are synthesized. `print` is rate
limited to one strike per 90ms. A missing or undecodable file makes every play a
no-op with nothing written to the console.

### 6.4 The rail

The right edge is the compiled agent graph, not a row of pips: `start`, `route`,
`retrieve`, `answer`, `act`, `end`, with the conditional branch out of `route`
drawn dashed. Each chapter's segment hangs under the node that reads it and is
as tall as that chapter's share of the page's words. Nodes fill as they are
reached, the current one takes the accent, and the status reads an estimate of
the tokens read, then "Context full". Under 768px it is a 2px progress line
under the bar and no graph.

### 6.5 Narrow layout

At 390px every chapter is one column and nothing is scaled down to fit: grids
collapse to a single track (left at their desktop track count, every column
measured zero and each child sized to its own content instead), data art scales
to the column through its viewBox, machine lines wrap, and code blocks scroll
inside themselves. Verified: nine chapters, no clipped content, document width
exactly 390.

## 7. Anti-Patterns (Banned)

- No eyebrows, section numbers or uppercase label strips. The agent drawer's small capitals are reset to sentence case inside the stage.
- No second accent. Vendor marks take the ink on the blue ground.
- No shadows for elevation. Hairlines and one surface step only (the full view is the one exception, section 0).
- No corner radius beyond the Apple radii in section 0. The flood disc is a ground, not a component.
- No em dashes or en dashes in visible text. None of the banned vocabulary.
- No comparison bars on filled tracks. Bars start at a true zero, with the value beside them.
- No split headers with a sentence floating in the far corner.
- No chains of middle dots. Stacks are lists.
- No fact typed into a component. Every figure is derived from:
  - `content/facts.md`
  - `content/certifications.json`
  - `content/evals.json`
  - `content/models.json`
  - `lib/agent/topology.json`
- No scroll listeners. ScrollTrigger and IntersectionObserver only.
- No work-authorisation detail on the page.
- No emoji, no custom cursor, no gradient text, no glow.
