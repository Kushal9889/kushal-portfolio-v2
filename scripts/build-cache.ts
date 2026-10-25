import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent, section } from "../lib/content";

/**
 * Writes content/build-cache.json: the values the page reads live in the
 * browser, measured once from the build machine with the date they were read.
 * When the browser cannot reach a source, the page shows this value and its date
 * instead of a failure. A source this build cannot reach keeps the previous
 * build's value and date, so an offline build never erases a real reading.
 */

const FILE = join(process.cwd(), "content/build-cache.json");
const TIMEOUT_MS = 5000;
const today = new Date().toISOString().slice(0, 10);

type Reading<T> = T & { checkedOn: string };
export type BuildCache = {
  reach: Record<string, Reading<{ ms: number }>>;
  commits: Record<string, Reading<{ at: string; stars: number }>>;
  states: Record<string, Reading<{ state: string }>>;
  citations: Record<string, Reading<{ count: number }>>;
};

const previous: BuildCache = existsSync(FILE)
  ? JSON.parse(readFileSync(FILE, "utf8"))
  : { reach: {}, commits: {}, states: {}, citations: {} };

async function get(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const github = { accept: "application/vnd.github+json", "user-agent": "kushal-portfolio-build-cache" };

async function main() {
  const next: BuildCache = structuredClone(previous);
  const { profile } = loadContent();

  for (const repoUrl of [profile.repo]) {
    const repo = repoUrl.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
    const [commits, meta] = await Promise.all([
      get(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers: github }),
      get(`https://api.github.com/repos/${repo}`, { headers: github }),
    ]);
    if (commits?.ok && meta?.ok) {
      const [latest] = (await commits.json()) as { commit: { committer: { date: string } } }[];
      const { stargazers_count } = (await meta.json()) as { stargazers_count: number };
      if (latest) next.commits[repo] = { at: latest.commit.committer.date, stars: stargazers_count, checkedOn: today };
    }
  }

  for (const a of section("Open source, LangChain deepagents").artifacts) {
    const m = a.url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
    if (!m) continue;
    const res = await get(`https://api.github.com/repos/${m[1]}/${m[2]}/${m[3] === "pull" ? "pulls" : "issues"}/${m[4]}`, {
      headers: github,
    });
    if (!res?.ok) continue;
    const json = (await res.json()) as { state: string; merged?: boolean };
    next.states[`${m[1]}/${m[2]}#${m[4]}`] = { state: json.merged ? "merged" : json.state, checkedOn: today };
  }

  for (const a of section("Publications").artifacts.filter((x) => x.url.includes("doi.org"))) {
    const doi = a.url.replace("https://doi.org/", "");
    const res = await get(`https://api.crossref.org/works/${doi}`);
    if (!res?.ok) continue;
    const json = (await res.json()) as { message: { "is-referenced-by-count": number } };
    next.citations[doi] = { count: json.message["is-referenced-by-count"], checkedOn: today };
  }

  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
  const kept = (k: keyof BuildCache) => Object.values(next[k]).filter((v) => v.checkedOn !== today).length;
  console.log(
    `build-cache: ${Object.keys(next.reach).length} reach, ${Object.keys(next.commits).length} commits, ${Object.keys(next.states).length} states, ${Object.keys(next.citations).length} citations (${(["reach", "commits", "states", "citations"] as const).reduce((n, k) => n + kept(k), 0)} kept from an earlier build)`,
  );
}

main();
