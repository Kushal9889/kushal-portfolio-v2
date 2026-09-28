import film from "@/content/film.json";
import { TRANSITS } from "./beats";
import styles from "./FilmTransit.module.css";

/**
 * A window between two sections where the film plays at full exposure. Not a
 * section, so the section observers and the entrance batching never see it.
 */
export default function FilmTransit({ id }: { id: string }) {
  const t = TRANSITS.find((x) => x.id === id);
  if (!t) return null;
  const caption = film.stages[t.stage as keyof typeof film.stages];
  return (
    <div className={styles.transit} data-transit={id} data-tall={t.tall || undefined}>
      <p className={styles.caption}>
        <span>{caption}</span>
        <span className={styles.tag}>{film.illustration}</span>
      </p>
    </div>
  );
}
