"use client";

import { useMotion } from "@/lib/motion";

/**
 * Everything the page animates that does not belong to one component.
 *
 * Three behaviours, one mounted node, one lifetime. Splitting them into separate
 * components would mean three hidden elements and three copies of the same
 * arming logic for no gain, since they all want the same thing: run after first
 * paint, never before, and never at all under reduced motion.
 *
 * The page spends its authored sequence in the hero, where the console fills
 * with a real answer to a real question. Everything here is the quiet floor
 * under that, with one exception at the closing heading.
 *
 * Nothing here is ever hidden and then revealed. Every tween is a from(), so an
 * element is only animated out of a state it is already leaving. If this file
 * fails to load, or throws, the page is exactly what the HTML said it was.
 *
 * Anything already on screen when this arms is left alone. ScrollTrigger reports
 * those as entering the moment it initialises, and animating them would mean
 * pulling text out from under someone mid-sentence, so enters are ignored until
 * after the first frame.
 */
export default function PageMotion() {
  const ref = useMotion<HTMLDivElement>(({ gsap, ScrollTrigger, SplitText }) => {
    let armed = false;
    requestAnimationFrame(() => {
      armed = true;
    });

    /**
     * Which elements have had their entrance.
     *
     * This is deliberately not ScrollTrigger's own `once`, which kills the
     * trigger the first time it reports an enter. Triggers also report an enter
     * during the layout pass that follows webfonts landing, and at that moment
     * nothing is armed yet, so `once` was quietly spending every entrance on a
     * frame no visitor was looking at. The heading reveals were being destroyed
     * before anyone scrolled to them, which is why they never played.
     */
    const played = new WeakSet<Element>();
    const first = (el: Element) => {
      if (!armed || played.has(el)) return false;
      played.add(el);
      return true;
    };

    /* --- One heading performs, and it is the last one ----------------------
     *
     * Every h2 on the page used to be split into lines and revealed through
     * its own mask. Seven identical entrances is wallpaper: an effect that
     * marks every moment cannot also mark a moment, and it made the reveal
     * read as a template rather than as typesetting.
     *
     * Contact keeps it. It is the last heading read and the only thing the
     * page is asking for, so it is the one place where arrival is the point.
     * The h1 is still excluded and now permanently: it is the element the
     * browser measures for Largest Contentful Paint, and it is also the anchor
     * a reader lands on, which should not be the thing that moves.
     */
    const closing = document.querySelector<HTMLElement>("#contact h2");

    if (closing) {
      const split = new SplitText(closing, { type: "lines", mask: "lines" });

      /*
       * The mask has one job and it ends when the line has arrived.
       *
       * SplitText gives each line a wrapper at `overflow: clip` sized to the
       * line box. These headings set a display leading of 1.12, shorter than
       * the font's own line box, so the wrapper cut the descenders off and
       * left them cut after the reveal had finished. Releasing the clip on
       * arrival costs the animation nothing: there is nothing left to hide.
       */
      const unclip = () => {
        for (const line of split.lines) {
          const mask = line.parentElement;
          if (mask) mask.style.overflow = "visible";
        }
      };

      ScrollTrigger.create({
        trigger: closing,
        start: "top 88%",
        onEnter: () => {
          if (!first(closing)) {
            // Entered before the page armed, so it never animates.
            unclip();
            return;
          }
          gsap.from(split.lines, {
            yPercent: 115,
            duration: 0.7,
            stagger: 0.07,
            ease: "power3.out",
            onComplete: unclip,
          });
        },
      });
    }

    /* --- Section bodies settle in ------------------------------------------
     *
     * Batching collapses what would be one trigger per element into a handful,
     * and groups anything crossing the line in the same frame into a single
     * staggered tween, so a dense section arrives as one movement rather than as
     * twelve unrelated ones.
     *
     * Only the closing head is skipped: it is handled above, and running both
     * would fade a heading in while its own lines were still rising through
     * it. Every other head settles with the blocks around it, which is what
     * makes the one that does not stand out.
     */
    /*
     * Anything that animates itself is left alone.
     *
     * A Panel mounts after first paint and fades itself in with
     * `@starting-style`, because there is no class to toggle on an element that
     * did not exist a frame ago. Batching it as well put two systems on one
     * element's opacity: GSAP wrote an inline `opacity: 0` while the CSS
     * transition was mid-flight, and whichever finished second decided what the
     * reader saw. Measured on a clean load, two panels in "How this is
     * measured" settled at exactly 0 and stayed there, and which two it was
     * changed between reloads.
     *
     * The element that owns its entrance says so, and this skips it.
     */
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>("main > section > .wrap > *"),
    ).filter((el) => !el.contains(closing) && !el.matches("[data-entrance=\"self\"]"));

    if (blocks.length > 0) {
      ScrollTrigger.batch(blocks, {
        start: "top 88%",
        onEnter: (batch) => {
          const fresh = batch.filter(first);
          if (fresh.length === 0) return;
          // 14px over 500ms was under the perceptual threshold for motion:
          // spatial displacement and duration thresholds are proportional, and
          // below the line there is no visible change at all. The animation
          // system was running correctly and doing nothing anyone could see.
          //
          // 30px over 620ms clears it while staying well short of the 40-60px
          // slide that reads as a template. The stagger does most of the work:
          // it is what makes a dense section arrive as one movement instead of
          // as twelve unrelated ones.
          /**
           * No `overwrite`, and the inline styles are removed on the way out.
           *
           * `overwrite: true` was killing tweens that were still running. A
           * reader scrolling quickly crosses several batch boundaries in under
           * a second, each new batch overwrote the last, and the elements whose
           * tween was cancelled kept whatever opacity they had reached at that
           * instant. Measured after one fast pass down the page: 34 elements
           * stranded below full opacity, most of them at exactly 0 -- entire
           * roles and prose blocks permanently invisible, with no error
           * anywhere and nothing to see in the markup.
           *
           * It was also protecting against nothing. The `played` set above
           * guarantees an element is tweened at most once, so there was never a
           * second tween on the same target to overwrite.
           *
           * clearProps removes the inline opacity and transform when the tween
           * finishes, so the settled page carries no animation state at all.
           */
          gsap.from(fresh, {
            opacity: 0,
            // 12, matching the CSS floor and ADR-002.
            //
            // This was 30 while the stylesheet's `section-enter` travelled 12,
            // so the two layers of the same reveal disagreed and which one a
            // visitor got depended on whether the GSAP bundle had landed. The
            // ADR picked 12 deliberately: the 40px slide is a documented
            // machine-made tell and 30 is most of the way there.
            y: 12,
            duration: 0.62,
            stagger: 0.075,
            ease: "power3.out",
            clearProps: "opacity,transform",
          });
        },
      });
    }

    /* --- The figures arrive as readings ------------------------------------
     *
     * Every quantified outcome on this page is a measurement taken off something
     * that ran. Giving the figure an arrival is the one piece of motion here that
     * reports what the element actually is.
     *
     * This counted up first, and counting was wrong on this page in particular: a
     * count publishes every value between zero and the reading, so on a clean load
     * the merge time rendered a crisp `47 hours` and the contradiction count a
     * crisp `2`, both held long enough to photograph. Every other page can afford
     * that. This one cannot, because its entire argument is that no figure appears
     * which was not measured.
     *
     * An odometer does not have that problem, and the reason is mechanical rather
     * than a matter of degree. Each digit is its own column running behind a
     * window one line tall, so while it spins the window shows two half-glyphs
     * meeting at its edge. There is no instant at which the strip renders a
     * legible number that is not the reading: the intermediate states are visibly
     * in motion, which is what a measurement settling looks like.
     *
     * Only `transform` moves, so the whole thing runs on the compositor. The
     * original text is written back on completion from the string the corpus gave
     * us, so what settles is character-for-character what `verify:facts` checked.
     */
    const ODO_CYCLES = 2;
    // Each cell is taller than the glyph, so a settled window never shows a
    // sliver of the digits above and below it (display numerals ink past 1em).
    const CELL = 1.3;

    const figures = Array.from(document.querySelectorAll<HTMLElement>("main dt.tabular")).filter(
      (el) => /^[+-]?\d/.test(el.textContent?.trim() ?? ""),
    );

    for (const el of figures) {
      const raw = el.textContent?.trim() ?? "";
      // The accessible name is set before the DOM is rebuilt, so a screen reader
      // reads the reading and never the digit ladders behind it.
      el.setAttribute("aria-label", raw);

      const tracks: HTMLElement[] = [];
      const rebuilt = document.createDocumentFragment();

      for (const ch of raw) {
        if (!/\d/.test(ch)) {
          rebuilt.appendChild(document.createTextNode(ch));
          continue;
        }

        const window_ = document.createElement("span");
        window_.setAttribute("aria-hidden", "true");
        window_.style.cssText =
          `display:inline-block;overflow:hidden;height:${CELL}em;line-height:${CELL};vertical-align:bottom;margin-block:${(1 - CELL) / 2}em`;

        const track = document.createElement("span");
        track.style.cssText = "display:block;will-change:transform";
        for (let cycle = 0; cycle <= ODO_CYCLES; cycle++) {
          for (let d = 0; d <= 9; d++) {
            const cell = document.createElement("span");
            cell.style.cssText = `display:block;height:${CELL}em;line-height:${CELL}`;
            cell.textContent = String(d);
            track.appendChild(cell);
          }
        }

        window_.appendChild(track);
        rebuilt.appendChild(window_);
        tracks.push(track);
        track.dataset.target = ch;
      }

      if (tracks.length === 0) continue;
      el.textContent = "";
      el.appendChild(rebuilt);

      // Painted at the reading before anything animates: a blocked or failed
      // bundle costs the spin and never the number.
      for (const track of tracks) {
        const target = Number(track.dataset.target);
        track.style.transform = `translateY(${-(ODO_CYCLES * 10 + target) * CELL}em)`;
      }

      ScrollTrigger.create({
        trigger: el,
        start: "top 92%",
        onEnter: () => {
          if (!first(el)) return;
          // The spinning wheels stay soft until they land, so no passing
          // digit reads as a figure the corpus does not hold.
          gsap.fromTo(
            el,
            { filter: "blur(3px)", opacity: 0.45 },
            { filter: "blur(0px)", opacity: 1, duration: 1.1, ease: "power4.in", clearProps: "filter,opacity" },
          );
          tracks.forEach((track, i) => {
            const target = Number(track.dataset.target);
            gsap.fromTo(
              track,
              // Zero, which is the first cell of the ladder. Starting anywhere
              // positive scrolls the window above the track and shows blank.
              { y: 0 },
              {
                y: `${-(ODO_CYCLES * 10 + target) * CELL}em`,
                duration: 1.1,
                // Lower-order digits settle last, the way a mechanical counter
                // carries: the rightmost wheel is the one still turning.
                delay: (tracks.length - 1 - i) * 0.06,
                ease: "power4.out",
                onComplete: () => {
                  track.style.willChange = "auto";
                },
              },
            );
          });
        },
      });
    }

    /* --- The authored beat, on the width axis -------------------------------
     *
     * DESIGN.md has named this as the page's one authored moment since it was
     * written, and next/font requests `wdth` explicitly so it would be
     * available. Nothing used it. The macro headings below the turn were the
     * only elements set large enough for the axis to read, and they were static.
     *
     * A width axis is real interpolation: the glyphs are redrawn narrow and open
     * out, which is a different thing from a scale transform stretching them and
     * is the reason the face was chosen. It runs on the two chapter headings
     * below the turn and nowhere else, because a beat that plays seven times is
     * a texture.
     *
     * The variable is tweened through a proxy rather than as a CSS custom
     * property, so no @property registration is needed for it to interpolate.
     */
    const macro = Array.from(
      /* Chapter register only, matching the stylesheet. An instrument heading
         sits at --step-2 in a narrow rail and has no width axis to open. */
      document.querySelectorAll<HTMLElement>(
        '#work[data-register="chapter"] > .wrap h2, #work ~ section[data-register="chapter"] > .wrap h2',
      ),
    );

    for (const head of macro) {
      ScrollTrigger.create({
        trigger: head,
        start: "top 90%",
        onEnter: () => {
          if (!first(head)) return;
          /* 78, not 68. Bricolage Grotesque's width axis bottoms out at 75, and
             a start value below the minimum clamps rather than erroring: the
             first frames of the beat would render identically and the movement
             would appear to begin late. */
          const axis = { wdth: 78, opsz: 16 };
          gsap.to(axis, {
            wdth: 100,
            opsz: 96,
            duration: 0.85,
            ease: "power3.out",
            onUpdate: () => {
              head.style.setProperty("--wdth", String(axis.wdth));
              head.style.setProperty("--opsz", String(axis.opsz));
            },
            /* Removed on arrival so the settled heading carries no inline
               state and inherits the stylesheet's own value. */
            onComplete: () => {
              head.style.removeProperty("--wdth");
              head.style.removeProperty("--opsz");
            },
          });
        },
      });
    }

    /* --- The graphs trace themselves ---------------------------------------
     *
     * Both diagrams are generated: the topology is read off the compiled
     * LangGraph at build time and the overlap is scored from shared technology
     * in the corpus. Neither was drawn by anybody. Watching the edges trace is
     * the closest the page comes to saying that out loud, and it is the reason
     * this animation is not decoration: the drawing is what happened.
     *
     * A `from()` on the offset only. The dash array is already in the
     * stylesheet and already renders solid, so the edges are complete in the
     * HTML and this pulls them back to nothing and lets them arrive.
     *
     * Batched per graph rather than per edge. The topology has eight edges and
     * the overlap graph rather more; one trigger each, and a stagger, so a graph
     * arrives as one drawing instead of as a dozen unrelated lines.
     */
    for (const figure of document.querySelectorAll<HTMLElement>("svg:has([data-draw])")) {
      const edges = figure.querySelectorAll<SVGGeometryElement>("[data-draw]");
      if (edges.length === 0) continue;

      ScrollTrigger.create({
        trigger: figure,
        start: "top 85%",
        onEnter: () => {
          if (!first(figure)) return;
          gsap.from(edges, {
            strokeDashoffset: 1,
            duration: 0.9,
            stagger: 0.05,
            ease: "power2.inOut",
            /* The settled edge carries no inline state, so what a reader
               inspects afterwards is the stylesheet's value and not a leftover
               from a tween. */
            clearProps: "strokeDashoffset",
          });
        },
      });
    }

    /**
     * Nothing on this page is allowed to stay invisible.
     *
     * Everything above is a from(), so a tween that never completes leaves its
     * target mid-flight. That should not happen now, but "should not" is not a
     * guarantee, and the failure mode is the worst one available here: a
     * recruiter reading a blank section and leaving. This sweeps once, a second
     * after load, and restores anything the animation left behind.
     */
    /*
     * The exclusion was blind to the one thing most likely to need it.
     *
     * It skipped anything inside `[data-state]`, to avoid restoring a skeleton
     * that is meant to be part-transparent while a request is in flight. But
     * `Panel` sets `data-state` unconditionally, defaulting to "idle", so every
     * panel on the page and every element inside one was exempt from the net
     * that exists to catch them. Both stranded panels found on a clean load sat
     * inside that exemption.
     *
     * Only a running instrument is legitimately mid-animation, so only a
     * running one is skipped. An idle panel at opacity 0 is a defect by
     * definition: there is nothing happening that its transparency could be
     * reporting.
     */
    const rescue = () => {
      for (const el of document.querySelectorAll<HTMLElement>("main *")) {
        if (Number(getComputedStyle(el).opacity) < 1 && !el.closest('[data-state="running"]')) {
          gsap.set(el, { clearProps: "opacity,transform" });
        }
      }
    };

    /*
     * And it ran once, a second after mount.
     *
     * Every stranding this is written for happens when a reader crosses several
     * batch boundaries quickly, which is a thing they do at any point in the
     * session and most often well after the first second. A net that is lifted
     * out of the water before anyone starts fishing is decoration.
     *
     * Cheap to repeat: it reads computed opacity on a settled page, off the
     * scroll path, and only while the reader is idle.
     */
    const settled = setTimeout(rescue, 1000);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScrollEnd = () => {
      clearTimeout(idle);
      idle = setTimeout(rescue, 400);
    };
    window.addEventListener("scrollend", onScrollEnd);

    /* gsap.context reverts the tweens, triggers and splits it created, and
       knows nothing about a timer or a listener. Handing it one back is how
       those get cleaned up on unmount too. */
    return () => {
      clearTimeout(settled);
      clearTimeout(idle);
      window.removeEventListener("scrollend", onScrollEnd);
    };

    /*
     * The cursor magnets are gone.
     *
     * Six controls used to drift toward the pointer on hover. The rule this
     * redesign is built on is that every colour and every animation has to
     * encode a value the system computed, and a control sliding toward a mouse
     * encodes nothing at all: it is the one piece of motion on the page that
     * was there because it looked expensive. Keeping it would have meant the
     * rule applied to everything except the part that was fun to write.
     *
     * The press depth in globals.css replaces it, and that one is real: it
     * fires on pointerdown and confirms that a click landed.
     */
  });

  // No box, no space, no accessibility surface. This exists only to give the
  // hook something mounted to hang a lifetime on.
  return <div ref={ref} hidden />;
}
