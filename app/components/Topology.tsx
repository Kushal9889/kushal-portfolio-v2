import styles from "./Topology.module.css";

/**
 * How a request moves through a multi-agent system: one router, the agents it
 * chooses between, the store they all read. Drawn from the sentence that
 * describes it, so the figure says nothing the text does not.
 *
 * Plain boxes and hairlines. An agent system explained in a diagram is a claim
 * about structure, and structure reads better still than animated.
 */
export default function Topology({
  root,
  rootNote,
  leaves,
  leafNote,
  store,
}: {
  root: string;
  rootNote?: string;
  leaves: string[];
  leafNote?: string;
  store?: string;
}) {
  if (leaves.length === 0) return null;
  return (
    <figure className={styles.topo} aria-label={`${root} routing to ${leaves.join(", ")}`}>
      <div className={styles.node} data-root>
        <span className={styles.name}>{root}</span>
        {rootNote && <span className={styles.note}>{rootNote}</span>}
      </div>
      <ul className={styles.leaves} style={{ "--n": leaves.length } as React.CSSProperties}>
        {leaves.map((l) => (
          <li key={l} className={styles.node}>
            <span className={styles.name}>{l}</span>
          </li>
        ))}
      </ul>
      {leafNote && <p className={styles.leafNote}>{leafNote}</p>}
      {store && (
        <div className={styles.node} data-store>
          <span className={styles.name}>{store}</span>
        </div>
      )}
    </figure>
  );
}
