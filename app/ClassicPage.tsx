// The classic document's full system. The root layout ships only the shared
// base, so this page brings the rest with it.
import { CASE_QUESTIONS } from "@/lib/agent/evals";
import "./globals.css";
import "./scenes.css";
import Hero from "./components/Hero";
import ProofWall from "./components/ProofWall";
import Prose from "./components/Prose";
import Certifications from "./components/Certifications";
import DiffReveal from "./components/DiffReveal";
import Agent from "./components/Agent";
import Palette from "./components/Palette";
import Metrics from "./components/Metrics";
import Artifacts from "./components/Artifacts";
import Measured from "./components/Measured";
import Reach, { EmailLink } from "./components/Reach";
import ReachDock, { MotionSwitch, SearchKey } from "./components/ReachDock";
import SectionLink from "./components/SectionLink";
import PageMotion from "./components/PageMotion";
import SceneFx from "./components/SceneFx";
import AskSeeds from "./components/AskSeeds";
import ModelChoice from "./components/ModelChoice";
import Defects from "./components/Defects";
import WorkStack from "./components/WorkStack";
import BrandMark from "./components/BrandMark";
import SectionRail from "./components/SectionRail";
import EvalMatrix from "./components/EvalMatrix";
import Panel from "./components/Panel";
import Artifacts2 from "./components/Artifacts";
import evals from "@/content/evals.json";
import { loadContent, section, loadCertifications, type Section } from "@/lib/content";
import { TARGETS, toolSchemas } from "@/lib/agent/tools";
import { index as corpusIndex } from "@/lib/agent/corpus-index";
import { PIPELINE } from "@/lib/agent/events";
import { profileChips, remainder } from "@/lib/agent/chips";
import tested from "@/lib/agent/test-score.json";
import styles from "./page.module.css";
import FilmLine from "./components/film/FilmLine";
import Redact from "./components/Redact";
import Vitals from "./components/Vitals";
import FilmTransit from "./components/film/FilmTransit";
import FilmChip from "./components/film/FilmChip";
import FilmBoot from "./components/film/FilmBoot";
import FilmMount from "./components/film/FilmMount";
import Timeline, { startOf } from "./components/Timeline";
import Compare from "./components/Compare";
import CopyText from "./components/CopyText";
import { VISITOR_JOURNEYS } from "@/lib/journeys";
import FreeTierNote from "./components/FreeTierNote";

/** The section headings verbatim, for the rail and the footer index alike. */
const CHAPTERS = [
  { id: "opensource", label: "The bug that looked like success" },
  { id: "work", label: "Work" },
  { id: "running", label: "Also running" },
  { id: "research", label: "Research" },
  { id: "proof", label: "What else checks out" },
  { id: "approach", label: "How he works" },
  { id: "measured", label: "How this is measured" },
  { id: "education", label: "Education" },
  { id: "contact", label: "Get in touch" },
];

/** A corpus body with its line wrapping and bold markers taken out, for quoting. */
const flat = (body: string) => body.replace(/\*\*/g, "").replace(/\s+/g, " ");

/** The bolded opening claim of a corpus body. */
const boldLead = (body: string) => body.match(/\*\*([\s\S]+?)\*\*/)?.[1].replace(/\s+/g, " ").replace(/:$/, ".") ?? "";

/** The first sentence of a corpus body that contains `needle`. */
const sentenceWith = (body: string, needle: string) => flat(body).split(/(?<=[a-z0-9]\.) (?=[A-Z])/).find((x) => x.includes(needle)) ?? "";

