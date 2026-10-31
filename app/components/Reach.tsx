"use client";

import { useEffect, useRef, useState } from "react";
import { mailtoLink, mailDraft, linkedinNote, forwardBlurb, referralTag, type ReachContext } from "@/lib/reach";
import { track } from "@/lib/analytics";
import { GitHubMark, LinkedInMark, MailMark } from "./Mark";
import styles from "./Reach.module.css";
import EmailArrow from "./EmailArrow";

/** The `?r=` tag of the link that brought the reader here, read after mount so
 *  the server render and the first client render agree. */
export function useReferralTag() {
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => setTag(referralTag(new URLSearchParams(location.search).get("r"))), []);
  return tag;
}

/** A link that opens the written draft, carrying the referral tag when there is one. */
export function EmailLink({
  email,
  site,
  who,
  context = "general",
  children,
  ...rest
}: { email: string; site: string; who?: string; context?: ReachContext; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement> & { "data-primary"?: boolean }) {
  const tag = useReferralTag();
  return (
    <a {...rest} href={mailtoLink(email, site, context, tag, who)} onClick={() => track("contact", `email-${context}`)}>
      {children}
      <EmailArrow />
    </a>
  );
}

/**
 * The contact block, rebuilt around the moment someone decides to write.
 *
 * The links here used to be a bare `mailto:`, a profile URL and a repo URL.
 * Each of those is a correct address and none of them is a message. The reader
 * arrives at a blank compose window holding the whole cost of starting, at
 * exactly the point they had already decided to act, and that cost is invisible
 * to us because an unsent email leaves no trace.
 *
 * Mail now opens written. LinkedIn cannot accept a prefilled note through a URL
 * (the parameter was removed and a fabricated one lands on a dead screen), so
 * the note goes to the clipboard as the profile opens and the page says so.
 * The resume is a real file rather than a promise that one exists.
 */
export default function Reach({
  email,
  phone,
  linkedin,
  repo,
  site,
  resumeHref,
  available,
  who,
  context = "general",
  forward,
}: {
  /** Name and role for the draft's subject line. */
  who?: string;
  email: string;
  /** In the corpus since the start and rendered nowhere. One tap on a phone. */
  phone: string;
  linkedin: string;
  /** Accepted for the stage page, which still passes it; the profile is not linked here. */
  github?: string;
  /** The work sample itself. The profile is a list of repositories; this is the
   *  one the reader was just looking at. */
  repo: string;
  site: string;
  resumeHref: string;
  /** When he can start and where, said directly above the action it gates. */
  available?: string;
  context?: ReachContext;
  /** The three lines an internal employee forwards. Built on the server so the
   *  client bundle never pulls in the corpus loader. */
  forward: Parameters<typeof forwardBlurb>[0] & { evals: Parameters<typeof forwardBlurb>[1] };
}) {
  const tag = useReferralTag();
  // One status line for every copy on this block: what was copied, or where to
  // select it by hand when the clipboard is refused.
  const [status, setStatus] = useState<{ ok: boolean; text: string; manual?: { label: string; value: string } } | null>(null);
  const draft = mailDraft(email, site, context, tag, who);
  const draftText = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
  const introduction = forwardBlurb(forward, forward.evals);
  // The referrer's route lands on the introduction, which sits inside the fold:
  // open it on arrival so the link never points at something hidden.
  const more = useRef<HTMLDetailsElement>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    const open = () => {
      if (location.hash !== "#contact-forward" || !more.current) return;
      more.current.open = true;
      const target = document.getElementById("contact-forward");
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);

  async function copy(text: string, what: string, done: string, label?: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ ok: true, text: done });
      track("contact", what);
    } catch {
      setStatus({ ok: false, text: "Copy unavailable. Select the text above and copy it by hand.", manual: label ? { label, value: text } : undefined });
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Everything past the two main actions, behind one fold. */}
      <details ref={more} className={`more ${styles.preview}`}>
        <summary>More ways to reach him</summary>
        <ul className={styles.extra}>
          <li>
            <a
              href={linkedin}
              target="_blank"
              rel="noreferrer"
              className={styles.item}
              onClick={() => copy(linkedinNote(context, tag), "linkedin", "LinkedIn note copied. Paste it into the message box.", "LinkedIn opening note")}
            >
              <LinkedInMark />
              <span>
                <strong>LinkedIn</strong>
                <span className={styles.sub}>opens the profile and copies an opening note</span>
              </span>
            </a>
          </li>
          <li>
            <a className={styles.item} href="/contact.vcf" onClick={() => track("contact", "vcard")}>
              <span aria-hidden="true" className={styles.glyph}>vcf</span>
              <span>
                <strong>Save him as a contact</strong>
                <span className={styles.sub}>opens in Contacts</span>
              </span>
            </a>
          </li>
          <li>
            <button type="button" className={styles.item} onClick={() => copy(draftText, "draft", "Email draft copied, with his address.", "Email draft")}>
              <MailMark />
              <span>
                <strong>Copy the email draft</strong>
                <span className={styles.sub}>for a browser with no mail app</span>
              </span>
            </button>
          </li>
          <li>
            <a className={styles.item} href={repo} target="_blank" rel="noreferrer" onClick={() => track("contact", "github")}>
              <GitHubMark />
              <span>
                <strong>Source for this page</strong>
                <span className={styles.sub}>{repo.replace("https://github.com/", "")}</span>
              </span>
            </a>
          </li>
        </ul>

        <p className={styles.plain}>
          <span className={styles.address}>{email}</span>
          {", "}
          <a className={styles.address} href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
            {phone}
          </a>
        </p>

        <section id="contact-forward" tabIndex={-1} className={styles.referral} aria-labelledby="forward-title">
          <h3 id="forward-title">Introduce Kushal</h3>
          <label>
            An introduction to forward
            <textarea readOnly rows={6} value={introduction} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className={styles.forward} onClick={() => copy(introduction, "forward", "Introduction copied, with the link.")}>
            Copy introduction
          </button>
          {/* The phone's own share sheet: one tap into the app the referral goes through. */}
          {canShare && (
            <button
              type="button"
              className={styles.forward}
              onClick={() => {
                navigator.share({ title: forward.name, text: introduction }).then(
                  () => setStatus({ ok: true, text: "Shared." }),
                  () => undefined,
                );
                track("contact", "share");
              }}
            >
              Share introduction
            </button>
          )}
        </section>

        {status?.manual && (
          <label className={styles.fallback}>
            {status.manual.label}
            <textarea readOnly rows={7} value={status.manual.value} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
      </details>
      <p role="status" className={styles.status} data-ok={status?.ok || undefined}>{status?.text ?? ""}</p>

      {/* The close: when he can start, then the one action, the draft already written. */}
      <div className={styles.close}>
      {available && <p className={styles.available}>{available}</p>}
      <ul className={styles.links}>
        <li>
          <a
            className={styles.primary}
            href={mailtoLink(email, site, context, tag, who)}
            onClick={() => track("contact", "email")}
            data-pull
          >
            <MailMark />
            <span>
              <strong>Email him</strong>
              <span className={styles.sub}>the draft is already written</span>
            </span>
            <EmailArrow large />
          </a>
        </li>
        <li>
          <a className={styles.item} href={resumeHref} target="_blank" rel="noreferrer" onClick={() => track("contact", "resume")} data-pull>
            <span aria-hidden="true" className={styles.glyph}>PDF</span>
            <span>
              <strong>Résumé, 1 page</strong>
              <span className={styles.sub}>opens in the browser</span>
            </span>
          </a>
        </li>
        {/* Phone: one tap to call, the way a phone expects a contact to work. */}
        <li data-only="phone">
          <a className={styles.item} href={`tel:${phone.replace(/[^+\d]/g, "")}`} onClick={() => track("contact", "call")}>
            <span aria-hidden="true" className={styles.glyph}>TEL</span>
            <span>
              <strong>Call him</strong>
              <span className={styles.sub}>{phone}</span>
            </span>
          </a>
        </li>
      </ul>
      </div>
    </div>
  );
}
