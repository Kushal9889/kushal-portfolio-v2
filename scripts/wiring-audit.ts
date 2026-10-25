/**
 * What exists in the tree but is not connected to anything.
 *
 *   npx tsx scripts/wiring-audit.ts
 *
 * Written 2026-10-25 after work from other sessions turned out to live in
 * sibling clones (docs/session-reconciliation.md). This checks the other half:
 * code that is in v2 but wired to nothing, so a change to it can never show.
 *   1. components no module imports
 *   2. CSS module classes no TSX file reads, and styles.x reads with no class
 *   3. package.json scripts pointing at files that do not exist
 * Exit 1 when any list is non-empty, so it can gate a session.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const root = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (/node_modules|\.next|\.cache/.test(p)) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const code = [...walk(join(root, "app")), ...walk(join(root, "lib"))].filter((f) => /\.(tsx?|mjs)$/.test(f));
const text = new Map(code.map((f) => [f, readFileSync(f, "utf8")]));

// 1. Components nobody imports. Next's file conventions (page, layout, route...) are entry points.
const ENTRY = /\/(page|layout|route|loading|error|not-found|template|default|opengraph-image|icon|sitemap|robots|manifest)\.tsx?$/;
const unimported = code
  .filter((f) => f.includes("/components/") && f.endsWith(".tsx") && !ENTRY.test(f))
  .filter((f) => {
    const name = basename(f, ".tsx");
    const re = new RegExp(`from\\s+["'][^"']*/${name}["']|import\\(\\s*["'][^"']*/${name}["']`);
    return ![...text].some(([g, t]) => g !== f && re.test(t));
  })
  .map((f) => relative(root, f));

// 2. CSS module classes vs reads in the component that imports the module.
const classIssues: string[] = [];
for (const css of walk(join(root, "app")).filter((f) => f.endsWith(".module.css"))) {
  const src = readFileSync(css, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const classes = new Set([...src.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const users = [...text].filter(([, t]) => t.includes(`/${basename(css)}"`) || t.includes(`./${basename(css)}"`) || t.includes(`/${basename(css)}'`));
  if (!users.length) {
    classIssues.push(`${relative(root, css)}: imported by nothing`);
    continue;
  }
  const reads = new Set(users.flatMap(([, t]) => [...t.matchAll(/styles(?:\.(\w+)|\[["'](\w[\w-]*)["']\])/g)].map((m) => m[1] ?? m[2])));
  const dynamic = users.some(([, t]) => /styles\[[^"'\]]/.test(t));
  const unused = [...classes].filter((c) => !reads.has(c) && !/^(is|has)-/.test(c));
  const missing = [...reads].filter((c) => !classes.has(c));
  if (unused.length && !dynamic) classIssues.push(`${relative(root, css)}: unused ${unused.join(", ")}`);
  if (missing.length) classIssues.push(`${relative(root, css)}: read but not defined ${missing.join(", ")}`);
}

// 3. package scripts naming a file that is not there.
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;
const missingScripts = Object.entries(scripts).flatMap(([k, v]) =>
  [...v.matchAll(/((?:scripts|tests)\/[\w./-]+\.(?:ts|mjs|js|py|sh))/g)].filter((m) => !existsSync(join(root, m[1]))).map((m) => `${k} -> ${m[1]}`),
);

const report = { unimported, classIssues, missingScripts };
for (const [k, v] of Object.entries(report)) {
  console.log(`== ${k} (${v.length})`);
  for (const line of v) console.log(`  ${line}`);
}
process.exit(unimported.length + classIssues.length + missingScripts.length ? 1 : 0);
