import type { Metadata } from "next";
import { Martian_Mono, Bricolage_Grotesque } from "next/font/google";
import localFont from "next/font/local";
import { loadContent, loadCertifications, section } from "@/lib/content";
// The stage page's share of the old stylesheet: tokens, the element base, and
// the global classes the reused components match. The classic document's own
// system is imported by the routes that render it, so the home page no longer
// ships 68KB of CSS it never matches.
import "./base.css";

// Self-hosted by next/font at build time. The previous site loaded two of its
// three families through a render-blocking <link> to fonts.googleapis.com, which
// put a network round trip in front of the headline.

/*
 * Two voices. Display, interface and reading are one family at different
 * optical sizes, and data is the other.
 *
 *   display    Bricolage Grotesque   headlines, labels, controls, prose
 *   data       Martian Mono          figures, identifiers, code
 *
 * Every non-default axis is requested explicitly. next/font ships only `wght`,
 * so anything else has to be named or `font-variation-settings` silently does
 * nothing.
 */
// The classic document's display face. The stage no longer uses it, so it is
// not preloaded: a preload on the home page would fetch 131KB nothing renders.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "wdth"],
  preload: false,
});

const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["300", "400", "600"],
});

/*
 * The stage's voices. One per kind of document a chapter is, self-hosted and
 * subset to Latin (licences in app/fonts/LICENSES.md). Only the two faces the
 * first screen renders are preloaded; the rest arrive with their chapters.
 *
 *   spine     Switzer              interface, labels, body
 *   macro     Basement Grotesque   the two poster lines: hero and contact
 *   plate     Cabinet Grotesk      work nameplates
 *   readout   Nippo                measured figures
 *   paper     Sentient             the research chapter, which is a paper
 *   code      Commit Mono          source code in the bug chapter
 */
const spine = localFont({
  src: [
    { path: "./fonts/Switzer-300.woff2", weight: "300" },
    { path: "./fonts/Switzer-400.woff2", weight: "400" },
    { path: "./fonts/Switzer-500.woff2", weight: "500" },
    { path: "./fonts/Switzer-600.woff2", weight: "600" },
  ],
  variable: "--font-spine",
  display: "swap",
});

const macro = localFont({
  src: "./fonts/BasementGrotesque-900.woff2",
  weight: "900",
  variable: "--font-macro",
  display: "swap",
});

const plate = localFont({
  src: [
    { path: "./fonts/CabinetGrotesk-700.woff2", weight: "700" },
    { path: "./fonts/CabinetGrotesk-800.woff2", weight: "800" },
  ],
  variable: "--font-plate",
  display: "swap",
  preload: false,
});

const readout = localFont({
  src: [
    { path: "./fonts/Nippo-500.woff2", weight: "500" },
    { path: "./fonts/Nippo-700.woff2", weight: "700" },
  ],
  variable: "--font-readout",
  display: "swap",
  preload: false,
});

const paper = localFont({
  src: [
    { path: "./fonts/Sentient-400.woff2", weight: "400" },
    { path: "./fonts/Sentient-500.woff2", weight: "500" },
    { path: "./fonts/Sentient-700.woff2", weight: "700" },
  ],
  variable: "--font-paper",
  display: "swap",
  preload: false,
});

const code = localFont({
  src: [
    { path: "./fonts/CommitMono-400.woff2", weight: "400" },
    { path: "./fonts/CommitMono-700.woff2", weight: "700" },
  ],
  variable: "--font-code",
  display: "swap",
  preload: false,
});

const { profile } = loadContent();

