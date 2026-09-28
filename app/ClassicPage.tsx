// The classic document's full system. The root layout ships only the shared
// base, so this page brings the rest with it.
import "./globals.css";
import Hero from "./components/Hero";
import Prose from "./components/Prose";
import Certifications from "./components/Certifications";
import DiffReveal from "./components/DiffReveal";
import Agent from "./components/Agent";
import Palette from "./components/Palette";
import LiveStatus from "./components/LiveStatus";
import Metrics from "./components/Metrics";
import Artifacts from "./components/Artifacts";
import Measured from "./components/Measured";
import Telemetry from "./components/Telemetry";
import Reach from "./components/Reach";
import ReachDock from "./components/ReachDock";
import SectionLink from "./components/SectionLink";
import PageMotion from "./components/PageMotion";
import AskSeeds from "./components/AskSeeds";
import Topology from "./components/Topology";
import OverlapGraph from "./components/OverlapGraph";
import ModelChoice from "./components/ModelChoice";
import Defects from "./components/Defects";
import WorkStack from "./components/WorkStack";
import BrandMark from "./components/BrandMark";
import SectionRail from "./components/SectionRail";
import Ticker from "./components/Ticker";
import EvalMatrix from "./components/EvalMatrix";
import Panel from "./components/Panel";
import Artifacts2 from "./components/Artifacts";
import evals from "@/content/evals.json";
import { loadContent, section, loadCertifications, type Section } from "@/lib/content";
import { TARGETS } from "@/lib/agent/tools";
import styles from "./page.module.css";
import FilmTransit from "./components/film/FilmTransit";
import FilmMount from "./components/film/FilmMount";