function Section({
  id,
  title,
  claim,
  children,
  beat,
  scrim,
  ...tone
}: {
  id: string;
  title: string;
  /** The section's point in one line, read before anything else in it. */
  claim?: string;
  children: React.ReactNode;
  /** The film beat this slot plays. Beats keep the story's order while the
   *  sections move, so a section can sit in any slot. Defaults to its id. */
  beat?: string;
  /** Darken the film under this section's text, for slots whose shot is bright. */
  scrim?: boolean;
  /** Per-section treatment. Five identical sections read as one document. */
  "data-tone"?: "sunk";
  "data-weight"?: "closing";
  "data-lead"?: "artifact";
  /** Which head shape this section uses. See .section[data-layout] for why
   *  there are four of them and what each one is for. Absent means the rail. */
  "data-layout"?: "banner" | "rule" | "bank";
  /**
   * Which of the two registers this section is read in.
   *
   * Seven headings at one size is seven equal chapters, which is what this page
   * shipped: measured on the rendered page, six of seven h2 sat at 32px against
   * a 68px headline, and every section carried identical 96/108 padding. There
   * was no size left to say "this one carries the argument", so nothing did.
   *
   * Chapter takes the macro step and a frame with room around it. Instrument
   * takes the heading step and a tight one. The oscillation between them is the
   * density the design has always claimed and never measured.
   *
   * One component, one heading, an attribute: audit 12.6 requires exactly that
   * and a second Section component would fail it.
   */
  "data-register"?: "chapter" | "instrument";
  /** Hidden below 768px: sections a phone reader can skip. */
  "data-phone"?: "hide";
  /** One light sweep along the section's top rule when it first arrives (PageMotion + globals.css). */
  "data-sweep"?: "on";
}) {
  return (
    <section tabIndex={-1} id={id} data-beat={beat ?? id} className={styles.section} {...tone}>
      {/* Two columns above 62rem: the heading holds a rail on the left and
          everything else runs beside it. Stacked, seven section headings cost
          most of a screen on their own and the page used half its width. The
          children stay direct descendants of the wrap so the scroll batching
          still sees them individually. */}
      <div className={`wrap ${styles.grid}`} data-film-scrim>
        <div className={styles.head}>
          {/* The heading carries the section on its own. The ordinal that used
              to sit above it named a position rather than a subject, and cost
              the heading the size it should have had. The address it doubled as
              survives inside the heading, shown when the head is pointed at. */}
          <h2 className={styles.title}>
            {title}
            <SectionLink id={id} title={title} />
          </h2>
        </div>
        {/* Beside the heading in the rail layouts, under it elsewhere: always
            the first thing in the reading column. */}
        {claim && <p className={styles.claim}>{claim}</p>}
        {children}
      </div>
    </section>
  );
}

/**
 * One role, as a unit in a rack.
 *
 * This was a sticky identity rail in one column and the evidence in another,
 * so a role's title and its figures were two elements that had to be kept in
 * step by a shared containing block, a depth index and a revealed flag. The
 * rack does the same job with one object: the header strip carries the
 * identity and sticks on its own, so the title of the role a reader is inside
 * stays on screen without a second column existing to hold it.
 *
 * Two-year-old work is context, not evidence, and rendering it identically to
 * the current role spends the same attention on both. The content is
 * unchanged; the older two fold their description behind a disclosure that
 * keeps it in the markup, so a crawler and a reader with scripting off still
 * get the whole thing.
 */
/** The product hue each role's phrase figures take (tokens in globals.css). */
const ROLE_TINT: Record<string, string> = {
  "Boston University, Questrom Computational Lab": "var(--brand-azure)",
  "Boston University, Questrom Computational Lab, backend": "var(--brand-django)",
  "IMG Systems": "var(--brand-docker)",
  Growaza: "var(--brand-aws)",
};

