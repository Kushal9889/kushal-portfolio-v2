/** The earlier stage page, moved off the root. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import evals from "@/content/evals.json";
import models from "@/content/models.json";
import links from "@/content/links.json";
import cache from "@/content/build-cache.json";
import audit from "@/content/audit.json";
import signatures from "@/content/signatures.json";
import topology from "@/lib/agent/topology.json";
import { loadCertifications, loadContent, progress, section, type Section } from "@/lib/content";
import { TARGETS } from "@/lib/agent/tools";
import { forwardBlurb } from "@/lib/reach";
import { parsePatch } from "@/lib/patch";
import Stage from "../components/stage/Stage";
import HeroStage from "../components/stage/HeroStage";
import BugChapter from "../components/stage/BugChapter";
import MeasuredChapter from "../components/stage/MeasuredChapter";
import WorkChapter, { type Role } from "../components/stage/WorkChapter";
import ResearchChapter from "../components/stage/ResearchChapter";
import BuiltChapter from "../components/stage/BuiltChapter";
import CredentialsChapter, { type Plate } from "../components/stage/CredentialsChapter";
import BeyondChapter from "../components/stage/BeyondChapter";
import ContactFinale from "../components/stage/ContactFinale";
import styles from "../components/stage/Stage.module.css";

/** The bolded opening of a section, which the corpus writes as its one-line summary. */
function summary(s: Section) {
  const bold = (s.body.match(/\*\*([\s\S]+?)\*\*/)?.[1] ?? "").replace(/\s+/g, " ").trim().replace(/[,:;]$/, "");
  if (!bold) return "";
  return /[.!?]$/.test(bold) ? bold : `${bold}.`;
}

/** Capture groups of the first match, or null. Every derived figure below comes through here. */
function pick(text: string, re: RegExp) {
  return text.replace(/\s+/g, " ").match(re)?.slice(1) ?? null;
}

/** The code a verification page is keyed by: a Coursera verify code or a Credly badge id. */
function verifyCode(url: string) {
  return url.match(/verify\/([A-Z0-9]+)/)?.[1] ?? url.match(/badges\/([\w-]+)/)?.[1] ?? null;
}

