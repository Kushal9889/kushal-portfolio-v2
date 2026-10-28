'use client';

import { useEffect, useRef } from 'react';
import { reducedMotion } from '@/lib/verbs';
import Glyph from './stage/Glyph';
import styles from './EmailArrow.module.css';

/** CSS owns small arrows; the larger closing arrow uses the installed GSAP. */
export default function EmailArrow({ large = false }: { large?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!large) return;
    const node = ref.current, link = node?.closest('a');
    if (!node || !link) return;
    let live = true, inside = false;
    let engine: typeof import('gsap').gsap | null = null;
    const hover = matchMedia('(hover: hover) and (pointer: fine)');
    const move = () => {
      const visible = inside || link.matches(':hover') || !hover.matches || link.matches(':focus-visible') || reducedMotion();
      if (engine) engine.to(node, { x: visible ? 0 : -8, opacity: visible ? 1 : 0, duration: reducedMotion() || link.matches(':focus-visible') ? 0 : visible ? .28 : .2, ease: 'power3.out', overwrite: true });
    };
    const enter = () => {
      inside = true;
      if (reducedMotion() || !hover.matches) return;
      if (engine) return move();
      import('gsap').then(({gsap}) => { if (!live) return; engine = gsap; node.dataset.engine = 'gsap'; move(); }).catch(() => { /* CSS remains the complete fallback. */ });
    };
    const leave = () => { inside = false; move(); };
    const focus = () => { if (engine) engine.set(node, {x: 0, opacity: 1}); };
    link.addEventListener('pointerenter', enter); link.addEventListener('pointerleave', leave);
    link.addEventListener('focus', focus); link.addEventListener('blur', leave);
    hover.addEventListener('change', move);
    return () => { live = false; engine?.killTweensOf(node); link.removeEventListener('pointerenter', enter); link.removeEventListener('pointerleave', leave); link.removeEventListener('focus', focus); link.removeEventListener('blur', leave); hover.removeEventListener('change', move); };
  }, [large]);
  return <span ref={ref} className={styles.arrow} data-email-arrow data-size={large ? 'large' : 'small'} aria-hidden="true"><Glyph name="ArrowUpRight:regular" size={large ? 28 : 20} /></span>;
}
