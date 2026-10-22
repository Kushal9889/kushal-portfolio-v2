import { type Certification } from "@/lib/content";
import { NvidiaMark } from "./Mark";
import CertViewer from "./CertViewer";
import styles from "./Certifications.module.css";

/**
 * Credentials are not equal, so they are not rendered equally.
 *
 * The two exams are the headline: each arrives on scroll from the other's side
 * and opens to full size as it settles into its own column. The course
 * completions follow as one tile per issuer, the brand mark and a count of
 * verified certificates, each of which links to its own verification page.
 * Courses not yet verified are not counted.
 */
export default function Certifications({
  certifications,
}: {
  certifications: Certification[];
}) {
  const pinned = certifications.filter((c) => c.pinned);
  const rest = certifications.filter((c) => !c.pinned);
  return (
    <div className={styles.wrap}>
      {/* The two exams, side by side: NVIDIA on the left, Anthropic on the
          right. Each badge sits on a white certificate frame that tilts up
          into place as the card scrolls in; the course completions below
          arrive as a row of plus chips. */}
      <div className={styles.duo}>
        {pinned.map((c) => {
          const face = (
            <>
              <span className={styles.tag}>
                [ {c.kind === "proctored-exam" ? "proctored exam" : "certification"} ]
              </span>
              <span className={styles.issuer}>
                {c.issuer === "NVIDIA" && <NvidiaMark size={16} />}
                {/* eslint-disable-next-line @next/next/no-img-element -- a 16px static mark */}
                {c.issuer === "Anthropic" && <img src="/brand/claude.svg" alt="" width={16} height={16} />}
                <span className="label">{c.issuer}</span>
                <span className="label">· {c.year}</span>
              </span>
              <span className={styles.featuredName}>{c.name}</span>
              {c.why && <span className={styles.why}>{c.why}</span>}
              {c.image && (
                <span className={styles.frame}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small static badge */}
                  <img src={c.image} alt={`${c.name} badge`} width={336} height={176} loading="lazy" />
                </span>
              )}
            </>
          );
          return (
            <div key={c.id} className={styles.cert} data-issuer={c.issuer}>
              {c.image ? (
                <CertViewer name={c.name} image={c.image} url={c.url}>
                  {face}
                </CertViewer>
              ) : (
                face
              )}
              <a className={styles.verify} href={c.url ?? "#"} target="_blank" rel="noreferrer" aria-label={`Verify on Credly: ${c.name}`}>
                [ Verify on Credly <span className={styles.arrow} aria-hidden="true">↗</span> ]
              </a>
            </div>
          );
        })}
      </div>

      {/* The rest, one tile per issuer: the brand mark, a plus, and how many
          verified certificates sit behind it. Only verified ones are counted
          or listed; each one is its own link. */}
      <ul className={styles.logos}>
        {issuers(rest).map((g) => (
          <li key={g.issuer} className={styles.logo}>
            {g.links.length === 1 ? (
              <a className={styles.logoHead} href={g.links[0].url} target="_blank" rel="noreferrer" title={g.links[0].name}>
                <LogoHead g={g} />
              </a>
            ) : (
              <details className={styles.logoFold}>
                <summary className={styles.logoHead}>
                  <LogoHead g={g} />
                </summary>
                <ul className={styles.logoList}>
                  {g.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Brand files for the issuers that have a licensed mark (devicon, simple-icons).
 *  IBM's own mark is not redistributable, so it is set as type. */
const LOGO: Record<string, string> = {
  "Amazon Web Services": "/brand/aws.svg",
  "Google Cloud": "/brand/googlecloud.svg",
};

type Group = { issuer: string; links: { name: string; url: string }[] };

/** Verified certificates per issuer, in first-seen order: a program counts
 *  each course that carries a verification link, never the ones still open. */
function issuers(certs: Certification[]): Group[] {
  const groups = new Map<string, Group>();
  for (const c of certs) {
    const g = groups.get(c.issuer) ?? { issuer: c.issuer, links: [] };
    if (c.url) g.links.push({ name: c.name, url: c.url });
    for (const comp of c.components ?? []) if (comp.url) g.links.push({ name: comp.name, url: comp.url });
    groups.set(c.issuer, g);
  }
  return [...groups.values()].filter((g) => g.links.length > 0);
}

function LogoHead({ g }: { g: Group }) {
  return (
    <>
      <span className={styles.plus} aria-hidden="true">+</span>
      {LOGO[g.issuer] ? (
        // eslint-disable-next-line @next/next/no-img-element -- a static brand mark
        <img className={styles.mark} src={LOGO[g.issuer]} alt={g.issuer} width={44} height={44} />
      ) : (
        <span className={styles.wordmark}>{g.issuer}</span>
      )}
      <span className={styles.logoCount}>
        {g.links.length} verified
      </span>
    </>
  );
}
