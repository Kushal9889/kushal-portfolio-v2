import { brandIcon } from "@/lib/brand-icons";

/**
 * The mark for a named product, or nothing.
 *
 * A stack line is a wall of undifferentiated mono text, and the question a
 * reader is actually asking it is "does he use the thing we use". A mark answers
 * that in a glance where the text answers it in a read.
 *
 * `aria-hidden`, always. The product name stays in the DOM beside it and is what
 * a screen reader announces, so this adds a second way to read the same fact and
 * never the only way. It is also why a missing mark costs nothing: six of the
 * brands named here were withdrawn from simple-icons by their trademark holders,
 * those names render exactly as they did before, and nothing about the row
 * depends on a glyph being there.
 *
 * Coloured marks are files in the brand's own colours. A brand too dark for the
 * dark ground keeps its path in `currentColor` at `1em` instead.
 */
export default function BrandMark({ name }: { name: string }) {
  const icon = brandIcon(name);
  if (!icon) return null;

  // The brand's own colours, from the generated file.
  if (icon.src) {
    // eslint-disable-next-line @next/next/no-img-element -- a 16px SVG, nothing to optimise
    return <img src={icon.src} alt="" width={16} height={16} className="brand-mark" aria-hidden="true" />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
