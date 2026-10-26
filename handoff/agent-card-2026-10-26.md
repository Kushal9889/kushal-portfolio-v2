# HANDOFF: agent card + Apple pass (2026-10-26)

You are continuing Kushal Gaddamwar's portfolio v2. Read this file only, then act. Do not re-read the earlier session.

## 0. Setup (run once, exactly)

```bash
git clone --depth 30 --filter=blob:none --no-checkout -b wip/agent-card-2026-10-26 https://github.com/Kushal9889/kushal-portfolio-v2 v2 && cd v2
git sparse-checkout set --no-cone '/*' '!/public/film/' && git checkout
npm ci --no-audit --no-fund && pip install -q playwright
npx next build && (nohup npx next start -p 3002 >/tmp/srv.log 2>&1 &)
python3 scripts/ui-agent-screen.py          # must print PASS (5 sizes)
```
- `public/film` (2.5 GB video) is left out on purpose. One unit test (`every clip the map names is a shipped file`) fails only because of that. Ignore it.
- To look at a film frame: `git show HEAD:public/film/<path> > /tmp/x.webp`.
- Kill the server by PID (`ps aux | grep next-server`). Never `pkill -f "next start"`, which kills your own shell.

## 1. Rules (hard)

- Reply to Kushal in two plain lines, **Done / Pending**. No jargon, no em dashes. He reads on a phone.
- After every build or screenshot run, send him the PNGs (copy to your scratchpad, then SendUserFile).
- **Do not commit.** Save with `bash handoff/checkpoint.sh "<note>"` after each finished step. It pushes the working tree onto `wip/agent-card-2026-10-26` and leaves HEAD alone. Push nothing else, and never touch `main` or PR #2.
- No AI attribution anywhere. Never commit `.env*`.
- Build with `npx next build`, never `npm run build`.
- **No live model calls**: no prewarm, no agent-scenarios gate, no bench-models. `npm run bench` is cached and allowed.
- Facts about Kushal come only from `content/facts.md`, `content/certifications.json` or `/api/health`. Never invent one.
- CSS class names must not contain: frame, cta, source, status, stack, label, link, item, value, code, stop, send, primary, detail, wrap, seed, cell, count.
- **Design skills**: do NOT use `anthropic-skills:*` (Kushal says they produce AI tells). Use his plugins: `design:design-critique`, `design:design-system`, `design:accessibility-review`, `gstack:design-review` (AI-slop audit).
- **No AI-slop colors**: no neon lime, gold or cream accents, purple or indigo gradients, cyan glows, or warm cream plus oxblood. One accent: Apple blue.

## 2. State

- `main-2026-10-25` = `8829dea` (pushed). It holds T1 to T12 plus: one named "Full view" button, a "Continues below · Read:" strip, load-answer Sources, the free-tier note as a chip, a 44px code link, and the new `scripts/ui-agent-screen.py`.
- `wip/agent-card-2026-10-26` = `8829dea` plus the **uncommitted Apple pass A1/A2** below. Screen check PASS at 5 sizes. Not yet re-run since A1/A2: tsc, unit, survivors, `npm run audit` (baseline 92/107, 2 blocking failures that predate this pass), `npm run lint:tokens` (baseline: 4 hard-coded colors).

### Apple pass, done (A1/A2)
- `app/globals.css`, `:root`: Apple dark tokens (#000 ground, #1d1d1f raised, #2c2c2e high, #f5f5f7 ink, #d2d2d7 / #a1a1a6 soft and faint, #424245 rule, #2997ff signal), `--fill #0071e3` / `--fill-hover #0077ed` / `--on-fill #fff`, system colors #30d158 / #ff9f0a / #ff453a, radii 8/12/14/18/pill 980. Font: `--font-apple` and `--font-apple-display` (the system stack, which renders SF on Apple devices). Light theme set to Apple light values. Console surface uses #1d1d1f tiles with no dot grid. `h1 .quiet` is no longer italic. Film bay brackets removed.
- `app/scenes.css`: the type block and the scene tokens use the Apple values. Viewfinder corners deleted. The family pass now uses one tone (#2997ff) and no longer remaps semantic colors. Cards are tiles with no corner marks. Graphite is #1d1d1f.
- `Hero.module.css`: the CTA uses `--fill`. Journeys and tally are rounded `--paper-raised` tiles. Console is a rounded tile. **Grid fix**: `.body { grid-template-columns: minmax(0,1fr) }`; the phone layout was 407px wide.
- `FreeTierNote.module.css`: no gold. The note is a tile and the chip is a pill.
- Every `text-transform: uppercase` is gone (31 rules). Every `background: var(--signal)` is now `var(--fill, var(--signal))`. The home page doesn't load globals.css, so it falls back unchanged.

### Apple pass, still visible as wrong
- The "Free tier" chip on a phone sits above the dock and covers content tiles.
- 13 oklch literals are left in `Agent.module.css` (`.island`, `.islandBand` and others), plus many in `scenes.css` (film or scene lighting, glows).
- The blue radial glow behind the hero image may read as an AI tell. Judge it.
- Frosted glass needs `backdrop-filter`, which audit 2.6 bans. Ask Kushal before changing the audit.
- In the film "Network fabric" card (`content/film.json`), "About 3 mm thick..." overlaps the big "FIBRE".

## 3. Queue

Done on 2026-10-26 (checkpointed, screen check PASS, tsc clean, token lint clean, audit 91/107):
1. A6: the brief is the only first view on the main page; the load turn and SEED_EVENT are gone (Hero still fetches the recorded run for the film).
2. A4: record chips ranked by the answer in view (`lib/agent/chips.ts`, tests in `tests/chips.test.ts`), issuer/name split, Apple pills.
3. A7: "Used N earlier answers" on a turn (stream.ts `memory` event, scope "tab"; slot for cross-session later).
4. A8: starters by visitor (3 on phone), "Reading ..." line on search, up-arrow edits the last question, "Email him about this", first figure only highlighted, at most 5 points, "(1)" tab title when an answer lands in a background tab, rounded starter tiles. Not done: changing the prompt to force short points (needs the agent gate and model calls).
5. A5: 9 film cards rewritten, each with a drawing (`FilmSketch.tsx`) and rows from `film.json` facts (`app/components/film/facts.ts`); "Fibre" overlap fixed.
6. Apple leftovers on the main page: phone free-tier chip in flow, agent colour literals to tokens, scene glow off, lime/cream/CTA sheen removed. C1: DESIGN.md section 0.

Kushal said /stage is a separate lab page: stay on the main page (`/`, ClassicPage). B1 recoloured /stage to blue before he said so; those edits only touch `app/stage.css` and `app/components/stage/*` and can be reverted if he asks.

Open: frosted glass (needs audit 2.6 change, ask Kushal); the unit test for film clips fails only where public/film clips are skipped.

## 4. Pending for Kushal (not yours)
Agent gate on prompt v3.5 (needs model calls and his go). Netlify env vars NEON_DATABASE_URL, GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY. Rotate the LangSmith, OpenRouter and NVIDIA keys. His local docs board (gitignored). Merge and deploy.

## Bring work to the Mac
```bash
cd /Users/kushalgaddamwar/vs_code/Claude/kushal-portfolio/v2 && git fetch https://github.com/Kushal9889/kushal-portfolio-v2.git wip/agent-card-2026-10-26 && git checkout FETCH_HEAD -- app scripts
```
