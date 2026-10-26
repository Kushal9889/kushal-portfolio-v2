# Deployment verification snapshot

2026-10-25; candidate based on `0c030da` plus this PR. These results do not certify
production or the active sessions' uncommitted changes.

| Check | Observed result |
| --- | --- |
| Clean dependency installation | Passed |
| Original production build | Failed: client EvalMatrix imported server filesystem code |
| Boundary repair + Next.js 16.4.3 build | Passed |
| Fact verification | Passed: 20 sections, 109 resume keywords, 31 sourced metrics |
| Unit tests | 156 passed, 2 skipped pending corpus reconciliation |
| New gate propagation tests | 5 passed |
| New deployment-smoke and bundle self-tests | 7 passed, including corrupt PDF, malformed stream, media-in-function and missing trace/facts cases |
| Local HTTP deployment smoke | 6/6 passed: home, classic, health, PDF, llms, policy SSE |
| Integration suite | 20 passed, 2 failed retrieval assertions |
| HTTP system suite | 21 passed, 1 failed availability markup assertion |
| Browser journeys | 10/14 journeys passed; 4 role-title mismatches, plus 1 challenge-control edge-case failure |
| Primary control sizes/overflow | Passed at all 8 widths, 320 through 1920 |
| Repository audit | 93/107; 3 blocking: JEE assertion, prewarm freshness, missing private ADR directory |
| Production dependency audit | Reduced from 14 findings (1 critical) to 3 high; remaining voice dependency chain: kokoro-js -> transformers -> sharp |
| Source media / corpus mutation | No changes; full-quality assets retained |
| Site identity | Verified: existing Netlify `kushal-portfolio-223` |
| Git deployment wiring | Incorrect for this candidate: site watches old repository main |
| GitHub main branch protection | API returned `Branch not protected` |

Local JavaScript checks used Node 25.5.0. CI and Netlify configuration specify
Node 22; CI is the matching-runtime check and must pass before production.
The new dependency lockfile and framework must also pass the Netlify adapter
build. A successful local Next build alone does not prove that integration.

The repository audit's missing `docs/adr*` check depends on ignored private notes;
a clean checkout exposes that existing gate defect. Do not add fabricated ADRs
or suppress the test silently. Reconcile its contract separately.

The browser screenshots contain controlled agent responses and timing fixtures.
They are interface evidence, never production/model performance evidence.
Detailed reports remain local in `docs/`, `.claude/ux-evidence/` and the CI
artifacts. The existing fixture/quality assertions are left failing for the
owning sessions, per the request to focus this branch on deployment.

## Function packaging repair

The first Netlify preview attempt traced all 11,004 public files into the server
handler, producing about 2.9 GB of function contents. It was cancelled before
completion. Dynamic corpus paths allowed overly broad output tracing.
`next.config.ts` now excludes CDN assets and local/test material from server
traces and explicitly retains runtime content. The rebuilt trace union contains
1,437 files / 80,579,109 bytes, below the new 200 MiB ceiling. Public source assets
remain unchanged. The gate rejects public media in traces or missing runtime
facts. Adapter-packaged size and preview delivery still require verification.

## Still required before production

- Reconcile the active UI/agent commits and rerun affected checks.
- Clear security, integration, system and browser failures, and mandatory skips.
- Verify exact preview SHA, server streaming behavior and environment names.
- Configure required checks/publication controls; cut over the verified Netlify
  site from the old repository only when the candidate is ready.
- Collect live-provider/cold-start and real-device media evidence against the
  numeric contract. No production load or smoothness claim is made here.
- Verify previous deploy is available, rehearse rollback, promote and check the
  public resume URL. Production promotion has not been performed.

## Media, dependency and drift pass (2026-10-25, evening)

| Check | Observed result |
| --- | --- |
| Full-scroll bytes per visitor | desktop 4K 958 MiB, desktop 1080p 586 MiB, phone 163 MiB; see [ADR](adr-media-origin.md) |
| Film media gate (`verify:media`) | Passed: 10,817 frames and flow maps for 29 clips, 0 missing, 0 corrupt |
| Media staging for a separate origin | Passed: 10,818 files, largest 0.6 MiB (Pages limits 20,000 / 25 MiB) |
| Unreferenced mp4 masters in deploy | 1.1 GiB, now pruned on Netlify only |
| Production dependency audit | 3 high to 0: `sharp` overridden to 0.35.5 (patched), shared with Next |
| Server trace union | 80.6 MB to 64.0 MB after the sharp dedupe |
| Unit / release smoke + media / gate self-tests | 156 pass, 0 fail, 2 skips that were already there / 10 pass / OK |
| Integration | 20 pass, 2 fail, same failures as before this pass |
| Media origin deployed | `kushal-film.film-worker.workers.dev`: 10,817/10,817 files 200 as images; 133 samples byte-identical with CORS and the cache headers |
| Film from the origin (merged build, headless Chrome) | 1440x900: 1,741 frames, p95 61 ms; 390x844: 2,122 frames, p95 45 ms; every frame from the origin, 0 HTTP or console errors |
| Netlify env | `NEXT_PUBLIC_FILM_ORIGIN` set on site 5a02ef1d (all contexts); applies on the next deploy |
