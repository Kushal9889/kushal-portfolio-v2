import { loadContent, loadCertifications } from "@/lib/content";
import { ALIASES, CHAPTERS } from "@/lib/chapters";

export const dynamic = "force-static";

/**
 * llms.txt
 *
 * The page's facts as plain structured text for machine readers, generated from
 * content/facts.md so it cannot drift from the page. The technology list is
 * flattened from the same `stack` lines the page renders as chips, the chapter
 * anchors are listed so a reader can link into the page, and the resume is
 * linked as a document.
 */
export function GET() {
  const { profile, sections } = loadContent();
  const certs = loadCertifications();

  const body = `# ${profile.name}

> ${profile.role} in Boston. ${profile.tagline}

- Contact: ${profile.email}
- LinkedIn: ${profile.linkedin}
- GitHub: ${profile.github}
- Resume (PDF, text layer intact): ${profile.site}/kushal-gaddamwar-resume.pdf
- Available: ${profile.available}
- Last verified: ${profile.lastVerified}

## Page chapters

${CHAPTERS.map((c) => `- ${c.name}: ${profile.site}/#${c.id}`).join("\n")}
${Object.entries(ALIASES).map(([from, to]) => `- #${from} lands on #${to}`).join("\n")}

## Technologies

${[...new Set(sections.flatMap((s) => s.stack))].join(", ")}

## Certifications

${certs
  .map((c) => `- ${c.name}, ${c.issuer}${c.year ? ` (${c.year})` : ""}${c.url ? ` — ${c.url}` : ""}`)
  .join("\n")}

${sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n")}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
