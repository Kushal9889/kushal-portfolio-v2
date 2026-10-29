'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { clamp, springStep, scrollBurst, type ScrollBurst } from '@/lib/robot-motion';
import { reducedMotion } from '@/lib/verbs';

export function useBorderGuide(ref: RefObject<HTMLElement | null>, paused: boolean, section: string | undefined) {
  const currentSection = useRef(section);
  currentSection.current = section;
  useEffect(() => {
    const node = ref.current;
    if (!node || paused) return;
    let frame = 0, previous = 0, position = new DOMMatrix(getComputedStyle(node).transform).m42, velocity = 0, pointerY: number | null = null;
    let burst: ScrollBurst | null = null, resetting = false;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const home = () => {
      // Re-read moving icons each frame; never return to a stale scroll coordinate.
      const icons = [...document.querySelectorAll<HTMLElement>('#agent [aria-label="Open full screen"], [data-email-arrow]')];
      const visible = icons.find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 70 && r.bottom < innerHeight - 90; });
      const icon = visible?.getBoundingClientRect();
      const heading = currentSection.current ? document.getElementById(currentSection.current)?.querySelector('h1,h2')?.getBoundingClientRect() : null;
      return icon ? icon.top + icon.height / 2 : heading ? heading.top + heading.height / 2 : innerHeight - 160;
    };
    const draw = (now: number) => {
      frame = 0;
      if (document.hidden || !node.isConnected || !fine.matches || reducedMotion()) { node.style.transform = 'none'; return; }
      const box = node.getBoundingClientRect();
      const base = box.top - position + box.height / 2;
      const center = clamp(resetting || pointerY === null ? home() : pointerY, box.height / 2 + 70, innerHeight - box.height / 2 - 90);
      const target = center - base;
      const next = springStep(position, velocity, target, previous ? (now - previous)/1000 : .016);
      previous = now; position = next.position; velocity = next.velocity;
      node.style.transform = `translateY(${position}px)`;
      if (Math.abs(target-position) + Math.abs(velocity) > .05 || (resetting && burst && now-burst.last < 160)) frame = requestAnimationFrame(draw);
    };
    const wake = () => { if (!frame) { previous = 0; frame = requestAnimationFrame(draw); } };
    const point = (event: PointerEvent) => { if (event.pointerType !== 'mouse' || node.contains(event.target as Node)) return; pointerY = event.clientY; resetting = false; node.dataset.reset = 'false'; wake(); };
    const scroll = () => { const now = performance.now(); burst = scrollBurst(burst, now); if (burst.reset) { resetting = true; node.dataset.reset = 'true'; } wake(); };
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake(); };
    document.addEventListener('pointermove', point, { passive: true });
    // Explicitly requested scroll-burst behavior; no React state updates per frame.
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', wake);
    document.addEventListener('visibilitychange', visibility);
    wake();
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointermove', point); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', wake); document.removeEventListener('visibilitychange', visibility); };
  }, [ref, paused]);
}

export function useCtaLight(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const cleanups = [...document.querySelectorAll<HTMLElement>('#agent, #contact a[href^="mailto:"]')].map(box => {
      const light = document.createElement('span'); light.dataset.ctaLight = ''; light.setAttribute('aria-hidden', 'true');
      const original = box.style.position;
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.append(light);
      let frame = 0, x = box.clientWidth / 2, y = box.clientHeight / 2;
      const draw = () => { frame = 0; light.style.setProperty('--light-x', `${x}px`); light.style.setProperty('--light-y', `${y}px`); };
      const move = (event: PointerEvent) => { const r = box.getBoundingClientRect(); x=event.clientX-r.left; y=event.clientY-r.top; if (!frame) frame=requestAnimationFrame(draw); };
      box.addEventListener('pointermove', move, {passive:true});
      return () => { cancelAnimationFrame(frame); box.removeEventListener('pointermove',move); light.remove(); box.style.position=original; };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [enabled]);
}
