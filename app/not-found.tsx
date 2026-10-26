import type { Metadata } from "next";
import Link from "next/link";
import { loadContent } from "@/lib/content";
// This page is set in the classic document's system, including its `.wrap`
// measure, which is not part of the shared base.
import "./globals.css";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  // A dead URL should never be indexed, and it should never be presented as a
  // destination in a search result either.
  robots: { index: false, follow: true },
};

/**
 * The dead URL.
 *
 * Measured guidance, not decoration: pages that put recovery above the fold
 * outperform illustration-led error pages on session continuation, and a default
 * 404 loses a materially larger share of sessions than a designed one. So the
 * whole thing is the recovery. There is no drawing, no apology and no joke,
 * which is also the only register this page has ever spoken in.
 *
 * The message states the fact first and the reassurance second. Every section of
 * the site is listed by its real heading, because a reader who mistyped a URL or
 * followed a stale link usually knows what they came for and needs to be told
 * where it lives, not offered a search box for a seven-section page.
 */
export default function NotFound() {
  const { profile } = loadContent();

  // The ids are the home page's chapters. They were the old section ids until
  // the page became chapters, which left two of these links pointing at nothing.
  const sections = [
    { id: "bug", label: "A bug in LangChain" },
    { id: "measured", label: "How this is measured" },
    { id: "work", label: "Work" },
    { id: "research", label: "Research" },
    { id: "proof", label: "What else checks out" },
    { id: "contact", label: "Get in touch" },
  ];

  return (
    <main className={styles.page}>
      <div className="wrap">
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>This page is not here</h1>
        <p className={styles.lead}>
          The rest of the site is. Every section is listed below, and the agent on the home
          page answers questions about any of it.
        </p>

        <Link className={styles.cta} href="/">
          Back to the start
        </Link>

        <nav aria-label="Sections">
          <ul className={styles.list}>
            {sections.map((s) => (
              <li key={s.id}>
                <Link href={`/#${s.id}`}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className={styles.reach}>
          Or write to{" "}
          <a href={`mailto:${profile.email}`}>{profile.email}</a>.
        </p>
      </div>
    </main>
  );
}
