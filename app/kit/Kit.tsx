"use client";

import { useEffect } from "react";
import { animate } from "motion";
import { spring, reducedMotion } from "./springs";

/**
 * The interaction layer, delegated.
 *
 * Every card and disclosure on this page is server-rendered HTML. Wrapping each
 * one in a client component would turn the prose and the page shell into client
 * islands; listening once on the document reaches all of them, including ones
 * that mount later, and ships one small effect. GSAP keeps the scroll entrances
 * (PageMotion); this owns state the reader causes: hover, press, open, close.
 * The two never animate the same property on the same element.
 */

/** Surfaces that answer the pointer. Add `data-kit-card` to opt anything else in. */
export const DEFAULT_CARDS = [
  "[data-kit-card]",
  "#proof [aria-haspopup='dialog']",
  "#proof [class*='logoHead']",
  "#contact ul[class*='links'] > li > :is(a, button)",
  "#opensource a[class*='Artifacts-module'][class*='link']",
].join(",");

const AGENT = "[class*='Agent-module'],[class*='AgentCompanion'],#agent-panel";
const ARROW = "[data-arrow],[class*='arrow']";
const nativeHeight = () => typeof CSS !== "undefined" && CSS.supports("selector(::details-content)");

export default function Kit() {
  useEffect(() => {
    if (reducedMotion()) return;
    const ac = new AbortController();
    const on = <K extends keyof DocumentEventMap>(t: K, f: (e: DocumentEventMap[K]) => void, capture = false) =>
      document.addEventListener(t, f, { signal: ac.signal, capture });

    /* --- Cards: lift on hover, depth on press (fluid §1, §4) ------------- */
    const card = (t: EventTarget | null) => {
      const el = (t as Element | null)?.closest?.(DEFAULT_CARDS) as HTMLElement | null;
      return el && !el.closest(AGENT) ? el : null;
    };
    const lift = (el: HTMLElement, up: boolean) => {
      animate(el, { y: up ? -2 : 0 }, spring.touch);
      const arrow = el.querySelector<HTMLElement>(ARROW);
      if (arrow) animate(arrow, { x: up ? 3 : 0 }, spring.touch);
    };
    on("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const el = card(e.target);
      if (el && !el.contains(e.relatedTarget as Node)) lift(el, true);
    });
    on("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      const el = card(e.target);
      if (el && !el.contains(e.relatedTarget as Node)) lift(el, false);
    });
    const release = (e: PointerEvent) => {
      const el = card(e.target);
      if (el) animate(el, { scale: 1 }, spring.touch);
    };
    on("pointerdown", (e) => {
      const el = card(e.target);
      if (el) animate(el, { scale: 0.985 }, spring.touch);
    });
    on("pointerup", release);
    on("pointercancel", release);

    /* --- Disclosures: native <details>, sprung height (fluid §3) ---------
     * Interruptible: each run starts from the height on screen, so a second
     * click mid-flight reverses without a jump. `.more` is left to the native
     * ::details-content transition where the engine has it (globals.css). */
    const running = new WeakMap<HTMLDetailsElement, { stop: () => void }>();
    const closedHeight = (d: HTMLDetailsElement, s: HTMLElement) => {
      const cs = getComputedStyle(d);
      const px = (v: string) => parseFloat(v) || 0;
      return s.offsetHeight + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    };
    on("click", (e) => {
      const s = (e.target as Element | null)?.closest?.("summary") as HTMLElement | null;
      const d = s?.parentElement as HTMLDetailsElement | null;
      if (!s || !d || d.tagName !== "DETAILS" || d.closest(AGENT)) return;
      if (d.classList.contains("more") && nativeHeight()) return;
      e.preventDefault();
      const from = d.offsetHeight;
      running.get(d)?.stop();
      const opening = !d.open || d.dataset.kitClosing === "";
      d.style.overflow = "clip";
      let to: number;
      if (opening) {
        delete d.dataset.kitClosing;
        d.open = true;
        d.style.height = "auto";
        to = d.offsetHeight;
      } else {
        d.dataset.kitClosing = "";
        to = closedHeight(d, s);
      }
      d.style.height = `${from}px`;
      const ctl = animate(d, { height: [`${from}px`, `${to}px`] }, spring.size);
      running.set(d, ctl);
      ctl.then(() => {
        if (running.get(d) !== ctl) return;
        running.delete(d);
        if (!opening) {
          d.open = false;
          delete d.dataset.kitClosing;
        }
        d.style.removeProperty("height");
        d.style.removeProperty("overflow");
      });
    });

    return () => ac.abort();
  }, []);

  // A lifetime to hang the listeners on; no box, no accessibility surface.
  return <div hidden />;
}
