'use client';

import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '@/lib/verbs';
import styles from './VenomSurface.module.css';

/** Actual upstream renderer, isolated from navigation, forms and page cursor. */
export default function VenomSurface() {
  const host = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [mounted,setMounted] = useState(false);
  const [source,setSource] = useState<string | null>(null);
  const [ready,setReady] = useState(false);
  const [active,setActive] = useState(false);
  const input = useRef({active:false,x:0,y:0});
  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    // The site's DENY framing header stays intact; only this bundled decoration runs in the sandbox.
    fetch('/venom/cta.html', {signal:controller.signal}).then(response => {
      if (!response.ok) throw new Error('Decoration unavailable');
      return response.text();
    }).then(setSource).catch(() => {});
    return () => controller.abort();
  }, [mounted]);
  useEffect(() => {
    const anchor=host.current?.closest('a');
    if (!anchor) return;
    const surface=host.current!;
    surface.dataset.listening='true';
    const fine=matchMedia('(hover: hover) and (pointer: fine)');
    let timer: ReturnType<typeof setTimeout> | undefined, raf=0;
    const send=()=>{raf=0;frame.current?.contentWindow?.postMessage({type:'portfolio:venom',...input.current},'*');};
    const stop=()=>{input.current.active=false;setActive(false);send();};
    const move=(event:PointerEvent)=>{
      if (!fine.matches || reducedMotion() || document.hidden || anchor.closest('[inert]')) return stop();
      const r=anchor.getBoundingClientRect();
      const near=r.bottom>0&&r.top<innerHeight&&event.clientX>r.left-120&&event.clientX<r.right+120&&event.clientY>r.top-120&&event.clientY<r.bottom+120;
      if (!near) return stop();
      input.current={active:true,x:event.clientX-r.left,y:event.clientY-r.top};
      setMounted(true);setActive(true);
      if (!raf) raf=requestAnimationFrame(send);
      if(timer)clearTimeout(timer);timer=setTimeout(stop,1200);
    };
    const message=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.data?.type==='portfolio:venom-ready'){setReady(true);send();}};
    window.addEventListener('pointermove',move,{passive:true});window.addEventListener('message',message);
    window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);
    return()=>{delete surface.dataset.listening;if(timer)clearTimeout(timer);cancelAnimationFrame(raf);frame.current?.contentWindow?.postMessage({type:'portfolio:venom',dispose:true},'*');window.removeEventListener('pointermove',move);window.removeEventListener('message',message);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);};
  },[]);
  return <span ref={host} className={styles.surface} data-venom-surface data-ready={ready||undefined} data-active={active||undefined} aria-hidden="true">
    {source&&<iframe ref={frame} title="Decorative Venom surface" srcDoc={source} sandbox="allow-scripts" tabIndex={-1} aria-hidden="true" />}
  </span>;
}
