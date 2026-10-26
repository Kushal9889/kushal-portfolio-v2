import { UI_ICONS, type GlyphKey } from "@/lib/ui-icons";

/**
 * A Phosphor glyph from the build-time inventory. Always decorative: every glyph
 * sits beside a visible label, so it is hidden from assistive technology.
 */
export default function Glyph({ name, size = 16, className }: { name: GlyphKey; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      dangerouslySetInnerHTML={{ __html: UI_ICONS[name] }}
    />
  );
}
