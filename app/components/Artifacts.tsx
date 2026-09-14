import type { Artifact } from "@/lib/content";
import Callout from "./Callout";
import styles from "./Artifacts.module.css";

/**
 * Openable proof, one per row.
 *
 * These two links were previously a run-on line inside a paragraph, which put
 * the single strongest piece of evidence on the page at the same visual weight
 * as the sentence around it. They are the thing a sceptical reader clicks, so
 * they are given the room to be clicked.
 *
 * State is shown because it is the whole point: an issue anyone can open is not
 * evidence, and an issue that a maintainer closed with a merged fix is. The two
 * are distinguished the way GitHub itself distinguishes them, by naming the
 * state rather than by relying on a colour a reader has to decode.
 */
/**
 * The number the artifact is filed under.
 *
 * Read off what the corpus already wrote rather than stored a second time. A
 * pull request or an issue carries a number in its label; a paper does not, and
 * the thing that files a paper is its year, which sits in the kind line rather
 * than the title. Both are searched, because which field holds it is a fact
 * about how the corpus is written and not about the artifact.
 */
function detailOf(a: Artifact): string {
  const hash = /#(\d+)/.exec(a.label);
  if (hash) return hash[1];
  const year = /\b(?:19|20)\d{2}\b/.exec(`${a.kind} ${a.label}`);
  if (year) return year[0];
  return a.kind.slice(0, 3).toUpperCase();
}

/**
 * The sheet it is drawn on: whoever will answer for the link.
 *
 * This was the repository name, cut to six characters, which produced DEEPAG
 * and CYBER-. A truncated proper noun is worse than no label: it reads as a
 * word that does not exist, and the full name is already printed in the row
 * beside it. The resolver is short at full length, which is the property the
 * bottom half of a callout needs.
 */
function sheetOf(a: Artifact): string {
  try {
    const host = new URL(a.url).hostname;
    if (host.endsWith("doi.org")) return "DOI";
    if (host.endsWith("github.com")) return "GH";
    if (host.endsWith("orcid.org")) return "ORCID";
    return host.replace(/^www\./, "").split(".")[0].slice(0, 5).toUpperCase();
  } catch {
    return "REF";
  }
}

export default function Artifacts({
  items,
  chain = false,
}: {
  items: Artifact[];
  /**
   * Whether these rows are one thread of evidence rather than a set of
   * unrelated ones.
   *
   * Set by the caller, because only the caller knows. The open-source rows are
   * a chain: he filed the issue, a maintainer merged the fix, and the second
   * exists because of the first. The two publications are not -- they are
   * separate papers -- and drawing a leader between them would assert a
   * relationship the corpus never states.
   */
  chain?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <ul className={styles.list} data-chain={chain || undefined}>
      {items.map((a) => (
        <li key={a.url} className={styles.row}>
          <a className={styles.link} href={a.url} target="_blank" rel="noreferrer">
            {/* The row's own detail callout: which artifact above the line,
                which repository below it. The GitHub mark that used to sit here
                said only "this is on GitHub", which every row on the page
                already says by carrying a github.com URL. */}
            <Callout detail={detailOf(a)} sheet={sheetOf(a)} />
            <span className={styles.kind}>{a.kind}</span>
            <span className={styles.label} data-id={/\s/.test(a.label) ? undefined : ""}>
              {a.label}
            </span>
            <span className={styles.state} data-state={a.state}>
              {a.state}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
