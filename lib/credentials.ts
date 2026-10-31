/**
 * Whether a credential's public page still names its holder and its credential.
 * A 200 alone proves the host is up, so the text has to match as well. Vendors
 * title the same exam differently, so the part after the colon or dash carries
 * the match ("NVIDIA-Certified Professional: Agentic AI" reads "Agentic AI").
 */
export function credentialConfirmed(page: string, name: string, holder: string): boolean {
  const specific = name.split(/[:–]/).pop()?.trim() ?? name;
  return page.includes(holder) && (page.includes(name) || page.includes(specific));
}