function RoleContent({
  section: s,
  past = false,
  compact = false,
  id,
  row,
}: {
  section: Section;
  past?: boolean;
  /** Older roles show their figures; the prose and stack open on demand. */
  compact?: boolean;
  id: string;
  /** Which grid row this role occupies. */
  row: number;
}) {
  // The first paragraph is the role in one breath; the rest opens on demand.
  const [lead, ...more] = s.body.split(/\n\s*\n/);
  const leadProse = <Prose body={lead} className={`${styles.roleBody} ${styles.roleLead}`} claimHref={s.claim} />;
  const stack = s.stack.length > 0 && (
    <ul className={styles.stack}>
      {s.stack.map((t) => (
        <li key={t}>
          <BrandMark name={t} />
          {t}
        </li>
      ))}
    </ul>
  );
  const rest = more.length > 0 ? <Prose body={more.join("\n\n")} className={styles.roleBody} claimHref={s.claim} /> : null;
  const folded = compact ? <>{leadProse}{stack}{rest}</> : <>{stack}{rest}</>;

  return (
    <article
      id={id}
      className={styles.roleContent}
      data-role-content
      data-past={past || undefined}
      data-compact={compact || undefined}
      style={{ "--row": row, "--role-tint": ROLE_TINT[s.title] ?? "var(--rule)" } as React.CSSProperties}
    >
      <Panel
        kind="rack"
        surface="paper"
        heading={3}
        label={
          <>
            {s.roleParts.title}
            <span className={styles.company}>{s.title.replace(/, backend$/, "")}</span>
          </>
        }
        state={past ? "done" : "running"}
        status={`${s.roleParts.dates}${s.roleParts.location ? ` \u00b7 ${s.roleParts.location}` : ""}`}
      >
        <div className={styles.rolePair}>
          <div
            className={styles.roleFigures}
            style={{ "--figure-tint": ROLE_TINT[s.title] } as React.CSSProperties}
          >
            <Metrics items={s.metrics.slice(0, 4)} />
          </div>
          <div className={styles.roleProof}>
            {!compact && leadProse}
            <details className="more" data-phone-fold>
              <summary aria-label={`What he built as ${s.roleParts.title}`}>
                <span className="more-open">What he built</span>
                <span className="more-close">Show less</span>
              </summary>
              {folded}
              {s.asks.length > 0 && <AskSeeds items={s.asks} />}
            </details>
          </div>
        </div>
      </Panel>
    </article>
  );
}

