/** `?frame=chapter:progress` puts a chapter in an exact state so a screenshot is reproducible. */
export type Frame = { chapter: string; p: number };

export function parseFrame(): Frame | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("frame");
  if (!raw) return null;
  const [chapter, p] = raw.split(":");
  return { chapter, p: Math.min(Math.max(Number(p) || 0, 0), 1) };
}

export function waitFor(check: () => boolean, timeout: number) {
  return new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (check() || performance.now() - started > timeout) resolve();
      else setTimeout(tick, 100);
    };
    tick();
  });
}

/** The capture script waits for this attribute before it takes the screenshot. */
export function markFrameReady() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.frameReady = "true";
    }),
  );
}

type Triggers = typeof import("gsap/ScrollTrigger").ScrollTrigger;

/**
 * Tracks ScrollTrigger's re-measure. While it runs, every scrubbed timeline is
 * replayed from zero, so a callback that moves the camera or plays a one-shot
 * hit would act on a position the page is not at. Those callbacks check
 * `refreshing()` first. A chapter registers `onSettled` once its triggers
 * exist, to re-read the real position after each re-measure.
 */
export function watchRefresh(ScrollTrigger: Triggers) {
  let active = false;
  let settled: (() => void) | null = null;
  const begin = () => {
    active = true;
  };
  const end = () => {
    active = false;
    settled?.();
  };
  ScrollTrigger.addEventListener("refreshInit", begin);
  ScrollTrigger.addEventListener("refresh", end);
  return {
    refreshing: () => active,
    onSettled(fn: () => void) {
      settled = fn;
    },
    stop() {
      ScrollTrigger.removeEventListener("refreshInit", begin);
      ScrollTrigger.removeEventListener("refresh", end);
    },
  };
}

/** The document sets `scroll-behavior: smooth`; a frame has to land, not glide. */
export function scrollInstant(y: number) {
  window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: "instant" });
}
