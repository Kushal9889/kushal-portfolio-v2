/**
 * Brand marks, inline.
 *
 * Only marks that carry proof: the platforms holding verifiable evidence, and
 * the organisation whose SDK the open-source contribution landed in. Course
 * providers get their names in text rather than a logo, because a wall of vendor
 * badges reads as collecting rather than building, and the badges with no
 * proctored exam behind them are the ones that dilute the one that has.
 *
 * Drawn inline rather than fetched: no network request and no icon dependency.
 *
 * These carry their brand colour rather than inheriting text colour. A logo in
 * the wrong colour stops being the logo, and recognition is the entire reason
 * they are here. They are the documented exception to the one-accent rule, which
 * is why the values sit in this file rather than in the token sheet: they belong
 * to NVIDIA, GitHub and LinkedIn, not to this palette.
 */

import { brandIcon } from "@/lib/brand-icons";

type Props = { size?: number; className?: string };

const GITHUB = "#181717";
const LINKEDIN = "#0A66C2";
const NVIDIA = "#76B900";

/**
 * Issuer hues, for the credential wall.
 *
 * The vendors' own values, used at full strength on the mark and never on the
 * text beside it. An earlier version mixed them into the ink to make the names
 * legible and produced #51371d for AWS orange and #233551 for Google blue:
 * brown and navy, recognisable as neither. Contrast belongs to the words and
 * saturation belongs to the logo, and trying to make one element carry both
 * loses both.
 */
export const ISSUER_HUE: Record<string, string> = {
  NVIDIA,
  "Amazon Web Services": "#FF9900",
  "Google Cloud": "#4285F4",
  IBM: "#0F62FE",
};

/**
 * Official paths, from simple-icons, which publishes them CC0.
 *
 * Not redrawn from memory. A logo that is almost right is the detail a reader
 * who knows the brand spots immediately, which is worse than showing none.
 *
 * AWS and IBM are deliberately absent: both companies asked simple-icons to
 * remove their marks, so there is no freely licensed source for either. They
 * keep the coloured dot instead. That is a trademark limit, not an oversight.
 */
const ISSUER_PATH: Record<string, string> = {
  "Google Cloud":
    "M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z",
};


export function GitHubMark({ size = 16, className }: Props) {
  const icon = brandIcon("github");
  if (!icon) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={GITHUB}
      aria-hidden="true"
      className={className}
    >
      <path d={icon.path} />
    </svg>
  );
}

export function LinkedInMark({ size = 16, className }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill={LINKEDIN}
      aria-hidden="true"
      className={className}
    >
      <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146ZM4.943 13.394V6.169H2.542v7.225h2.401ZM3.743 5.18c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016Zm2.4 8.214h2.401V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.17h-2.4c.03.678 0 7.225 0 7.225Z" />
    </svg>
  );
}

export function MailMark({ size = 16, className }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <path d="m1.5 4 6.5 4.5L14.5 4" />
    </svg>
  );
}

/**
 * A vendor's hue, carried by a dot rather than by a drawn logo.
 *
 * Redrawing the AWS, Google Cloud and IBM marks from memory would produce four
 * logos that are almost right, and an almost-right logo is a worse signal than
 * none: it is the detail a reader who knows the brand notices immediately. The
 * dot claims nothing except the colour, which is the part doing the recognition
 * work at this size anyway.
 */
export function IssuerDot({ issuer, size = 14 }: { issuer: string; size?: number }) {
  const hue = ISSUER_HUE[issuer];
  if (!hue) return null;

  const path = ISSUER_PATH[issuer];
  if (path) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill={hue} aria-hidden="true">
        <path d={path} />
      </svg>
    );
  }

  // No freely licensed mark exists for this vendor, so the colour carries the
  // recognition on its own rather than an approximation of the logo doing it
  // badly.
  return (
    <span
      aria-hidden="true"
      className="issuer-dot"
      style={{ "--brand": hue, width: size * 0.5, height: size * 0.5 } as React.CSSProperties}
    />
  );
}

/**
 * The NVIDIA mark.
 *
 * This was redrawn by hand and described in its own comment as "simplified to a
 * single path so it reads at 14px", which is the exact thing the note above
 * `ISSUER_PATH` warns against: a logo that is almost right is the detail a
 * reader who knows the brand spots first. It now comes from the same generated
 * module every other mark on the page reads, so there is one source and it is
 * the vendor's current artwork rather than an approximation of it.
 *
 * This is the only credential mark on the page. It marks a proctored exam, and
 * putting it beside the course completions would flatten that distinction into
 * a badge wall.
 */
export function NvidiaMark({ size = 18, className }: Props) {
  const icon = brandIcon("nvidia");
  if (!icon) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={NVIDIA}
      aria-hidden="true"
      className={className}
    >
      <path d={icon.path} />
    </svg>
  );
}
