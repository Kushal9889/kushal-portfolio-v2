import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { allLinks, loadContent } from "../lib/content";

/**
 * Checks every external link the site renders, and writes each result with its
 * date to content/links.json, which the page reads for its verification receipts.
 * Runs in CI so a dead link fails a pull request rather than the live page.
 */
async function check(url: string) {
  try {
    // HEAD first; some hosts refuse it, so fall back to a ranged GET rather than
    // reporting a link as broken when it is only unwilling to answer HEAD.
    let res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", headers: { range: "bytes=0-0" } });
    }
    return { url, status: res.status, ok: res.status < 400 };
  } catch (err) {
    return { url, status: 0, ok: false, error: (err as Error).message };
  }
}

/**
 * A GitHub issue or pull request has a state, and the corpus asserts one.
 *
 * `@artifact ... | merged | ...` is the strongest claim on this site: it says an
 * outsider acted on his work. A 200 from the URL proves the page exists, not
 * that it still says what he claims. A maintainer can revert a merge or close an
 * issue as not-planned, and the site would go on describing a merged fix with a
 * link that resolves perfectly.
 *
 * The unauthenticated API allows 60 requests an hour, which is far more than the
 * two artifacts here need. A rate limit or an outage reports as unknown rather
 * than as a failure: not being able to check is different from checking and
 * finding a lie.
 */
async function checkArtifactStates() {
  const artifacts = loadContent()
    .sections.flatMap((s) => s.artifacts)
    .filter((a) => /github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/.test(a.url));

  const wrong: string[] = [];

  for (const a of artifacts) {
    const m = a.url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/)!;
    const api = `https://api.github.com/repos/${m[1]}/${m[2]}/${m[3] === "pull" ? "pulls" : "issues"}/${m[4]}`;

    try {
      const res = await fetch(api, { headers: { accept: "application/vnd.github+json" } });
      if (!res.ok) {
        console.log(`  ?    ${res.status} could not verify state of ${a.url}`);
        continue;
      }
      const json = (await res.json()) as { state: string; merged?: boolean };
      // "merged" and "closed" are the same state field to the API and opposite
      // claims to a reader, which is why the corpus writes the state out.
      const actual = json.merged ? "merged" : json.state;
      const claimed = a.state.toLowerCase();

      if (actual !== claimed && !(claimed === "closed" && actual === "closed")) {
        wrong.push(`${a.url} is "${actual}", corpus claims "${claimed}"`);
      } else {
        console.log(`  ok   ${actual.padEnd(6)} ${a.url}`);
      }
    } catch {
      console.log(`  ?    unreachable, could not verify state of ${a.url}`);
    }
  }

  return wrong;
}

/**
 * The resume carries its own URLs, and they are checked with the page's.
 *
 * The PDF is served next to the page and linked from it, so a dead link inside
 * it is a dead link on the site.
 *
 * Extraction is best-effort. Without pdftotext this contributes nothing rather
 * than failing the build on a missing local tool.
 */
function resumeLinks(): string[] {
  const pdf = join(process.cwd(), "public/kushal-gaddamwar-resume.pdf");
  if (!existsSync(pdf)) return [];

  // The text layer is the wrong place to look, and finding that out was the
  // point: the resume shows "LinkedIn" and "GitHub" as words, with the actual
  // destinations held in link annotations. pdftotext extracts none of them, so
  // an ATS that reads only the text layer sees a resume with no links at all.
  //
  // The annotations live inside Flate-compressed object streams, so the file is
  // walked and each stream inflated. zlib ships with Node; a PDF library for
  // eleven regex matches would be a dependency for nothing.
  const raw = readFileSync(pdf);
  const found = new Set<string>();

  for (const match of raw.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      // Not a Flate stream, or an image. Nothing to read here.
      continue;
    }
    for (const uri of body.matchAll(/\/URI\s*\((https?:[^)]+)\)/g)) found.add(uri[1]);
  }

  return [...found];
}

async function main() {
  // The site's own URL is skipped: it 404s until the first deploy, and failing
  // the build that produces the deploy would be a loop with no exit.
  const self = loadContent().profile.site;
  const fromResume = resumeLinks();
  if (fromResume.length) console.log(`including ${fromResume.length} URLs from the shipped resume`);
  const links = [...new Set([...allLinks(), ...fromResume])].filter((url) => !url.startsWith(self));
  const results = await Promise.all(links.map(check));
  const broken = results.filter((r) => !r.ok);

  for (const r of results.sort((a, b) => Number(a.ok) - Number(b.ok))) {
    console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.status).padStart(3)}  ${r.url}`);
  }

  console.log(`\n${links.length} links, ${broken.length} broken`);
  const checkedOn = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(process.cwd(), "content/links.json"),
    `${JSON.stringify({ checkedOn, links: results.map(({ url, status, ok }) => ({ url, status, ok, checkedOn })) }, null, 2)}\n`,
  );

  console.log("\nartifact states, against the GitHub API:");
  const wrongStates = await checkArtifactStates();
  for (const w of wrongStates) console.error(`  FAIL ${w}`);

  if (broken.length || wrongStates.length) process.exit(1);
}

main();