function Section({
  id,
  title,
  children,
  ...tone
}: {
  id: string;
  title: string;
  children: React.ReactNode;
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
}) {
  return (
    <section id={id} className={styles.section} {...tone}>
      {/* Two columns above 62rem: the heading holds a rail on the left and
          everything else runs beside it. Stacked, seven section headings cost
          most of a screen on their own and the page used half its width. The
          children stay direct descendants of the wrap so the scroll batching
          still sees them individually. */}
      <div className={`wrap ${styles.grid}`}>
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
  const body = <Prose body={s.body} className={styles.roleBody} />;

  return (
    <article
      className={styles.roleContent}
      data-role-content
      data-past={past || undefined}
      style={{ "--row": row } as React.CSSProperties}
    >
      <Panel
        kind="rack"
        surface="paper"
        heading={3}
        label={
          <>
            {s.roleParts.title}
            <span className={styles.company}>{s.title}</span>
          </>
        }
        state={past ? "done" : "running"}
        status={`${s.roleParts.dates}${s.roleParts.location ? ` \u00b7 ${s.roleParts.location}` : ""}`}
      >
        <Metrics items={s.metrics} />
        {s.asks.length > 0 && <AskSeeds items={s.asks} />}
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
        {past ? (
          <details className="more">
            <summary>
              <span className="more-open">Read what he built</span>
              <span className="more-close">Show less</span>
            </summary>
            {body}
          </details>
        ) : (
          body
        )}
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
  const featured = certs.find((c) => c.featured);

  /*
   * The strip that runs along the turn.
   *
   * Assembled from the same corpus objects every section renders rather than
   * written out here, so a figure on the strip cannot say something the section
   * it came from does not. Only the ones whose value leads with a number: a
   * readout is a row of readings, and "BM25 + vector" is a description.
   */
  const tickerItems = loadContent()
    .sections.flatMap((s) => s.metrics)
    .filter((m) => /^[+-]?\d/.test(m.value));

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
  const img = section("IMG Systems");
  const growaza = section("Growaza");
  // Newest first. `past` is the de-emphasis flag the rail and the content
  // column both read, so the order and the weighting live in one place.
  const roles = [
    { section: questrom, past: false },
    { section: img, past: true },
    { section: growaza, past: true },
  ];

  return (
    <>
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
      <FilmMount />
      {/* Navigation the page did not have. The labels are the section headings
          verbatim, not a second set of names for the same things: two vocabularies
          for one page is how a reader ends up unsure whether "Proof" and "What
          else checks out" are the same section. */}
      <SectionRail
        items={[
          { id: "work", label: "Work" },
          { id: "opensource", label: "A bug in LangChain" },
          { id: "research", label: "Research" },
          { id: "approach", label: "How he works" },
          { id: "measured", label: "How this is measured" },
          { id: "running", label: "Also running" },
          { id: "proof", label: "What else checks out" },
          { id: "education", label: "Education" },
          { id: "contact", label: "Get in touch" },
        ]}
      />
      {/* Scroll progress. Purely decorative, so it is hidden from assistive tech
          and disappears entirely under reduced-motion. */}
      <div className={styles.progress} aria-hidden="true" />
      <Hero
        name={profile.name}
        tagline={profile.tagline}
        location={profile.location}
        current={profile.current}
        evidence={evidence}
        available={profile.available}
        credential={{
          label: featured ? `${featured.issuer} Certified · ${featured.short ?? featured.name}` : "",
          url: featured?.url ?? "#",
        }}
        contactHref="#contact"
      >
        <Agent {...agentProps} />
      </Hero>

      <main id="main">
        <FilmTransit id="T1" />

        <Section id="work" title="Work" data-layout="banner" data-register="chapter">
          {/* The measured values, running along the turn. Handed the same parsed
              metrics the sections below render, so nothing here is a second copy
              of a figure that could drift from the corpus. */}
          <Ticker items={tickerItems} />
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
        </Section>

        <FilmTransit id="T2" />

        <Section
          id="opensource"
          title="A bug in LangChain"
          data-lead="artifact"
          data-layout="banner"
          data-register="chapter"
        >
          {/* The duration and the pull request come from the corpus, not from
              inside the component: the same three values are rendered by the
              metrics strip and the artifact rows on this very section. */}
          <DiffReveal
            hours={os.metrics.find((m) => /hour/i.test(m.value))?.value ?? ""}
            prUrl={merged?.url ?? ""}
            prLabel={merged?.label.replace(/^.*#/, "PR #") ?? ""}
          />
          <Metrics items={os.metrics} />
          <Prose body={section("Open source, LangChain deepagents").body} />
          <Artifacts items={os.artifacts} chain />
          <AskSeeds items={section("Open source, LangChain deepagents").asks} />
        </Section>

        <FilmTransit id="T3" />

        {/* Research took this section from BU Life AI.
            The paper is first-author work with measured numbers and a DOI, and
            it sat in a one-third column under Credentials while a side project
            held a top-level heading. It also completes the thread section 01
            opens: the paper argues context is needed to catch bugs static
            analysis misses, and the LangChain defect was exactly that shape. */}
        <Section id="research" title="Research" data-register="instrument">
          <Metrics items={section("Publications").metrics} />
          <Prose body={section("Publications").body} />
          {/* Both papers as rows a reader can open, rather than as two links
              inside a paragraph. The DOI resolves; the link checker proves it. */}
          <Artifacts2 items={section("Publications").artifacts} />
        </Section>


        <FilmTransit id="T4" />

        {/* What he is and what he is not, before the evidence. A reader who has
            just watched the agent answer wants to know who they are talking to;
            the scope limits are here rather than buried because stating them
            early is what makes the rest of the page readable as fact. */}
        <Section id="approach" title="How he works" data-layout="rule" data-register="instrument">
          {/* The four terms the roles below are written in. They were in the
              hero, where they competed with the title and the proof for the
              same seconds and lost. Here they caption the section that explains
              them. */}
          <ul className={styles.focus}>
            {profile.focus.split(/\s*·\s*/).filter(Boolean).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {/* The shape of the thing. The page has claimed conditional routing
              since it was built and the only evidence was a drawing in a
              comment. */}
          <Topology />
          <OverlapGraph />
          <Prose body={section("Who he is").body} />
          <Prose body={section("What he is good at").body} />
          {/* Condensed mode keeps only the first paragraph of a prose block,
              which took two thirds of the scope limits with it. This is the one
              section whose whole value is that it narrows the claim. */}
          <div data-keep="all">
            <Prose body={section("What he does not do").body} />
          </div>
        </Section>

        <FilmTransit id="T5" />

        {/* The strongest signal in 2026 hiring is evidence that the thing was
            measured, not that it was built. It sits second because the bug above
            proves he finds failures and this proves he checks for them. */}
        <Section id="measured" title="How this is measured" data-layout="bank" data-register="instrument">
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
          {/* The suite as sixteen objects rather than one ratio. Six of them are
              attempts to break the agent, which the score cannot say. */}
          <EvalMatrix />
          {/* Which model answers, and the measurement that says the choice was
              not a guess. Beside the eval matrix because both are published
              results from a build-time run rather than something happening now. */}
          <ModelChoice />
          {/* Every request this page has served since it opened, plotted against
              the median from the eval run. It was the last block inside the hero
              console, where it spent 126px of the first screen on a chart that
              is empty until somebody asks something. It is a measurement, and
              this is the section about measurement. */}
          <Telemetry />
          <Defects />
        </Section>

        <FilmTransit id="T6" />

        {/* The deployed project, in its own section so the film can hold the
            memory beat behind it. Same panel, same probe, same corpus. */}
        <Section id="running" title="Also running" data-register="instrument">
          <Panel
            className={styles.alsoBuilt}
            kind="instrument"
            surface="console"
            heading={3}
            label={section("BU Life AI").title}
            state="running"
            status="reachability"
          >
            <LiveStatus url="https://bulife-ai.netlify.app/" label="bulife-ai.netlify.app" />
            {/* Its three metrics and eight-item stack were parsed out of the
                body by the corpus loader and rendered nowhere, so the section
                shipped as prose with the numbers stripped out of it. Demoted is
                not the same as gutted. */}
            <Metrics items={section("BU Life AI").metrics} />
            <Prose body={section("BU Life AI").body} />
            <ul className={styles.stack}>
              {section("BU Life AI").stack.map((t) => (
                <li key={t}>
                  <BrandMark name={t} />
                  {t}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>

        <FilmTransit id="T7" />

        {/* "Credentials" named one of the four things in here. The section also
            holds a deployed project with a live reachability probe, a degree,
            and a competition percentile, none of which is a credential. The id
            stays `proof`: it is the parameter the agent's compose_intro tool
            takes and the key ReachDock maps to a draft. */}
        <Section
          id="proof"
          title="What else checks out"
          data-tone="sunk"
          data-layout="rule"
          data-register="instrument"
        >
          <Certifications certifications={certs} />
        </Section>

        <FilmTransit id="T8" />

        <Section id="education" title="Education" data-tone="sunk" data-layout="rule" data-register="instrument">
          <div className={styles.split}>
            <div>
              <h3 className={styles.subhead}>Education</h3>
              <Prose body={section("Education").body} />
            </div>
            <div>
              <h3 className={styles.subhead}>Before this</h3>
              <Metrics items={section("Achievements").metrics} />
              <Prose body={section("Achievements").body} />
            </div>
          </div>
        </Section>

        <FilmTransit id="T9" />

        <Section
          id="contact"
          title="Get in touch"
          data-weight="closing"
          data-layout="banner"
          data-register="chapter"
        >
          <Prose body={section("Availability").body} />
          {/* Every path from "decided to write" to "message sent", with the
              draft already composed. The bare mailto that was here opened an
              empty window at the exact moment the reader had chosen to act. */}
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
        </Section>
      </main>

      <footer className={styles.footer}>
        {/* The wordmark, oversized and outlined.
            `aria-hidden`, and that is not an oversight: the name is already the
            h1 at the top of this page, and a screen reader meeting it a second
            time at the bottom learns nothing and loses its place. Here it is
            type as a graphic object, so it is drawn for the eye only. */}
        <p className={styles.wordmark} aria-hidden="true">
          {profile.name}
        </p>
        <div className="wrap">
          <Prose body={section("This site").body} className={styles.footerNote} />
          <p className="label">Last verified {profile.lastVerified}</p>
        </div>
      </footer>
    </>
  );
}
