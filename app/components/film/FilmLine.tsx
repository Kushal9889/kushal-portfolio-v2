import film from "@/content/film.json";
import styles from "./FilmTransit.module.css";

/**
 * The film's opening question and its closing answer (the five-year arc),
 * in the transit card's frame. Kushal writes both lines in content/film.json
 * arc; while a line is empty nothing renders, so the page keeps its length.
 */
export default function FilmLine({ which }: { which: "hook" | "closing" }) {
  const text = film.arc[which].trim();
  if (!text) return null;
  return (
    <aside className={styles.card} data-state="in" data-arc={which}>
      <div className={styles.body}>
        <p className={styles.title}>{text}</p>
      </div>
    </aside>
  );
}
