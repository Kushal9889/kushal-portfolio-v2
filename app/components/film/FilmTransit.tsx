import film from "@/content/film.json";
import FilmCard, { type LiveKey } from "./FilmCard";
import { TRANSIT_VH } from "./plan";
import { ROUTE } from "./shots";
import styles from "./FilmTransit.module.css";

type Card = { title: string; line: string; acts?: { title: string; line: string }[]; scale?: string[]; live?: LiveKey[] };
const CARDS = film.cards as Record<string, Card>;
const TRANSITS = ROUTE.filter((b) => b.stage).map((b) => b.id);

/**
 * A window between two sections where the film plays at full exposure. Not a
 * section, so the section observers and the entrance batching never see it.
 * Its height is what the route needs to cross it at a readable speed
 * (plan.ts), so the page and the camera cannot disagree. Its card says what
 * the film is showing (FilmCard.tsx).
 */
export default function FilmTransit({ id }: { id: string }) {
  const beat = ROUTE.find((b) => b.id === id);
  const card = CARDS[id];
  if (!beat?.stage || !card) return null;
  const scale = (card.scale ?? []).map((sid) => film.scale.find((s) => s.id === sid)!).map((s) => ({ label: s.label, text: s.text }));
  const live = (card.live ?? []).map((key) => ({ key, label: film.live[key] }));
  return (
    <div className={styles.transit} data-transit={id} style={{ "--transit-vh": TRANSIT_VH[id] } as React.CSSProperties}>
      <FilmCard stage={TRANSITS.indexOf(id) + 1} stages={TRANSITS.length} title={card.title} line={card.line} acts={card.acts} scale={scale} live={live} />
    </div>
  );
}
