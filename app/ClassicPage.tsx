// The classic document's full system. The root layout ships only the shared
// base, so this page brings the rest with it.
import "./globals.css";
import "./scenes.css";
import Hero from "./components/Hero";
import ProofWall, { seal } from "./components/ProofWall";
import Prose from "./components/Prose";
import Certifications from "./components/Certifications";
import DiffReveal from "./components/DiffReveal";
import Agent from "./components/Agent";
import Palette from "./components/Palette";
import LiveStatus from "./components/LiveStatus";
import Metrics from "./components/Metrics";
import Artifacts from "./components/Artifacts";
import Measured from "./components/Measured";
import Reach from "./components/Reach";
import ReachDock from "./components/ReachDock";
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
import { TARGETS } from "@/lib/agent/tools";
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
import Topology from "./components/Topology";
import CopyText from "./components/CopyText";
import Countdown from "./components/Countdown";

/** The section headings verbatim, for the rail and the footer index alike. */
const CHAPTERS = [
  { id: "work", label: "Work" },
  { id: "opensource", label: "The bug that looked like success" },
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

function Section({
  id,
  title,
  children,
  beat,
  scrim,
  ...tone
}: {
  id: string;
  title: string;
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
    <section id={id} data-beat={beat ?? id} className={styles.section} {...tone}>
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
  row,
}: {
  section: Section;
  past?: boolean;
  /** Which grid row this role occupies. */
  row: number;
}) {
  // The first paragraph is the role in one breath and stays visible; the
  // rest opens on demand.
  const [lead, ...more] = s.body.split(/\n\s*\n/);
  const body = more.length > 0 ? <Prose body={more.join("\n\n")} className={styles.roleBody} claimHref={s.claim} /> : null;

  return (
    <article
      id={`role-${row}`}
      className={styles.roleContent}
      data-role-content
      data-past={past || undefined}
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
        {/* Identity figure on the left, proof on the right (stacked on a
            phone, where only the first figure shows). The ask sits outside
            the fold so a phone reader can put the role to the agent at once. */}
        <div className={styles.rolePair}>
          <div
            className={styles.roleFigures}
            style={{ "--figure-tint": ROLE_TINT[s.title] } as React.CSSProperties}
          >
            <Metrics items={s.metrics} />
          </div>
          <div className={styles.roleProof}>
            <Prose body={lead} className={`${styles.roleBody} ${styles.roleLead}`} claimHref={s.claim} />
            {/* The stack is the first thing a reader checks against their own,
                so it stays out of the fold, marks first. */}
            {s.stack.length > 0 && (
              <ul className={styles.stack}>
                {s.stack.map((t) => (
                  <li key={t}>
                    <BrandMark name={t} />
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {s.asks.length > 0 && <AskSeeds items={s.asks} />}
            {/* Folded on both views so each role reads as title, figure,
                one paragraph and its stack first. */}
            {body && (
              <details className="more" data-phone-fold>
                <summary aria-label={`What he built as ${s.roleParts.title}`}>
                  <span className="more-open">What he built</span>
                  <span className="more-close">Show less</span>
                </summary>
                {body}
              </details>
            )}
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
    unit: "hours to merge",
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
  const agentProps = {
    email: profile.email,
    linkedin: profile.linkedin,
    site: profile.site.replace("https://", ""),
    openable: [...TARGETS.entries()].map(([key, value]) => ({
      key,
      label: value.label,
      url: value.url,
      about: value.about,
    })),
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
    { section: questrom, past: false },
    { section: backend, past: false },
    { section: img, past: true },
    { section: growaza, past: true },
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
  const life = flat(section("BU Life AI").body);
  const edu = flat(section("Education").body);
  const after = (needle: string) => (edu.includes(needle) ? edu.slice(edu.indexOf(needle)) : "");
  const courses = edu.match(/Coursework: (.+?)\./)?.[1].split(", ") ?? [];
  const habit = flat(section("Who he is").body).split(/(?<=\.) /).find((s) => s.includes("working habit"));
  const start = startOf(section("Availability").body);
  const filed = os.artifacts.find((a) => a.state === "closed" && a.url.includes("deepagents"));

  return (
    <>
      <FilmBoot />
      <Palette email={profile.email} github={profile.github} repo={profile.repo} asks={asks} />
      {/* Reaching him from wherever the reader is, with the draft written for
          the section they are actually in. Six of the seven openers in
          lib/reach.ts have never been reachable, because the contact block is
          the only caller and it takes the default. */}
      <ReachDock
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
      <SectionRail items={CHAPTERS} />
      {/* Scroll progress. Purely decorative, so it is hidden from assistive tech
          and disappears entirely under reduced-motion. */}
      <div className={styles.progress} aria-hidden="true" />
      <Hero
        name={profile.name}
        tagline={profile.tagline}
        location={profile.location}
        current={profile.current}
        skills={section("Skills").stack}
        evidence={evidence}
        proof={[
          { m: section("Open source, LangChain deepagents").metrics[0], label: "to a merged fix", href: "#opensource" },
          { m: section("Publications").metrics[0], label: "paper accuracy", href: "#research" },
          { m: section("BU Life AI").metrics[0], label: "redundant LLM calls", href: "#running" },
        ]
          .filter((p) => p.m)
          .map((p) => ({ value: p.m.value, label: p.label, href: p.href }))}
        available={profile.available}
        credentials={certs
          .filter((c) => c.pinned && c.url)
          .map((c) => ({ label: `${c.name}, ${c.issuer}`, url: c.url as string, image: c.image }))}
        contactHref="#contact"
      >
        <Agent {...agentProps} loop={false} />
      </Hero>

      <main id="main">
        <FilmLine which="hook" />
        <FilmTransit id="T1" />

        <Section id="work" title="Work" data-layout="banner" data-register="chapter">
          <WorkStack />
          {/* Rail and content are two columns of one grid, not three
              self-contained role cards, so every role's identity can share
              one tall containing block and stack rather than take turns --
              see .roleRail in page.module.css. */}
          <div
            className={styles.roles}
            style={{ "--role-count": roles.length } as React.CSSProperties}
          >
            {/* No rail. Each rack's own header strip sticks, so the identity of
                the role a reader is inside stays on screen without a second
                column existing to hold a copy of it. */}
            {roles.map(({ section: s, past }, i) => (
              <RoleContent key={s.title} section={s} past={past} row={i + 1} />
            ))}
          </div>
          {/* The four racks on one axis, after them: which roles overlap, which
              followed which. Each bar returns to its rack. */}
          <Timeline
            label="His roles over time"
            items={roles.map(({ section: s }, i) => ({
              label: s.roleParts.title,
              sub: s.title.replace(/, backend$/, ""),
              when: s.roleParts.dates,
              href: `#role-${i + 1}`,
              tint: ROLE_TINT[s.title],
            }))}
          />
        </Section>

        <FilmTransit id="T2" />

        <Section
          id="opensource"
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
          <div className={styles.roleFigures} style={{ "--figure-tint": "var(--brand-langchain)" } as React.CSSProperties}>
            <Metrics items={os.metrics} />
          </div>
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
            <Artifacts items={os.artifacts} chain />
            <AskSeeds items={section("Open source, LangChain deepagents").asks} />
          </details>
        </Section>

        <FilmTransit id="T3" />

        {/* The deployed project, in its own section so the film can hold the
            memory beat behind it. Same panel, same probe, same corpus. */}
        <Section id="running" beat="research" title="Also running" data-register="instrument">
          <Panel
            className={styles.alsoBuilt}
            hue="var(--brand-nvidia)"
            kind="instrument"
            surface="console"
            heading={3}
            label={section("BU Life AI").title}
            state="running"
            status="reachability"
          >
            <div
              className={styles.roleFigures}
              style={{ "--figure-tint": "var(--brand-nvidia)" } as React.CSSProperties}
            >
              <Metrics items={section("BU Life AI").metrics} />
            </div>
            {/* What the three agents are and how a question reaches one, drawn
                from the sentence that says so, then whether it is up right now. */}
            <Topology
              root={life.match(/a (\w+ supervisor)/)?.[1] ?? "Supervisor"}
              rootNote="classifies intent and routes"
              leaves={life.match(/agents for (\w+), (\w+) and (\w+)/)?.slice(1) ?? []}
              leafNote="ReAct agents, each on its own thread"
              store={/pgvector/.test(life) && /BM25/.test(life) ? "pgvector, fused with BM25" : undefined}
            />
            <LiveStatus url="https://bulife-ai.netlify.app/" label="bulife-ai.netlify.app" />
            <details className="more">
              <summary>
                <span className="more-open">Stack and how it works</span>
                <span className="more-close">Show less</span>
              </summary>
              <Prose body={section("BU Life AI").body} topic="BU Life AI" claimHref={section("BU Life AI").claim} />
              <ul className={styles.stack}>
                {section("BU Life AI").stack.map((t) => (
                  <li key={t}>
                    <BrandMark name={t} />
                    {t}
                  </li>
                ))}
              </ul>
            </details>
          </Panel>
        </Section>

        <FilmTransit id="T4" />

        {/* Research took this section from BU Life AI.
            The paper is first-author work with measured numbers and a DOI, and
            it sat in a one-third column under Credentials while a side project
            held a top-level heading. It also completes the thread section 01
            opens: the paper argues context is needed to catch bugs static
            analysis misses, and the LangChain defect was exactly that shape. */}
        <Section id="research" beat="approach" title="Research" data-register="instrument">
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
            <div className={styles.beside}>
              <Prose body={section("Publications").body} topic="publications" claimHref={section("Publications").claim} phoneOpen={1} />
              <div className={styles.figures}>
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
            {/* Both papers as rows a reader can open, rather than as two links
                inside a paragraph. The DOI resolves; the link checker proves it. */}
            <details className="more" data-phone-fold>
              <summary>
                <span className="more-open">Both papers</span>
                <span className="more-close">Show less</span>
              </summary>
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
        <Section id="approach" beat="running" data-phone="hide" title="How he works" data-layout="rule" data-register="instrument">
          <div className={styles.beside}>
            <div>
              <Prose body={section("Who he is").body} topic="who he is" claimHref={section("Who he is").claim} />
              <Prose body={section("What he is good at").body} topic="what he is good at" claimHref={section("What he is good at").claim} />
              {/* Condensed mode keeps only the first paragraph of a prose block,
                  which took two thirds of the scope limits with it. This is the one
                  section whose whole value is that it narrows the claim. */}
              <div data-keep="all">
                <Prose body={section("What he does not do").body} />
              </div>
            </div>
            {/* The section's thesis, set as display type in the column the
                measure leaves empty. A copy of a sentence already in the prose,
                so it is hidden from assistive technology. */}
            {habit && (
              <blockquote className={styles.pull} aria-hidden="true">
                <p>{habit}</p>
              </blockquote>
            )}
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
        <Section id="measured" beat="proof" data-phone="hide" title="How this is measured" data-layout="bank" data-register="instrument" data-sweep="on">
          <Measured />
          {/*
           * Order is the layout here. This grid auto-places into two columns in
           * DOM order, so each row is as tall as its taller cell and the shorter
           * cell leaves the rest of its column empty. In the previous order a
           * 126px chart sat beside a 672px panel and a 788px panel sat beside a
           * 77px summary: 1,304px of empty column inside one section, which is
           * most of why this was the tallest section on the page at 3,181px.
           *
           * The two tall panels are paired, then the two short blocks are
           * paired. It also reads better: the panels are the section's argument
           * and the chart and the defect list are its footnotes.
           */}
          {/* The published results sit behind one fold: the headline above is
              the claim, these are the evidence for it. */}
          <p className={styles.latency}>
              Median answer {(evals.p50 / 1000).toFixed(1)} s, 95th percentile {(evals.p95 / 1000).toFixed(1)} s, from the {evals.measured} eval run.
            </p>
          <details className="more">
            <summary>
              <span className="more-open">See the evidence: eval cases, model comparison, page vitals, defects</span>
              <span className="more-close">Show less</span>
            </summary>
            {/* The suite as sixteen objects rather than one ratio. Six of them are
                attempts to break the agent, which the score cannot say. */}
            <EvalMatrix />
            {/* Which model answers, and the measurement that says the choice was
                not a guess. Beside the eval matrix because both are published
                results from a build-time run rather than something happening now. */}
            <ModelChoice />
            <Vitals />
            <Defects />
          </details>
        </Section>

        <FilmTransit id="T8" />

        <Section id="education" title="Education" data-tone="sunk" data-layout="rule" data-register="instrument">
          {/* Two panels: the degrees, then what came before them. Stacked: side
              by side inside the reading column each panel was too narrow for
              its figures. */}
          <div className={styles.panelStack}>
            <Panel className={styles.alsoBuilt} hue="var(--brand-bu)" kind="instrument" surface="console" heading={3} label="Degrees" state="running" status="M.S. in progress">
              <div className={styles.eduFigures}>
                <Metrics items={section("Education").metrics} />
              </div>
              <div className={styles.beside}>
                <Prose body={section("Education").body} topic="education" phoneOpen={1} />
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
            </Panel>
            <Panel className={styles.alsoBuilt} hue="var(--brand-bu)" kind="instrument" surface="console" heading={3} label="Before this" state="done" status="2020 to 2024">
              <div className={styles.eduFigures}>
                <Metrics
                  items={section("Achievements").metrics}
                  seal={section("Proof wall").badges.filter((b) => /top \d+%/i.test(b.label)).map((b) => seal(b.label))[0]}
                />
              </div>
              <Prose body={section("Achievements").body} topic="achievements" phoneOpen={1} />
            </Panel>
          </div>
        </Section>

        <FilmTransit id="T9" />

        <Section
          id="contact"
         
          title="Get in touch"
          data-weight="closing"
          data-layout="banner"
          data-register="chapter"
          data-sweep="on"
        >
          <Prose body={section("Availability").body} />
          {/* Every path from "decided to write" to "message sent", with the
              draft already composed. The bare mailto that was here opened an
              empty window at the exact moment the reader had chosen to act. */}
          <div className={styles.beside}>
            <Reach
              email={profile.email}
              phone={profile.phone}
              linkedin={profile.linkedin}
              github={profile.github}
              repo={profile.repo}
              site={profile.site.replace("https://", "")}
              resumeHref="/kushal-gaddamwar-resume.pdf"
              forward={{
                name: profile.name,
                current: profile.current,
                proof: profile.proof,
                site: profile.site,
                evals,
              }}
            />
            {/* The two things a reader checks before writing: when he can start,
                and the one page they will forward. The preview opens at the
                summary; the full file is one press away. */}
            <aside className={styles.resume} aria-label="Start date and résumé">
              {start && (
                <p className={styles.start}>
                  <span className={styles.startLabel}>Full-time from</span>
                  <span className={styles.startDate}>{start.label}</span>
                  <Countdown until={start.iso} className={styles.startCount} />
                </p>
              )}
              <a className={styles.sheet} href="/kushal-gaddamwar-resume.pdf" target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a static preview of a static file */}
                <img src="/resume-preview.webp" alt="The summary and experience on his résumé" width={560} height={411} loading="lazy" />
                <span className={styles.sheetCap}>
                  Open the résumé
                  <span className={styles.sheetMeta}>PDF, one page</span>
                </span>
              </a>
            </aside>
          </div>
          {/* The record, last: what he can prove, as badges, each one a link. */}
          <ProofWall certs={certs} badges={section("Proof wall").badges} />
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
          <a className={styles.top} href="#top">
            Back to top
          </a>
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
