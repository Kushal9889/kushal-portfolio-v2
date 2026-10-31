/**
 * Gradients, split by what they actually do.
 *
 * The old rule was `!/linear-gradient|radial-gradient/`, which is a string match
 * standing in for a design decision. It banned the thing the rule was written
 * for (a soft colour transition, which is the published tell of a generated
 * page) and it also banned a hatch, where every stop is hard and no
 * interpolation happens at all. A hatch is a pattern printed on a surface. It
 * has nothing in common with an aurora except the name of the CSS function.
 *
 * It also missed `conic-gradient` entirely, and the console dot grid was built
 * on exactly that gap, with a comment in globals.css saying so. A texture that
 * exists because a linter did not match it is decoration by definition.
 *
 * So the rule is now the decision rather than the string: interpolation is
 * banned, hard stops are not, and all three gradient functions are judged the
 * same way. Whether the pattern repeats is irrelevant, and testing for it was
 * the first draft of this check failing the console dot grid, which turned out
 * to be hard-stop on inspection and legitimate on its merits.
 *
 * Hard-stop means every colour stop carries two positions, so the colour ends
 * exactly where the next one starts. `transparent 0 2px, var(--ink) 2px 4px` is
 * a rule ruled onto a surface. `var(--ink), transparent` is a fade.
 */
export function interpolatedGradients(css: string): string[] {
  const offenders: string[] = [];
  const call = /(repeating-)?(linear|radial|conic)-gradient\s*\(/gi;
  for (const m of css.matchAll(call)) {
    const repeating = Boolean(m[1]);
    // Walk to the matching paren so nested var() and color-mix() do not end it early.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "(") depth++;
      else if (css[i] === ")") depth--;
    }
    const args = css.slice(m.index + m[0].length, i - 1);
    void repeating; // Repetition is not the test. Interpolation is.
    // Split on top-level commas only.
    const stops: string[] = [];
    let d = 0;
    let start = 0;
    for (let j = 0; j < args.length; j++) {
      if (args[j] === "(") d++;
      else if (args[j] === ")") d--;
      else if (args[j] === "," && d === 0) {
        stops.push(args.slice(start, j));
        start = j + 1;
      }
    }
    stops.push(args.slice(start));
    for (const raw of stops) {
      const stop = raw.trim();
      if (!stop) continue;
      // The first argument may be a direction or an angle rather than a stop.
      if (/^(to\s|-?[\d.]+(deg|turn|rad|grad)$|from\s|at\s|circle|ellipse)/i.test(stop)) continue;
      // A hard stop carries two lengths after the colour.
      const positions = stop.match(/(-?[\d.]+(px|rem|em|%|vw|vh)|\b0\b)/g) ?? [];
      if (positions.length < 2) {
        offenders.push(`${m[2]}-gradient: soft stop "${stop.slice(0, 32)}"`);
      }
    }
  }
  return offenders;
}