export default function Page() {
  const { profile } = loadContent();
  const certs = loadCertifications();
  const asks = loadContent().sections.flatMap((x) => x.asks.map((a) => a.question));

  /**
   * The hero's one piece of outside validation, assembled from the corpus.
   *
   * Figure, unit and link all come from the open-source section rather than
   * being typed here: the metric is the same `57 hours` the section renders,
   * and the link is the same merged pull request the link checker resolves. A
   * second copy of any of it is a second thing that can drift.
   */
  const os = section("Open source, LangChain deepagents");
  const hours = os.metrics.find((m) => /hour/i.test(m.value));
  const merged = os.artifacts.find((a) => a.state === "merged");
  const evidence = {
    figure: hours?.value.replace(/\s*hours?$/i, "") ?? "57",
    sentence: profile.proof,
    href: merged?.url ?? profile.github,
    label: merged?.label ?? "",
  };

  /*
   * The agent's props, assembled here rather than inline.
   *
   * `openable` is the same registry `open_evidence` routes over, handed to
   * the reader as controls they can see. Built from the corpus in one place,
   * so a visible chip cannot offer something the tool could not open, or miss
   * something it can. Hoisted because check 6.1 asserts the agent sits inside
   * the hero by measuring the distance from `<Agent` to `</Hero>`, and four
   * inline props push it out of range.
   */
  // The agent counted, each number read from the code or file that decides it:
  // the tool schemas the model is given, the stages a run emits, the held-out
  // split's last result and the passages in the index.
  const tools = toolSchemas().map((t) => ({ name: t.function.name, does: t.function.description.split(". ")[0] + "." }));
  const counts = {
    tools: tools.length,
    steps: PIPELINE.length,
    tested,
    passages: (corpusIndex as { passages: unknown[] }).passages.length,
  };
  const agentProps = {
    tools,
    email: profile.email,
    linkedin: profile.linkedin,
    site: profile.site.replace("https://", ""),
    openable: [...TARGETS.entries()].map(([key, value]) => ({
      key,
      label: value.label,
      url: value.url,
      about: value.about,
    })),
    // What an outsider can check, lit on the card before anyone asks: the
    // upstream work, the two pinned certifications and the first ranking.
    // Each one asks the agent about itself; its link opens the record.
    brief: profile.brief,
    briefTerms: (profile.briefTerms ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    // Client names kept out of the passages shown under Sources and in cite previews.
    redactNames: (profile.private ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    highlights: (() => {
      const wall = section("Proof wall").badges;
      const titles = loadContent().sections.map((x) => x.title);
      // A badge's home is the section named for its project, else the wall itself.
      const homeOf = (label: string) => {
        const project = label.split(" #")[0].toLowerCase();
        const named = titles.filter((t) => t.toLowerCase().includes(project));
        return named.length ? named : ["Proof wall"];
      };
      // Source order is the order before any answer: a role, a credential, then upstream work.
      return profileChips(
        [
          { kind: "Lead Backend", label: "Agentic SDLC harness", href: "", ask: "What is the agentic SDLC harness he built, and how is it shipped as a plugin?", group: "role" as const, homes: ["Boston University, Questrom Computational Lab, backend"] },
          { kind: "RA", label: "AI Engineer", href: "/kushal-gaddamwar-resume.pdf", ask: `What did he build as ${section("Boston University, Questrom Computational Lab").roleParts.title}?`, group: "role" as const, homes: ["Boston University, Questrom Computational Lab"] },
          ...certs.filter((c) => c.pinned && c.url).map((c) => ({ kind: c.issuer, label: remainder(c.issuer, c.name), href: c.url!, image: c.image, cert: true, ask: `What does the ${c.name} certification cover, and how was it earned?`, group: "cert" as const, homes: ["Certifications"] })),
          ...wall.filter((b) => b.group === "Shipped").map((b) => ({ kind: "Open source", label: b.label, href: b.href, ask: `Tell me about ${b.label}: ${b.name}.`, group: "oss" as const, homes: homeOf(b.label) })),
          ...wall.filter((b) => b.group === "Ranked").slice(0, 1).map((b) => ({ kind: "Ranked", label: b.label, href: b.href, ask: `${b.name}: what does that rank mean?`, group: "last" as const, homes: ["Proof wall", "Achievements"] })),
        ],
        corpusIndex,
      );
    })(),
  };

  // Parsed once and handed to the racks, rather than each one reading the
  // corpus a second time.
  const questrom = section("Boston University, Questrom Computational Lab");
  const backend = section("Boston University, Questrom Computational Lab, backend");
  const img = section("IMG Systems");
  const growaza = section("Growaza");
  // Newest first. `past` is the de-emphasis flag the rail and the content
  // column both read, so the order and the weighting live in one place.
  const roles = [
    { section: backend, past: false, compact: false, id: "role-2" },
    { section: questrom, past: true, compact: false, id: "role-1" },
    { section: img, past: true, compact: true, id: "role-3" },
    { section: growaza, past: true, compact: true, id: "role-4" },
  ];

  // Figures drawn beside the prose that states them. Every value is read from
  // the corpus sentence or eval file it comes from; none is typed here.
  const pub = section("Publications");
  const pubText = flat(pub.body);
  const pct = (v?: string) => parseFloat(v ?? "");
  const gnn = parseFloat(pubText.match(/graph network alone ([\d.]+)%/)?.[1] ?? "");
  const fixS = parseFloat(pub.metrics[2]?.value ?? "");
  const staticS = parseFloat(pub.metrics[2]?.label.match(/against ([\d.]+)s/)?.[1] ?? "");
  const doi = pub.artifacts.find((a) => a.url.includes("doi.org"))?.url;
  const edu = flat(section("Education").body);
  const gre = edu.match(/GRE total score: (\d+) of (\d+)/);
  const greLabel = gre ? `GRE ${gre[1]}/${gre[2]}` : "";
  const after = (needle: string) => (edu.includes(needle) ? edu.slice(edu.indexOf(needle)) : "");
  const courses = edu.match(/Coursework: (.+?)\./)?.[1].split(", ") ?? [];
  const start = startOf(section("Availability").body);
  const filed = os.artifacts.find((a) => a.state === "closed" && a.url.includes("deepagents"));

  return (
    <>
      <FilmBoot />
      <Palette who={`${profile.name}, ${profile.role}`} email={profile.email} site={profile.site.replace("https://", "")} github={profile.github} repo={profile.repo} asks={asks} />
      {/* Reaching him from wherever the reader is, with the draft written for
          the section they are actually in. Six of the seven openers in
          lib/reach.ts have never been reachable, because the contact block is
          the only caller and it takes the default. */}
      <ReachDock
        who={`${profile.name}, ${profile.role}`}
        email={profile.email}
        site={profile.site.replace("https://", "")}
        linkedin={profile.linkedin}
        resumeHref="/kushal-gaddamwar-resume.pdf"
      />
      <PageMotion />
      <SceneFx />
      <FilmMount />
      <FilmChip />
      {/* Navigation the page did not have. The labels are the section headings
          verbatim, not a second set of names for the same things: two vocabularies
          for one page is how a reader ends up unsure whether "Proof" and "What
          else checks out" are the same section. */}
      {/* Scroll progress. Purely decorative, so it is hidden from assistive tech
          and disappears entirely under reduced-motion. */}
      <div className={styles.progress} aria-hidden="true" />
      <Hero
        name={profile.name}
        tagline={profile.tagline}
        location={profile.location}
        current={`${backend.roleParts.title}, ${backend.title.replace(/, backend$/, "")}.${start ? ` Full-time from ${start.label}.` : ""}${profile.sponsorship ? ` ${profile.sponsorship}.` : ""}`}
        evidence={evidence}
        email={profile.email}
        site={profile.site.replace("https://", "")}
        who={`${profile.name}, ${profile.role}`}
        certified={certs.filter((c) => c.pinned && c.url).map((c) => c.name)}
        resumeHref="/kushal-gaddamwar-resume.pdf"
        counts={counts}
      >
        <Agent {...agentProps} loop={false} />
      </Hero>
      <SectionRail items={CHAPTERS} />
      <FreeTierNote />

      <main id="main">
        <FilmLine which="hook" />
        <FilmTransit id="T1" />

        <Section
          id="opensource"
          beat="work"
          claim={hours ? `Merged by a LangChain maintainer ${hours.value} after his report.` : undefined}
          title="The bug that looked like success"
          data-lead="artifact"
          data-layout="banner"
          data-register="chapter"
          data-sweep="on"
        >
          {/* The duration and the pull request come from the corpus, not from
              inside the component: the same three values are rendered by the
              metrics strip and the artifact rows on this very section. */}
          <DiffReveal
            hours={os.metrics.find((m) => /hour/i.test(m.value))?.value ?? ""}
            prUrl={merged?.url ?? ""}
            prLabel={merged?.label.replace(/^.*#/, "PR #") ?? ""}
          />
          <div className={styles.beside}>
            <Prose body={section("Open source, LangChain deepagents").body} topic="the LangChain deepagents fix" claimHref={section("Open source, LangChain deepagents").claim} />
            {/* The two public records and the time between them, as a path a
                reader can walk: the report, then the merged fix. */}
            {filed && merged && hours && (
              <ol className={styles.chain} aria-label="From his report to the merged fix">
                <li>
                  <a className={styles.chainNode} href={filed.url} target="_blank" rel="noreferrer">
                    <span className={styles.chainKind}>{filed.kind}</span>
                    <span className={styles.chainLabel}>{filed.label}</span>
                    <span className={styles.chainState}>{filed.state}</span>
                  </a>
                </li>
                <li className={styles.chainGap}>
                  <span className={styles.chainHours}>{hours.value}</span> {hours.label}
                </li>
                <li>
                  <a className={styles.chainNode} href={merged.url} target="_blank" rel="noreferrer">
                    <span className={styles.chainKind}>{merged.kind}</span>
                    <span className={styles.chainLabel}>{merged.label}</span>
                    <span className={styles.chainState}>{merged.state}</span>
                  </a>
                </li>
              </ol>
            )}
          </div>
          <details className="more" data-phone-fold>
            <summary>
              <span className="more-open">The issue, the pull request and questions to ask</span>
              <span className="more-close">Show less</span>
            </summary>
            {/* The 57 hours is the claim above and the chain beside it; the
                other figures sit here with the records. */}
            <div className={styles.roleFigures} style={{ "--figure-tint": "var(--brand-langchain)" } as React.CSSProperties}>
              <Metrics items={os.metrics} />
            </div>
            <Artifacts items={os.artifacts} chain />
            <AskSeeds items={section("Open source, LangChain deepagents").asks} />
          </details>
        </Section>

        <FilmTransit id="T2" />

        <Section id="work" beat="opensource" title="Work" claim={boldLead(section("Who he is").body)} data-layout="banner" data-register="chapter">
          <WorkStack />
          {/* Rail and content are two columns of one grid, not three
              self-contained role cards, so every role's identity can share
              one tall containing block and stack rather than take turns --
              see .roleRail in page.module.css. */}
          {/* Phone: every role in one glance before the racks, for a reader
              checking the shape of his experience rather than its detail. */}
          <ol className={styles.roleIndex} data-only="phone" aria-label="Roles at a glance">
            {roles.map(({ section: r, id }) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <b>{r.roleParts.title}</b>
                  <span>{r.title.replace(/, backend$/, "")} \u00b7 {r.roleParts.dates}</span>
                </a>
              </li>
            ))}
          </ol>
          <div
            className={styles.roles}
            style={{ "--role-count": roles.length } as React.CSSProperties}
          >
            {/* No rail. Each rack's own header strip sticks, so the identity of
                the role a reader is inside stays on screen without a second
                column existing to hold a copy of it. */}
            {roles.map(({ section: s, past, compact, id }, i) => (
              <RoleContent key={s.title} section={s} past={past} compact={compact} id={id} row={i + 1} />
            ))}
          </div>
          <nav className={styles.journeyActions} aria-label="Next steps after Work">
            <EmailLink who={`${profile.name}, ${profile.role}`} email={profile.email} site={profile.site.replace("https://", "")} context="work" data-primary>Email him</EmailLink>
            <a href="#approach">How he engineers</a>
          </nav>
        </Section>

        <FilmTransit id="T3" />

        <Section id="running" beat="research" title="Also running" claim={sentenceWith(section("This site").body, "The agent on this page answers")} data-register="instrument">
          <AskSeeds items={[{ question: "What happens when every model provider fails?" }]} />
        </Section>

        <FilmTransit id="T4" />

        {/* The paper has measured results and a DOI.
            The paper is first-author work with measured numbers and a DOI, and
            it sat in a one-third column under Credentials while a side project
            held a top-level heading. It also completes the thread section 01
            opens: the paper argues context is needed to catch bugs static
            analysis misses, and the LangChain defect was exactly that shape. */}
        <Section id="research" beat="approach" title="Research" claim={boldLead(pub.body)} data-register="instrument">
          {/* Framed the way Also running is: one console panel with a status,
              the figures, the argument, and the papers behind a fold. */}
          <Panel
            className={styles.alsoBuilt}
            hue="var(--brand-ieee)"
            kind="instrument"
            surface="console"
            heading={3}
            label="IEEE ICAICCIT 2024 · first author"
            state="done"
            status="published"
          >
            <div
              className={styles.roleFigures}
              style={{ "--figure-tint": "var(--brand-ieee)" } as React.CSSProperties}
            >
              <Metrics items={section("Publications").metrics} />
            </div>
            {gnn > 0 && (
              <Compare
                title="Bug detection accuracy"
                min={80}
                max={95}
                ticks={[80, 85, 90, 95]}
                unit="%"
                rows={[
                  { label: "Graph network alone", value: gnn, shown: `${gnn}%` },
                  { label: "Transformer alone", value: pct(pub.metrics[1]?.value), shown: pub.metrics[1]?.value ?? "" },
                  { label: "Combined", value: pct(pub.metrics[0]?.value), shown: pub.metrics[0]?.value ?? "", lead: true },
                ]}
                note="Dots, not bars: the scale starts at 80%."
              />
            )}
            {/* The argument, the timing chart and both papers open together. */}
            <details className="more">
              <summary>
                <span className="more-open">The paper, its timing chart and both papers</span>
                <span className="more-close">Show less</span>
              </summary>
              <div className={styles.beside}>
                <Prose body={section("Publications").body} topic="publications" claimHref={section("Publications").claim} />
                <div className={styles.figures}>
                  {staticS > 0 && fixS > 0 && (
                    <Compare
                      title="Detect and fix, seconds"
                      min={0}
                      max={30}
                      ticks={[0, 10, 20, 30]}
                      unit=" s"
                      rows={[
                        { label: "Static analysis", value: staticS, shown: `${staticS} s` },
                        { label: "The paper's model", value: fixS, shown: `${fixS} s`, lead: true },
                      ]}
                    />
                  )}
                  {doi && <CopyText text={doi} label="Copy the DOI link" what="doi" />}
                </div>
              </div>
              <Artifacts2 items={section("Publications").artifacts} />
            </details>
          </Panel>
        </Section>


        <FilmTransit id="T5" />

        {/* "Credentials" named one of the four things in here. The section also
            holds a deployed project with a live reachability probe, a degree,
            and a competition percentile, none of which is a credential. The id
            stays `proof`: it is the parameter the agent's compose_intro tool
            takes and the key ReachDock maps to a draft. */}
        <Section
          id="proof"
          claim={sentenceWith(section("Who he is").body, "certifies him")}
          beat="measured"
         
          title="What else checks out"
          data-tone="sunk"
          data-layout="rule"
          data-register="instrument"
        >
          <Certifications certifications={certs} />
        </Section>

        <FilmTransit id="T6" />

        {/* What he is and what he is not, before the evidence. A reader who has
            just watched the agent answer wants to know who they are talking to;
            the scope limits are here rather than buried because stating them
            early is what makes the rest of the page readable as fact. */}
        <Section id="approach" beat="running" title="How he works" claim={boldLead(section("What he is good at").body)} data-layout="rule" data-register="instrument">
          <Panel kind="instrument" surface="console" heading={3} label="Decisions behind this page">
            {[
              ["Conversation state", "**The graph runs without a checkpointer.**"],
              ["Provider failure", "**When every model provider fails, the answer degrades rather than erroring.**"],
              ["Evaluation strategy", "**The evaluation suite has no LLM judge, deliberately.**"],
            ].map(([label, opening]) => {
              const body = section("This site").body.split(/\n\s*\n/).find((paragraph) => paragraph.startsWith(opening));
              return body ? <details className="more" key={label}>
                <summary>{label}: {opening.replace(/\*\*/g, "")}</summary>
                <Prose body={body} claimHref={section("This site").claim} />
              </details> : null;
            })}
            <AskSeeds items={[{ question: VISITOR_JOURNEYS[1].question }]} />
            <nav className={styles.journeyActions} aria-label="Technical evidence">
              <a href="#measured">Inspect the measured evidence</a>
              <a href={profile.repo} target="_blank" rel="noreferrer">Open the source</a>
            </nav>
          </Panel>
          <div>
            {/* The opening paragraph restates the hero and the roles; the rest stays. */}
            <Prose body={section("Who he is").body.split(/\n\s*\n/).slice(1).join("\n\n")} topic="who he is" claimHref={section("Who he is").claim} />
            {/* The habit is stated once, in the paragraph above. */}
            <Prose
              body={section("What he is good at").body.split(/\n\s*\n/).filter((p) => !p.includes("contradicts itself")).join("\n\n")}
              topic="what he is good at"
              claimHref={section("What he is good at").claim}
            />
            <details className="more">
              <summary>Experience scope</summary>
              <Prose body={section("What he does not do").body} />
            </details>
          </div>
          <details className="more" data-phone-fold>
            <summary>
              <span className="more-open">Try the redaction demo</span>
              <span className="more-close">Show less</span>
            </summary>
            <Redact />
          </details>
        </Section>

        <FilmTransit id="T7" />

        {/* The strongest signal in 2026 hiring is evidence that the thing was
            measured, not that it was built. It sits second because the bug above
            proves he finds failures and this proves he checks for them. */}
        <Section id="measured" beat="proof" title="How this is measured" claim={`${evals.passed} of ${evals.cases} eval cases pass on every run.`} data-layout="bank" data-register="instrument" data-sweep="on">
          <Measured>
            <EvalMatrix questions={[...CASE_QUESTIONS]} />
            <ModelChoice />
            <Vitals />
            <Defects />
          </Measured>
        </Section>

        <FilmTransit id="T8" />

        <Section id="education" title="Education" claim={sentenceWith(section("Education").body, "GPA")} data-tone="sunk" data-layout="rule" data-register="instrument">
          {/* Two panels: the degrees, then what came before them. Stacked: side
              by side inside the reading column each panel was too narrow for
              its figures. */}
          {/* Degree, GPA, teaching and the two rankings in view; the rest of the
              record opens on demand. */}
          <Panel className={styles.alsoBuilt} hue="var(--brand-bu)" kind="instrument" surface="console" heading={3} label="Degrees" state="running" status="M.S. in progress">
            <div className={styles.eduFigures}>
              <Metrics
                items={[
                  ...section("Education").metrics,
                  ...section("Achievements").metrics.filter((m) => /JEE|CodeChef/.test(m.label)),
                ]}
              />
            </div>
            <details className="more">
              <summary>
                <span className="more-open">Coursework, timeline and earlier achievements</span>
                <span className="more-close">Show less</span>
              </summary>
              {greLabel && <p><strong>{greLabel}</strong></p>}
              <div className={styles.beside}>
                <Prose body={section("Education").body.replace(/GRE total score: [^.]+\.\s*/, "")} topic="education" />
                <div className={styles.figures}>
                  <Timeline
                    label="Degrees and teaching over time"
                    items={[
                      { label: "B.Tech, Computer Science", sub: "IIIT Jabalpur", when: after("IIIT") },
                      { label: "M.S., Computer Science", sub: "Boston University", when: after("M.S.") },
                      { label: "Teaching Assistant", sub: "MET CS 664", when: after("Teaching Assistant") },
                    ]}
                  />
                  {courses.length > 0 && (
                    <ul className={styles.stack} aria-label="Coursework">
                      {courses.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className={styles.eduFigures}>
                <Metrics items={section("Achievements").metrics.filter((m) => !/JEE|CodeChef/.test(m.label))} />
              </div>
              <Prose body={section("Achievements").body} topic="achievements" />
            </details>
          </Panel>
        </Section>

        <FilmTransit id="T9" />

        <Section
          id="contact"
          claim={sentenceWith(section("Availability").body, "Target roles")}
         
          title="Get in touch"
          data-weight="closing"
          data-layout="banner"
          data-register="chapter"
          data-sweep="on"
        >
          {/* The record first, then the close: when he can start and the one
              action, so the page ends on what the reader came to do. */}
          <ProofWall certs={certs} badges={section("Proof wall").badges} />
          <Reach
            email={profile.email}
            phone={profile.phone}
            linkedin={profile.linkedin}
            repo={profile.repo}
            site={profile.site.replace("https://", "")}
            resumeHref="/kushal-gaddamwar-resume.pdf"
            who={`${profile.name}, ${profile.role}`}
            available={section("Availability").body.split(/\n\s*\n/)[0].replace(/\s+/g, " ")}
            forward={{
              name: profile.name,
              current: profile.current,
              proof: profile.proof,
              site: profile.site,
              certified: certs.filter((c) => c.pinned && c.url).map((c) => `${c.name} (${c.issuer})`),
              evals,
            }}
          />
          <FilmLine which="closing" />
        </Section>
      </main>

      <footer className={styles.footer}>
        {/* Where a reader can go from the end of the page: every section by
            its heading, and back to the top. */}
        <nav className={`wrap ${styles.footIndex}`} aria-label="Sections" data-film-scrim>
          <ol>
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`}>{c.label}</a>
              </li>
            ))}
          </ol>
          <span className={styles.footTools}>
            <SearchKey />
            <MotionSwitch />
            <a className={styles.top} href="#top">
              Back to top
            </a>
          </span>
        </nav>
        {/* The wordmark, oversized and outlined.
            `aria-hidden`, and that is not an oversight: the name is already the
            h1 at the top of this page, and a screen reader meeting it a second
            time at the bottom learns nothing and loses its place. Here it is
            type as a graphic object, so it is drawn for the eye only. */}
        <p className={styles.wordmark} aria-hidden="true" data-film-scrim>
          {profile.name}
        </p>
        <div className="wrap" data-film-scrim>
          <p className="label">Last verified {profile.lastVerified}</p>
        </div>
      </footer>
    </>
  );
}
