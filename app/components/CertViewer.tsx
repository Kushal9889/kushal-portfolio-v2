"use client";

import { useRef } from "react";
import { animate } from "motion/mini";
import { spring, reducedMotion } from "@/app/kit/springs";
import styles from "./CertViewer.module.css";

type Props = { name: string; image: string; url: string | null; children: React.ReactNode };

/**
 * A certificate card that opens its full-size plate in a native dialog.
 *
 * The dialog keeps focus trapping, Esc, the top layer and the backdrop; Motion
 * only moves the plate. It grows out of the badge that was clicked and goes back
 * into it on every way out (Close, Esc, the backdrop), so the viewer has an
 * origin and the exit retraces the entrance (fluid §7). No bounce: this was a
 * click, not a throw (fluid §4).
 */
export default function CertViewer({ name, image, url, children }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const open = useRef<HTMLButtonElement>(null);
  const plate = useRef<HTMLImageElement>(null);
  const closing = useRef(false);

  // The transform that puts the dialog's plate exactly over the badge (FLIP,
  // origin top left). The whole dialog travels, so the card becomes the viewer
  // rather than a plate flying over a frame that is already there.
  const fromBadge = () => {
    const badge = open.current?.querySelector("img")?.getBoundingClientRect();
    const to = plate.current?.getBoundingClientRect();
    const box = dlg.current?.getBoundingClientRect();
    if (!badge || !to || !box || !to.width) return null;
    const scale = badge.width / to.width;
    return { x: badge.left - box.left - (to.left - box.left) * scale, y: badge.top - box.top - (to.top - box.top) * scale, scale };
  };
  const badgeShown = (shown: boolean) => {
    const img = open.current?.querySelector("img");
    if (img) img.style.visibility = shown ? "" : "hidden";
  };

  const show = () => {
    const d = dlg.current;
    if (!d || d.open) return;
    d.showModal();
    const f = !reducedMotion() && fromBadge();
    if (!f) return;
    badgeShown(false);
    animate(d, { translate: [`${f.x}px ${f.y}px`, "0px 0px"], scale: [String(f.scale), "1"] }, spring.travel);
    // Close and Verify fade where they stand: they have no origin to travel from.
    d.querySelectorAll<HTMLElement>(`.${styles.close}, .${styles.verify}`).forEach((el) =>
      animate(el, { opacity: [0, 1] }, { duration: 0.2, delay: 0.12 }),
    );
  };

  const shut = async () => {
    const d = dlg.current;
    if (!d?.open || closing.current) return;
    const f = !reducedMotion() && fromBadge();
    if (f) {
      closing.current = true;
      d.querySelectorAll<HTMLElement>(`.${styles.close}, .${styles.verify}`).forEach((el) =>
        animate(el, { opacity: 0 }, { duration: 0.12 }),
      );
      // From the value on screen, so a close during the opening flight reverses it.
      await animate(d, { translate: `${f.x}px ${f.y}px`, scale: String(f.scale) }, spring.travel);
      closing.current = false;
    }
    d.close();
    badgeShown(true);
    // motion/mini commits the last frame inline and may hold a fill; a closed
    // dialog keeps none of either, its own or its buttons'.
    d.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    d.style.removeProperty("translate");
    d.style.removeProperty("scale");
    d.querySelectorAll<HTMLElement>(`.${styles.close}, .${styles.verify}`).forEach((el) => el.style.removeProperty("opacity"));
  };

  return (
    <>
      <button ref={open} type="button" className={styles.open} onClick={show} aria-haspopup="dialog">
        {children}
      </button>
      <dialog
        ref={dlg}
        className={styles.dialog}
        aria-label={name}
        onClick={(e) => e.target === dlg.current && shut()}
        onCancel={(e) => {
          e.preventDefault();
          shut();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static certificate plate */}
        <img ref={plate} className={styles.plate} src={image} alt={`${name} certificate`} width={672} height={352} />
        <button type="button" className={styles.close} onClick={shut}>
          Close
        </button>
        {url && (
          <a className={styles.verify} href={url} target="_blank" rel="noreferrer">
            Verify on Credly
          </a>
        )}
      </dialog>
    </>
  );
}
