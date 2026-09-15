/**
 * The stage's chapter anchors, in page order. Section ids are a public API: links,
 * the palette, llms.txt and the structured data all name them. `proof` is kept as
 * an alias that lands on Credentials, for links written before the split.
 */
export const CHAPTERS = [
  { id: "top", name: "The agent" },
  { id: "bug", name: "Open source" },
  { id: "measured", name: "How this is measured" },
  { id: "work", name: "Work" },
  { id: "built", name: "Running now" },
  { id: "research", name: "Research" },
  { id: "credentials", name: "Credentials" },
  { id: "beyond", name: "Beyond the résumé lines" },
  { id: "contact", name: "Get in touch" },
] as const;

export const ALIASES = { proof: "credentials" } as const;
