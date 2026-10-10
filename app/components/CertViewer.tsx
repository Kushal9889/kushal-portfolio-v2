"use client";

import { useRef } from "react";
import styles from "./CertViewer.module.css";

type Props = { name: string; image: string; url: string | null; children: React.ReactNode };

/** A certificate card that opens its full-size plate in a native dialog. */
export default function CertViewer({ name, image, url, children }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={styles.open} onClick={() => dlg.current?.showModal()} aria-haspopup="dialog">
        {children}
      </button>
      <dialog
        ref={dlg}
        className={styles.dialog}
        aria-label={name}
        onClick={(e) => e.target === dlg.current && dlg.current.close()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static certificate plate */}
        <img className={styles.plate} src={image} alt={`${name} certificate`} width={672} height={352} />
        <button type="button" className={styles.close} onClick={() => dlg.current?.close()}>
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
