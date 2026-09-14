import { progress, type Certification } from "@/lib/content";
import { NvidiaMark, IssuerDot, ISSUER_HUE } from "./Mark";
import styles from "./Certifications.module.css";

/**
 * Credentials are not equal, so they are not rendered equally.
 *
 * The featured one is a proctored vendor exam; the rest are course completions.
 * Flattening them into a uniform list would spend the same attention on both and
 * leave a reader unable to tell which is which.
 *
 * The multi-course program shows its components rather than hiding behind a
 * count, because each earned one carries its own verification link and a claim
 * a reader cannot check is worth less than one they can. Components still in
 * progress are listed unlinked and unstyled as earned, which is more useful than
 * omitting them and more honest than implying they are done.
 */
export default function Certifications({ certifications }: { certifications: Certification[] }) {
  const featured = certifications.find((c) => c.featured);
  const rest = certifications.filter((c) => !c.featured);
  return (
    <div className={styles.wrap}>
      {featured && (
        <a className={styles.featured} href={featured.url ?? "#"} target="_blank" rel="noreferrer">
          {/* A seal, in the sense a seal has always been used: the mark left by
              whoever stands behind the document. This one credential has a
              proctored exam behind it and the rest are course completions, so
              it is the only place on the page the mark appears. Drawn from the
              same generated line-work as the chapter ornaments. */}
          <span className="issuer-seal" aria-hidden="true" />
          {/* The only credential mark on the page. It sits on the proctored exam
              and nowhere else: putting the same treatment on course completions
              would flatten the distinction this section exists to make. */}
          <span className={styles.issuer}>
            {featured.issuer === "NVIDIA" && <NvidiaMark size={16} />}
            <span className="label">{featured.issuer}</span>
          </span>
          <span className={styles.featuredName}>{featured.name}</span>
          {featured.why && <span className={styles.why}>{featured.why}</span>}
          <span className={styles.verify}>Verify credential</span>
        </a>
      )}

      <ul className={styles.list}>
        {rest.map((c) => {
          const p = progress(c);
          return (
            <li key={c.id} className={styles.item}>
              <div className={styles.itemHead}>
                <div className={styles.itemMain}>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    <span>{c.name}</span>
                  )}
                  {/* The issuer carries its own hue so the wall can be read by
                      vendor at a glance, which is how anyone scanning
                      credentials actually reads it. The year stays neutral: it
                      is not part of the brand. */}
                  <span className="label">
                    <span
                      className="issuer"
                      style={
                        ISSUER_HUE[c.issuer]
                          ? ({ "--brand": ISSUER_HUE[c.issuer] } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <IssuerDot issuer={c.issuer} />
                      {c.issuer}
                    </span>
                    {" · "}
                    {c.year}
                  </span>
                </div>
                {p && (
                  <span className={`${styles.count} tabular`}>
                    {p.earned} of {p.total} verified
                  </span>
                )}
              </div>

              {c.components && (
                <ol className={styles.components}>
                  {c.components.map((comp) => (
                    <li key={comp.name} className={comp.url ? styles.done : styles.todo}>
                      {comp.url ? (
                        <a href={comp.url} target="_blank" rel="noreferrer">
                          {comp.name}
                        </a>
                      ) : (
                        comp.name
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
