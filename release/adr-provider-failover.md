# ADR: provider failover moves failing models to the back

Status: Accepted 2026-10-25, amended 2026-10-30.

## Decision

Providers run in the order measured by `scripts/bench-providers.ts`. A failing provider rests for 15 minutes after a rate limit and 30 seconds after anything else. A resting provider moves behind the others rather than leaving the list, so one 429 from each backup cannot leave a single overloaded provider and then the degraded text.

A stream that closes without writing any text counts as a failure. A reasoning model can spend its whole output cap before its first word and close cleanly, which used to reach the reader as a blank answer credited to that provider.

## Rejected

Dropping cooling providers until all of them cool: it served 10 degraded answers on 2026-10-25 with two working providers keyed but never tried.

## Consequence

The panel and `/api/health` report configuration and cooldown for this server instance only. They do not probe a provider, and they say so.
