# app/kit: the interaction layer

Motion (`motion@14.1.0`, DOM API) for state the reader causes. GSAP
(`app/components/PageMotion.tsx`) keeps scroll entrances. The two never animate
the same property on the same element.

| Hybrid | Native part | Motion part | File |
|---|---|---|---|
| Scroll + interaction | GSAP ScrollTrigger entrances | hover lift, press depth | `Kit.tsx` |
| Disclosure | `<details>` (find-in-page, no-JS, a11y state) | height spring, interruptible | `Kit.tsx` |
| Certificate viewer | `<dialog>` (focus trap, Esc, top layer, backdrop) | FLIP from the clicked badge and back | `components/CertViewer.tsx` |

## Springs (`springs.ts`)

All `bounce: 0` (a click carries no momentum; fluid §4).

| Token | visualDuration | Use |
|---|---|---|
| `spring.touch` | 0.22 s | hover lift `y: -2`, arrow `x: 3`, press `scale: 0.985` |
| `spring.size` | 0.34 s | disclosure height |
| `spring.travel` | 0.42 s | card to viewer |

Every animation starts from the value on screen, so a second click mid-flight
reverses without a jump (fluid §3). `reducedMotion()` (OS setting overridden by
the site's Motion switch) turns all of it off; the dialog falls back to a CSS
veil fade.

## Opting in

- Cards: add `data-kit-card` to any element, or extend `DEFAULT_CARDS`.
  Hover is mouse only and has a 6px leave margin so a lifted card cannot
  flicker under a pointer resting on its edge (fluid §10).
- Disclosures: any `<details>` outside the agent UI. `.more` is left to the
  native `::details-content` transition where the engine supports it.
- Do not put a CSS `transition` on `transform` for a kit card: it smears every
  frame Motion writes. `translate`/`scale` individual properties are separate
  and safe for GSAP or keyframes.

The agent UI (`Agent*`, `AgentCompanion*`) is excluded by selector.

## Text helpers (`lib/typeset.ts`)

`typeset()` curls apostrophes and paired quotes at render; `longDate()` is the
page's one date style. The corpus keeps straight quotes and ISO dates because
the agent quotes it verbatim.
