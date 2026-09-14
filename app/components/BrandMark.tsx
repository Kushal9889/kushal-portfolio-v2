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
 * `currentColor` and `1em`, so the mark takes the colour and size of the text it
 * sits in and needs no rule of its own on either ground.
 */
export default function BrandMark({ name }: { name: string }) {
  const icon = brandIcon(name);
  if (!icon) return null;

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
