import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Design-system lint.
 *
 * Colour belongs in globals.css and nowhere else. Once components start carrying
 * their own hex values the palette stops being a system and becomes a suggestion,
 * which is how the previous site ended up with a chatbot and a whole section that
 * ignored light mode entirely.
 */

/**
 * globals.css defines the tokens. opengraph-image.tsx is the one genuine
 * exception: it renders through Satori, outside the DOM, where CSS custom
 * properties do not resolve, so its colours have to be written literally. They
 * are documented in that file as matching the tokens.
 */
const ALLOWED = new Set([
  "app/globals.css",
  // Per-section scene grades for /classic (docs/redesign-2026-10.md).
  "app/scenes.css",
  // Satori renders the share card with no access to the stylesheet and does not
  // resolve custom properties, so the tokens have to be written literally. The
  // route replaced app/opengraph-image.tsx when the card started carrying the
  // shared question, and the exemption moved with it.
  "app/og/route.tsx",
  // Brand marks. These hex values are NVIDIA's, GitHub's and LinkedIn's, not
  // this palette's, and a logo rendered in the wrong colour stops being the
  // logo. Exempt because they are not design tokens and must never be
  // retuned to match the page.
  "app/components/Mark.tsx",
  // The film's world as data: the material library and the state hues are the
  // one place its colours are written (plan C1 acceptance), and every mesh
  // reads them from there.
  "app/components/film/sources.ts",
  "app/components/film/hues.ts",
]);

/**
 * Build scripts are not shipped and render nothing. The silhouette test in
 * particular exists to name the forbidden colours, so scanning it for them
 * reports the detector as the offence.
 */
// Build output belongs here too. The Netlify adapter writes compiled CSS to
// .netlify/static, where every token has already been resolved to a hex value,
// so scanning it reports the design system as a violation of itself.
const SKIP_DIRS = ["node_modules", ".next", ".netlify", ".git", "scripts", "out", "dist"];

// Stylesheets may write any hex shorthand. Source files are matched only on the
// six and eight digit forms, because shorter runs collide with ordinary text:
// an issue reference like "PR #4925" is not a colour.
const COLOUR_CSS = /(#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\))/g;
const COLOUR_SRC = /(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\))/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if ([".css", ".tsx", ".ts"].includes(extname(path))) out.push(path);
  }
  return out;
}

const root = process.cwd();
let violations = 0;

for (const path of walk(root)) {
  const rel = path.slice(root.length + 1);
  if (ALLOWED.has(rel)) continue;

  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    // Skip comments: prose about a colour is not a colour.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const pattern = extname(path) === ".css" ? COLOUR_CSS : COLOUR_SRC;
    for (const match of line.matchAll(pattern)) {
      console.log(`${rel}:${i + 1}  ${match[0].trim()}`);
      violations++;
    }
  });
}

console.log(violations ? `\n${violations} hardcoded colours` : "no hardcoded colours");
if (violations) process.exit(1);