function verifier(url: string) {
  const name = new URL(url).hostname.split(".").slice(-2)[0];
  return `Verify on ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * The one candid paragraph each role's section already carries: the trade-off it
 * made, the mistake it fixed, or the correction to how it has been described.
 * Read by its opening words, so the page shows exactly what the corpus says.
 */
function candor(s: Section): Role["note"] {
  const paragraphs = s.body.split(/\n\s*\n/).map((p) => p.replace(/\*\*/g, "").replace(/\s*\n\s*/g, " ").trim());
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const tradeoff = paragraphs.find((p) => p.startsWith("The trade-off worth asking about:"));
  if (tradeoff) return { kind: "trade-off", text: sentence(tradeoff.replace(/^The trade-off worth asking about:\s*/, "")) };
  const mistake = paragraphs.find((p) => p.startsWith("The mistake he made here"));
  if (mistake) return { kind: "the mistake", text: sentence(mistake.replace(/^The mistake he made here[^:]*:\s*/, "")) };
  const scope = paragraphs.flatMap((p) => p.split(/(?<=\.)\s+/)).find((p) => /did not manage anyone/.test(p));
  if (scope) return { kind: "scope", text: scope };
  return undefined;
}

function role(s: Section): Role {
  return {
    // The short name a link to the role uses: the last clause of the title, first word.
    slug: (s.title.split(",").pop() ?? s.title).trim().split(/\s+/)[0].toLowerCase(),
    note: candor(s),
    company: s.title,
    role: s.roleParts.title,
    dates: s.roleParts.dates,
    span: [...new Set(s.roleParts.dates.match(/\d{4}|present/gi) ?? [])].join(" to "),
    location: s.roleParts.location,
    lead: summary(s),
    metrics: s.metrics.map(({ value, label }) => ({ value, label })),
    stack: s.stack,
    ask: s.asks.find((a) => a.source === s.title)?.question,
  };
}

/**
 * The home page as stage chapters. Every figure is read from the corpus, the
 * credential file or a build artifact; nothing below is typed in as a fact.
 */
export default function Page() {
  const { profile } = loadContent();
  const cut = profile.tagline.indexOf(". ");

  // ---- The bug ----------------------------------------------------------
  const os = section("Open source, LangChain deepagents");
  const hours = os.metrics.find((m) => /hour/i.test(m.value));
  const places = os.metrics.find((m) => /places/i.test(m.label));
  const credited = os.metrics.find((m) => /credited/i.test(m.value));
  const merged = os.artifacts.find((a) => a.state === "merged");
  const issue = os.artifacts.find((a) => a.state === "closed");
  const proofCut = profile.proof.indexOf(". ");

  // The report's own timestamps, the precedent it traced, and the invariant it
  // showed the code breaking, all read from the section's prose.
  const osText = os.body.replace(/\s+/g, " ");
  const monthOf = (m: string) => new Date(`${m} 1, 2000`).getMonth();
  const stamps = pick(
    osText,
    /Filed (\d{1,2}) (\w+) (\d{4}) at (\d{2}):(\d{2}) UTC\. ([^,]+), a LangChain maintainer, wrote and merged the fix on (\d{1,2}) (\w+) at (\d{2}):(\d{2}) UTC, [^,]+, in (\d+) added lines across (\d+) files/,
  );
  const timeline = stamps
    ? {
        filed: new Date(Date.UTC(+stamps[2], monthOf(stamps[1]), +stamps[0], +stamps[3], +stamps[4])).toISOString(),
        merged: new Date(Date.UTC(+stamps[2], monthOf(stamps[7]), +stamps[6], +stamps[8], +stamps[9])).toISOString(),
        maintainer: stamps[5],
        added: +stamps[10],
        files: +stamps[11],
      }
    : null;
  const lineage = pick(osText, /same bug class as issue #(\d+), fixed for sandbox backends in #(\d+)/);
  const repoUrl = merged?.url.replace(/\/pull\/\d+\/?$/, "") ?? "";
  const precedent =
    lineage && repoUrl
      ? [
          { label: `#${lineage[0]}`, note: "same bug class", url: `${repoUrl}/issues/${lineage[0]}` },
          { label: `#${lineage[1]}`, note: "fixed for sandbox backends", url: `${repoUrl}/pull/${lineage[1]}` },
          ...(issue ? [{ label: `#${issue.url.split("/").pop()}`, note: "his report", url: issue.url }] : []),
          ...(merged ? [{ label: `#${merged.url.split("/").pop()}`, note: "the merged fix", url: merged.url }] : []),
        ]
      : [];
  const broken = pick(osText, /quoted from `?([\w_]+)`?:\s*([^.]+\.)/);
  // The merged patch as GitHub serves it, stored unedited next to the corpus.
  const patch = (() => {
    try {
      return parsePatch(readFileSync(join(process.cwd(), "content/pr-4925.diff"), "utf8"));
    } catch {
      return null;
    }
  })();
  const invariant = broken ? { source: broken[0], text: broken[1] } : null;

  // ---- Measured ---------------------------------------------------------
  const chosen = models.results.find((r) => r.model === models.chosen);
  const rival = chosen
    ? models.results.filter((r) => r.model !== chosen.model && r.rate >= chosen.rate).sort((a, b) => a.p95 - b.p95)[0]
    : undefined;

  // ---- Research ---------------------------------------------------------
  const pubs = section("Publications");
  const paper = pubs.artifacts.find((a) => a.url.includes("doi.org"));
  const chapter = pubs.artifacts.find((a) => a !== paper);
  const combined = pubs.metrics.find((m) => /combined/i.test(m.label));
  const alone = pubs.metrics.find((m) => /transformer alone/i.test(m.label));
  const timed = pubs.metrics.find((m) => /\ds$/.test(m.value));
  const graphAlone = pick(pubs.body, /graph network alone (\d+(?:\.\d+)?)%/);
  const against = timed ? pick(timed.label, /^(.*?), against ([\d.]+)s for (.*)$/) : null;
  const pages = pick(pubs.body, /pages (\d+) to (\d+)/);
  const code = pick(pubs.body, /\[the code\]\((https?:[^)]+)\)/);
  const pubsText = pubs.body.replace(/\s+/g, " ");
  // The paper's method in the corpus's own words, and the sentence that ties it
  // to the defect in the bug chapter.
  const method = pick(pubsText, /(a transformer reads the code, a graph neural network reads the structure around it)/)?.[0] ?? null;
  const bridge = pick(pubsText, /(It was a silent failure[^.]*\.)/)?.[0] ?? null;

  // ---- Built, Credentials, Beyond (the proof chapter, split) -----------
  const today = links.checkedOn;
  const receipt = (url: string) => {
    const found = links.links.find((l) => l.url === url);
    return { host: new URL(url).hostname.replace(/^www\./, ""), status: found?.status ?? null, checkedOn: found?.checkedOn ?? profile.lastVerified };
  };

  const life = section("BU Life AI");
  const liveUrl = pick(life.body, /Live: \[[^\]]+\]\((https?:[^)]+)\)/)?.[0] ?? "";
  const sourceUrl = pick(life.body, /Source: \[[^\]]+\]\((https?:[^)]+)\)/)?.[0] ?? "";
  const lifeRepo = sourceUrl.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
  const agents = pick(life.body, /agents for (\w+), (\w+) and (\w+)/) ?? [];
  const lifeFull = (life.body.split(/\n\s*\n/)[0] ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const site = section("This site");
  const siteRepo = profile.repo.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");

  const certs = [...loadCertifications()].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) || Number(Boolean(b.components)) - Number(Boolean(a.components)) || b.year - a.year,
  );
  const plates: Plate[] = certs.map((c) => {
    const done = progress(c);
    const kind: Plate["kind"] = c.kind === "proctored-exam" ? "exam" : c.kind === "program" ? "program" : "course";
    return {
      id: c.id,
      kind,
      name: c.name,
      short: c.short ?? null,
      issuer: c.issuer,
      year: c.year,
      why: c.why ?? null,
      verify: c.url ? { label: verifier(c.url), url: c.url, code: verifyCode(c.url), receipt: receipt(c.url) } : null,
      segments: done,
      earned: (c.components ?? []).flatMap((x) => (x.url ? [{ name: x.name, url: x.url, code: verifyCode(x.url), receipt: receipt(x.url) }] : [])),
      pending: (c.components ?? []).flatMap((x) => (x.url ? [] : [x.name])),
      identity: signatures.issuers[c.issuer as keyof typeof signatures.issuers] ?? null,
    };
  });

  const degrees = section("Education")
    .body.split(/\n\s*\n/)
    .map((p) => pick(p, /^(.+?), (\S+) (.+?)\. ([A-Z][a-z]+ \d{4} to [^.]+)\. ([^.]+)\.(?: Coursework: ([^.]+)\.)?/))
    .filter((d): d is string[] => d !== null)
    .map((d) => ({
      school: d[0],
      degree: `${d[1]} ${d[2]}`,
      dates: d[3],
      place: d[4],
      coursework: d[5] ? d[5].split(/,\s*/) : [],
      hue: signatures.organisations[d[0].split(",")[0] as keyof typeof signatures.organisations]?.hue ?? null,
    }));
  const ach = section("Achievements").body.replace(/\s+/g, " ");
  const jee = pick(ach, /(JEE Mains \d{4}): ([\d.]+) percentile of ([\d.]+) million candidates, top ([\d.]+) percent nationally/);
  const chef = pick(ach, /CodeChef global rank (\d+), ([^.]+)\. ([^.]+)\./);
  const club = pick(ach, /Co-founded (\w+), an? (\d+)-plus member coding community at ([^.]+)\. Mentees reached ([^.]+)\./);
  const fest = pick(
    ach,
    /([A-Z][\w ]+ Head), (Tarang Fest \d{4})\. Coordinated programming across (\d+) colleges and (\d+)-plus students, raised \$([\d,]+) from more than (\d+) sponsors/,
  );

  // ---- Contact ----------------------------------------------------------
  const availability = section("Availability").body;
  const openTo = pick(availability, /Open to ([^.]+)\./);
  const targetRoles = pick(availability, /Target roles: ([^.]+)\./);
  // Months from today to the month named in availability, computed rather than
  // restated, so the finale never repeats a countdown that has gone stale.
  const availMonth = pick(profile.available, /^([A-Z][a-z]+) (\d{4})/);
  const availableIn = (() => {
    if (!availMonth) return null;
    const target = new Date(`${availMonth[0]} 1, ${availMonth[1]}`);
    const now = new Date();
    const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    return months > 0 ? months : null;
  })();

  const workSample = pick(section("This site").body, /(The page you are reading is the work sample\.)/);

  return (
    <Stage
      name={profile.name}
      agent={{
        email: profile.email,
        linkedin: profile.linkedin,
        site: profile.site.replace("https://", ""),
        openable: [...TARGETS.entries()].map(([key, v]) => ({ key, label: v.label, url: v.url, about: v.about })),
      }}
      links={{
        email: profile.email,
        resume: "/kushal-gaddamwar-resume.pdf",
        repo: profile.repo,
        github: profile.github,
        linkedin: profile.linkedin,
      }}
      footer={
        <footer className={styles.footer}>
          <p>{workSample?.[0]}</p>
          <p>
            <a href={profile.repo}>Source for this page</a>
            Last verified {profile.lastVerified}
          </p>
        </footer>
      }
    >
      <HeroStage
        headline={cut === -1 ? profile.tagline : profile.tagline.slice(0, cut + 1)}
        qualifier={cut === -1 ? "" : profile.tagline.slice(cut + 2)}
        current={profile.current}
        identityHue={signatures.organisations["Boston University"]?.hue ?? undefined}
        available={profile.available}
        // Excludes the hero's own fixed demo question at the source, so the
        // list is identical before and after that answer resolves and never
        // moves the "also ask" row once it is on screen.
        followups={evals.cases_detail
          .filter((c) => c.group === "grounding" && c.pass && c.name !== "What has he shipped on Azure?")
          .map((c) => c.name)}
      />

      <BugChapter
        figure={hours?.value.replace(/\s*hours?$/i, "") ?? ""}
        unit={hours ? `hours ${hours.label}` : ""}
        lead={proofCut === -1 ? profile.proof : profile.proof.slice(0, proofCut + 1)}
        places={places ? { value: places.value, label: places.label, href: places.source ?? issue?.url ?? "" } : null}
        pr={merged ? { label: merged.label, url: merged.url, state: merged.state } : null}
        issue={issue ? { label: issue.label, url: issue.url } : null}
        credit={pick(osText, /The pull request body reads: (Credit to [^.]+\.)/)?.[0] ?? (credited ? `${credited.value} ${credited.label}.` : "")}
        timeline={timeline}
        precedent={precedent}
        invariant={invariant}
        patch={patch}
        verifiedOn={profile.lastVerified}
        reporter={pick(osText, /Credit to @(\w+)/)?.[0] ?? ""}
        offer={(() => {
          const o = pick(osText, /He offered in the issue to ([^.]+)\./);
          return o ? `Offered to ${o[0]}.` : "";
        })()}
        cached={{
          issue: issue ? ((cache.states as Record<string, { state: string; checkedOn: string }>)[`${issue.label}`] ?? null) : null,
          pr: merged ? ((cache.states as Record<string, { state: string; checkedOn: string }>)[`${merged.label}`] ?? null) : null,
        }}
      />

      <MeasuredChapter
        source={profile.repo}
        measured={evals.measured}
        evals={{
          cases: evals.cases,
          passed: evals.passed,
          runs: evals.runs,
          totalRuns: evals.totalRuns,
          totalPasses: evals.totalPasses,
          p50: evals.p50,
          p95: evals.p95,
          scored: evals.retrieval.scored,
          precision1: evals.retrieval.precision1,
          mrr: evals.retrieval.mrr,
          recallK: evals.retrieval.recallK,
          denseUsed: evals.denseUsed,
          retrievals: evals.retrievals,
          groups: Object.entries(evals.groups).map(([name, g]) => ({ name, cases: g.cases, passed: g.passed })),
          detail: evals.cases_detail.map((c) => ({
            name: c.name,
            group: c.group,
            asserts: c.asserts,
            passes: Math.round(c.passRate * c.runs),
            runs: c.runs,
            pass: c.pass,
            modes: c.modes,
          })),
          provider: evals.provider,
          model: evals.model,
        }}
        model={{
          chosen: models.chosen,
          chosenOn: models.chosenOn,
          observations: models.observations,
          p95: chosen?.p95 ?? 0,
          p50: chosen?.p50 ?? 0,
          next: rival ? { model: rival.model, p95: rival.p95, p50: rival.p50 } : null,
        }}
        graph={topology}
        defects={section("Defects this page shipped and then fixed").defects}
      />

      <WorkChapter
        roles={[
          role(section("Boston University, Questrom Computational Lab")),
          role(section("IMG Systems")),
          role(section("Growaza")),
        ]}
        verifiedOn={profile.lastVerified}
      />

      <BuiltChapter
        host={liveUrl ? new URL(liveUrl).hostname : ""}
        liveUrl={liveUrl}
        sourceUrl={sourceUrl}
        repo={lifeRepo}
        cache={{
          reach: (cache.reach as Record<string, { ms: number; checkedOn: string }>)[liveUrl] ?? null,
          commit: (cache.commits as Record<string, { at: string; stars: number; checkedOn: string }>)[lifeRepo] ?? null,
        }}
        life={{
          title: life.title,
          lead: summary(life),
          full: lifeFull,
          agents,
          metrics: life.metrics.map(({ value, label }) => ({ value, label })),
          stack: life.stack,
          hue: signatures.organisations["Boston University"].hue,
        }}
        site={{
          title: site.title,
          evals: { passes: evals.totalPasses, runs: evals.totalRuns, measured: evals.measured },
          audit: audit.total > 0 ? audit : null,
          linksCheckedOn: today,
          links: links.links.length,
          defects: section("Defects this page shipped and then fixed").defects.length,
          auditUrl: `${profile.repo}/blob/main/scripts/audit.ts`,
          repo: siteRepo,
          lastCommit: (cache.commits as Record<string, { at: string; checkedOn: string }>)[siteRepo] ?? null,
        }}
      />

      {paper && combined && alone && timed && graphAlone && against && (
        <ResearchChapter
          lead={summary(pubs)}
          paper={{
            venue: paper.kind.split(", ")[0],
            title: paper.label,
            url: paper.url,
            byline: [
              paper.kind.split(", ").slice(1).join(", ").replace(/^./, (ch) => ch.toUpperCase()),
              pages ? `pages ${pages[0]} to ${pages[1]}` : "",
            ]
              .filter(Boolean)
              .join(", "),
          }}
          code={code?.[0] ?? null}
          figure={{ value: combined.value, label: combined.label }}
          bars={[
            { value: Number.parseFloat(combined.value), label: combined.label.replace(/\s*accuracy$/, "") },
            { value: Number.parseFloat(alone.value), label: alone.label },
            { value: Number.parseFloat(graphAlone[0]), label: "graph network alone" },
          ]}
          time={{
            fast: Number.parseFloat(timed.value),
            fastLabel: against[0],
            slow: Number.parseFloat(against[1]),
            slowLabel: against[2],
          }}
          also={chapter ? { venue: chapter.kind, title: chapter.label, url: chapter.url } : null}
          method={method}
          bridge={bridge}
          verifiedOn={profile.lastVerified}
        />
      )}

      <CredentialsChapter plates={plates} linksCheckedOn={today} />

      <BeyondChapter
        education={degrees}
        jee={jee ? { exam: jee[0], percentile: jee[1], millions: jee[2], top: jee[3] } : null}
        codechef={chef ? { rank: chef[0], when: chef[1], also: chef[2] } : null}
        community={club ? { name: club[0], members: +club[1], where: club[2], outcomes: club[3].split(/,\s*(?:and\s+)?|\s+and\s+/) } : null}
        fest={
          fest
            ? { role: fest[0], event: fest[1], colleges: +fest[2], students: +fest[3], raised: fest[4], sponsors: +fest[5] }
            : null
        }
        checkedOn={profile.lastVerified}
        hues={{ codechef: signatures.organisations.CodeChef.hue }}
      />

      <ContactFinale
        register={[
          { term: "available", value: profile.available },
          ...(openTo ? [{ term: "open to", value: openTo[0] }] : []),
          { term: "based in", value: profile.location },
          ...(targetRoles ? [{ term: "roles", value: targetRoles[0] }] : []),
        ]}
        availableIn={availableIn}
        forwardText={forwardBlurb(
          { name: profile.name, current: profile.current, proof: profile.proof, site: profile.site },
          evals,
        )}
        reach={{
          email: profile.email,
          phone: profile.phone,
          linkedin: profile.linkedin,
          github: profile.github,
          repo: profile.repo,
          site: profile.site.replace("https://", ""),
          resumeHref: "/kushal-gaddamwar-resume.pdf",
          forward: { name: profile.name, current: profile.current, proof: profile.proof, site: profile.site, evals },
        }}
      />
    </Stage>
  );
}
