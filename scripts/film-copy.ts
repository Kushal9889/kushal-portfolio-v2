/**
 * Prose gate for the film's own copy (plan 14.5): every string in
 * content/film.json and every string literal in the film's components.
 * Fails on an em-dash, an en-dash used as a separator, a banned word, more
 * than one middle dot in a line, or a scale row that is not "typical" with a
 * known source (plan K3).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SOURCES } from "../app/components/film/sources";

const BANNED = ["delve", "leverage", "showcase", "pivotal", "robust", "comprehensive", "seamlessly", "underscore", "foster", "tapestry", "testament", "intricate", "vibrant"];
const root = join(__dirname, "..");
const fails: string[] = [];

function check(where: string, text: string) {
  if (/—/.test(text)) fails.push(`${where}: em-dash in "${text}"`);
  if (/\s–\s/.test(text)) fails.push(`${where}: en-dash separator in "${text}"`);
  for (const w of BANNED) if (new RegExp(`\\b${w}`, "i").test(text)) fails.push(`${where}: banned word "${w}" in "${text}"`);
  if ((text.match(/·/g) ?? []).length > 1) fails.push(`${where}: more than one middle dot in "${text}"`);
}

function walk(where: string, v: unknown) {
  if (typeof v === "string") check(where, v);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(`${where}[${i}]`, x));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(`${where}.${k}`, x);
}

const film = JSON.parse(readFileSync(join(root, "content/film.json"), "utf8"));
walk("film.json", film);
for (const row of film.scale as { id: string; kind: string; source: string }[]) {
  if (row.kind !== "typical") fails.push(`film.json scale ${row.id}: kind "${row.kind}", not "typical"`);
  if (!(row.source in SOURCES)) fails.push(`film.json scale ${row.id}: unknown source "${row.source}"`);
}

const dir = join(root, "app/components/film");
for (const f of readdirSync(dir).filter((n) => /\.(tsx|ts)$/.test(n))) {
  const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const m of src.matchAll(/"([^"\n]{12,})"|`([^`\n]{12,})`/g)) check(f, m[1] ?? m[2]);
}

for (const f of fails) console.log("FAIL", f);
console.log(fails.length ? `${fails.length} failures` : "film copy: PASS");
process.exit(fails.length ? 1 : 0);
