import film from "@/content/film.json";
import { TRANSIT_VH } from "./plan";
import { ROUTE } from "./shots";
import styles from "./FilmTransit.module.css";

/**
 * A window between two sections where the film plays at full exposure. Not a
 * section, so the section observers and the entrance batching never see it.
 * Its height is what the route needs to cross it at a readable speed
 * (plan.ts), so the page and the camera cannot disagree.
 */
export default function FilmTransit({ id }: { id: string }) {
  const beat = ROUTE.find((b) => b.id === id);
  if (!beat?.stage) return null;
  const caption = film.stages[beat.stage as keyof typeof film.stages];
  return (
    <div className={styles.transit} data-transit={id} style={{ "--transit-vh": TRANSIT_VH[id] } as React.CSSProperties}>
      <p className={styles.caption} data-film-scrim>
        <span>{caption}</span>
        <span className={styles.tag}>{film.illustration}</span>
      </p>
    </div>
  );
}
