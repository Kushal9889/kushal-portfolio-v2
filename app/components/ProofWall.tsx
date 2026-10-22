import type { Badge, Certification } from "@/lib/content";
import { siCodechef, siIeee, siLangchain, siModelcontextprotocol, siVllm } from "simple-icons";
import BrandMark from "./BrandMark";
import Medallion from "./Medallion";
import styles from "./ProofWall.module.css";

/** Logos for issuers whose course certificates have no badge image of their own:
 *  the issuer's own artwork in its own colours (IBM's 8-bar file from Wikimedia
 *  Commons). */
const LOGO: Record<string, string> = {
  "Amazon Web Services": "/brand/aws.svg",
  "Google Cloud": "/brand/googlecloud.svg",
  IBM: "/brand/ibm.svg",
};

/** Badges whose original mark is a file, not a simple-icons glyph. */
const BADGE_LOGO: Record<string, string> = {
  "IGI 2024": "/brand/igi.webp",
};

/** A glyph mark takes its brand's own colour on the light disc. */
const HEX: Record<string, string> = Object.fromEntries(
  [siLangchain, siVllm, siModelcontextprotocol, siIeee, siCodechef].map((i) => [i.title, `#${i.hex}`]),
);

/** A ranking with no logo of its own shows its figure as the seal ("Top 1%", "70+"). */
export function seal(label: string) {
  const top = label.match(/top \d+%/i)?.[0];
  if (top) return top[0].toUpperCase() + top.slice(1);
  return label.match(/\d+\+/)?.[0] ?? label;
}

/** Per-bubble vertical offsets, cycled, so the cloud is not a grid. */
const LIFT = ["0rem", "1.6rem", "-0.8rem", "2.4rem", "0.4rem", "2rem"];
/** How far back each size starts, in px, so the small ones rise from deeper. */
const DEPTH = { xl: 0, lg: 140, md: 260 } as const;

type Item = { key: string; size: keyof typeof DEPTH; node: React.ReactNode };

/**
 * Everything he can prove, as one composition at the end of the page, where a
 * reader has decided to write.
 *
 * Round seals at four sizes and three depths. In a browser with scroll-driven
 * animation they rise out of the stage one after another, overshoot on a spring
 * and pop a ring as they land; everywhere else, and under reduced motion, this
 * is the same composition at rest. The two official badges are 3D medallions.
 *
 * Every tile is a link to where the claim can be checked: the vendor's badge
 * page, the pull request, the DOI, or the resume. Logo first; a label only
 * where there is no logo to say what it is. Rows are named for assistive
 * technology, so the wall adds no headings.
 */
export default function ProofWall({ certs, badges }: { certs: Certification[]; badges: Badge[] }) {
  const items: Item[] = [];

  for (const c of certs.filter((x) => x.pinned && x.url && x.image)) {
    items.push({
      key: c.id,
      size: "xl",
      node: (
        <Medallion
          src={c.image as string}
          name={`${c.name}, ${c.issuer}`}
          href={c.url as string}
          shape={c.issuer === "NVIDIA" ? "hex" : "blob"}
          fill={c.plate ?? ""}
        />
      ),
    });
  }

  const courses = certs
    .filter((c) => !c.pinned)
    .map((c) => ({ c, href: c.url ?? c.components?.find((x) => x.url)?.url ?? null }))
    .filter((x): x is { c: Certification; href: string } => Boolean(x.href))
    // One tile per issuer: a second IBM course is not a second logo.
    .filter((x, i, all) => all.findIndex((y) => y.c.issuer === x.c.issuer) === i);
  for (const { c, href } of courses) {
    items.push({
      key: c.id,
      size: "md",
      node: (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`${c.name}, ${c.issuer}, verify`}>
          <span className={styles.disc}>
            {LOGO[c.issuer] ? (
              // eslint-disable-next-line @next/next/no-img-element -- a static brand mark
              <img className={styles.logo} src={LOGO[c.issuer]} alt="" width={44} height={28} loading="lazy" />
            ) : (
              <span className={styles.text}>{c.issuer}</span>
            )}
          </span>
        </a>
      ),
    });
  }

  const groups = [...new Set(badges.map((b) => b.group))];
  for (const g of groups) {
    for (const b of badges.filter((x) => x.group === g)) {
      items.push({
        key: b.label,
        size: g === "Shipped" ? "lg" : "md",
        node: (
          <a href={b.href} target="_blank" rel="noreferrer" aria-label={`${b.name}, verify`}>
            <span className={styles.disc}>
              {b.mark ? (
                <span className={styles.mark} style={{ color: HEX[b.mark] }}>
                  <BrandMark name={b.mark} />
                </span>
              ) : BADGE_LOGO[b.label] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a static brand mark
                <img className={styles.logo} src={BADGE_LOGO[b.label]} alt="" width={64} height={15} loading="lazy" />
              ) : (
                <span className={styles.seal}>{seal(b.label)}</span>
              )}
            </span>
            <span className={styles.cap}>{b.label}</span>
          </a>
        ),
      });
    }
  }

  // What the wall holds, counted before it is shown: a reader gets the shape
  // of the record first, then the seals. Issuers rather than certificates,
  // because one IBM tile stands for several courses.
  const issuers = new Set(certs.filter((c) => c.url || c.components?.some((x) => x.url)).map((c) => c.issuer)).size;
  const legend = [
    { n: issuers, label: issuers === 1 ? "certifying issuer" : "certifying issuers" },
    ...groups.map((g) => ({ n: badges.filter((b) => b.group === g).length, label: g.toLowerCase() })),
  ].filter((l) => l.n > 0);

  return (
    <>
    <ul className={styles.legend} aria-label="What the wall holds">
      {legend.map((l) => (
        <li key={l.label}>
          <b>{l.n}</b>
          {l.label}
        </li>
      ))}
    </ul>
    <ul className={styles.stage} aria-label="What he can prove" data-scrim-skip>
      {items.map((it, i) => (
        <li
          key={it.key}
          className={styles.item}
          data-size={it.size}
          style={{ "--i": i % 6, "--lift": LIFT[i % LIFT.length], "--depth": `${DEPTH[it.size]}px` } as React.CSSProperties}
        >
          {it.node}
        </li>
      ))}
    </ul>
    </>
  );
}