export const metadata: Metadata = {
  metadataBase: new URL(profile.site),
  title: `${profile.name} — ${profile.role}`,
  // The description is the line a search result quotes and an assistant
  // paraphrases. The tagline alone carried neither the role nor the institution,
  // which are the two strings someone who half-remembers him will type.
  description: `${profile.tagline} ${profile.role} at Boston University. ${profile.proof}`,
  authors: [{ name: profile.name, url: profile.site }],
  openGraph: {
    type: "profile",
    title: `${profile.name} — ${profile.role}`,
    description: `${profile.tagline} ${profile.proof}`,
    url: profile.site,
    siteName: profile.name,
    images: [{ url: "/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.name} — ${profile.role}`,
    description: `${profile.tagline} ${profile.proof}`,
    images: ["/og"],
  },
  alternates: { canonical: profile.site },
  robots: { index: true, follow: true },
};

/**
 * Person + WebSite in one @graph. Search engines and assistants read this to
 * resolve "who is Kushal Gaddamwar" as an entity rather than guessing from prose,
 * which matters because recruiters increasingly ask a model about a candidate
 * before opening the site.
 */
const ORCID = "https://orcid.org/0009-0009-9318-1616";

/**
 * Every technology named anywhere in the corpus, deduplicated.
 *
 * A screener matching this profile against a job description is looking for
 * these strings. Deriving them from the same `stack` lines the page renders
 * means the list cannot fall behind the site, which is exactly what the previous
 * hardcoded array had already done.
 */
function knowsAbout() {
  const { sections } = loadContent();
  const fromCorpus = sections.flatMap((s) => s.stack);
  const disciplines = [
    "Agentic AI",
    "Retrieval-Augmented Generation",
    "Context Engineering",
    "LLM Evaluation",
    "Multi-Agent Orchestration",
  ];
  return [...new Set([...disciplines, ...fromCorpus])];
}

/**
 * The two publications, as entities rather than as links in prose.
 *
 * Generated from the `@artifact` lines on the Publications section, which the
 * link checker already resolves and the page already renders, so a paper cannot
 * appear in one surface and not the others. This was the last identifier class
 * the graph lacked: it carried an ORCID and no works for the ORCID to point at.
 */
function publications() {
  return section("Publications").artifacts.map((a) => ({
    "@type": "ScholarlyArticle",
    name: a.label,
    url: a.url,
    author: { "@id": `${profile.site}/#person` },
    ...(a.url.includes("doi.org")
      ? { identifier: a.url.replace("https://doi.org/", "doi:") }
      : {}),
    publisher: { "@type": "Organization", name: a.kind.split(",")[0] },
  }));
}

function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${profile.site}/#person`,
        name: profile.name,
        jobTitle: profile.role,
        email: `mailto:${profile.email}`,
        url: profile.site,
        address: { "@type": "PostalAddress", addressLocality: "Boston", addressRegion: "MA" },
        sameAs: [profile.linkedin, profile.github, ORCID].filter(Boolean),
        alumniOf: [
          { "@type": "CollegeOrUniversity", name: "Boston University" },
          { "@type": "CollegeOrUniversity", name: "IIIT Design and Manufacturing Jabalpur" },
        ],
        worksFor: {
          "@type": "Organization",
          name: "Boston University, Questrom Computational Lab",
        },
        // Generated from the corpus, not typed here. This was a hardcoded list
        // of six terms while the sections carried twenty, so the machine-readable
        // copy of him was a stale subset of the human-readable one. Roughly 90%
        // of employers now screen with an AI tool before a person opens the page,
        // which makes this block the version most likely to be read first.
        knowsAbout: knowsAbout(),
        // Credentials with their verification URL attached, so a screener can
        // follow the claim instead of taking it.
        hasCredential: loadCertifications()
          .filter((c) => c.url)
          .map((c) => ({
            "@type": "EducationalOccupationalCredential",
            name: c.name,
            credentialCategory: "certification",
            recognizedBy: { "@type": "Organization", name: c.issuer },
            url: c.url,
          })),
        subjectOf: publications(),
      },
      ...publications(),
      {
        "@type": "WebSite",
        "@id": `${profile.site}/#website`,
        url: profile.site,
        name: profile.name,
        publisher: { "@id": `${profile.site}/#person` },
      },
    ],
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={[display, mono, spine, macro, plate, readout, paper, code].map((f) => f.variable).join(" ")}
    >
      <head>
        {/* The condensed view was a keystroke nobody finds. As a URL it is a
            second, shorter read of the same page that can be sent in a reply,
            and applying it here rather than in an effect means the full page
            never paints first and then collapses under the reader. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{' +
              'var d=document.documentElement;' +
              'if(new URLSearchParams(location.search).get("mode")==="condensed")d.classList.add("condensed");' +
              // Restores a chosen theme before first paint, so a reader who
              // picked dark never sees the page flash light on the way in.
              // Read from storage only: the ADR keeps light unconditional and
              // ignores the system preference deliberately, so that a recruiter
              // sees the design that was measured rather than a variant of it.
              // The dark scheme has been in the stylesheet and unreachable since
              // it was written, because nothing ever set this attribute.
              'var t=localStorage.getItem("theme");' +
              'if(t==="dark"||t==="light")d.dataset.theme=t;' +
              '}catch(e){}',
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
