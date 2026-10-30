"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Certifications.module.css";

type Answer = { checkedAt: string; checks: { id: string; confirmed: boolean }[] };
type State = { kind: "waiting" } | { kind: "checking" } | { kind: "confirmed" | "unconfirmed"; at: string };

const STALE_MS = 10 * 60_000;

/** The two cards share one request. */
let pending: Promise<Answer> | null = null;
let fetchedAt = 0;
function ask(): Promise<Answer> {
  if (!pending || Date.now() - fetchedAt > STALE_MS) {
    fetchedAt = Date.now();
    pending = fetch("/api/credentials", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("check unavailable");
      return r.json();
    });
    pending.catch(() => { pending = null; });
  }
  return pending;
}

/**
 * What Credly says about this credential now. Asked when the card first comes
 * into view and again when the reader returns to the tab after ten minutes. If
 * Credly cannot be reached the line says so, and the link beside it still works.
 */
export default function CredentialStatus({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "waiting" });
  const el = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let live = true;
    const check = () => {
      setState({ kind: "checking" });
      ask().then(
        (a) => {
          if (!live) return;
          const at = new Date(a.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          setState({ kind: a.checks.find((c) => c.id === id)?.confirmed ? "confirmed" : "unconfirmed", at });
        },
        () => { if (live) setState({ kind: "unconfirmed", at: "" }); },
      );
    };
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      check();
    });
    if (el.current) seen.observe(el.current);
    const onReturn = () => {
      if (document.visibilityState === "visible" && fetchedAt && Date.now() - fetchedAt > STALE_MS) check();
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      live = false;
      seen.disconnect();
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [id]);

  const text =
    state.kind === "confirmed"
      ? `Confirmed on Credly, ${state.at}`
      : state.kind === "unconfirmed"
        ? "Credly did not confirm just now"
        : "Checking Credly";
  return (
    <p ref={el} className={styles.status} data-state={state.kind} aria-live="polite">
      <span className={styles.pip} aria-hidden="true" />
      {text}
    </p>
  );
}
