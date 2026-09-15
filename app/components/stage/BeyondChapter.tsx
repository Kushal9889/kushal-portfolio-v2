"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import { litPoints } from "@/lib/numbers";
import { condense, print, settle, stamp } from "@/lib/verbs";
import { useStage } from "./StageContext";
import styles from "./BeyondChapter.module.css";

type Props = {
  education: { school: string; degree: string; dates: string; place: string; coursework: string[]; hue: string | null }[];
  jee: { exam: string; percentile: string; millions: string; top: string } | null;
  codechef: { rank: string; when: string; also: string } | null;
  community: { name: string; members: number; where: string; outcomes: string[] } | null;
  fest: { role: string; event: string; colleges: number; students: number; raised: string; sponsors: number } | null;
  checkedOn: string;
  hues: { codechef: string };
};

const COLS = 40;
/** Server and browser trig can differ in the last digit; coordinates are rounded so hydration matches. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const STEP = 12;

/** Deterministic layout for the community constellation: a sunflower spiral, each node tied to its nearest earlier node. */
function constellation(count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const nodes = Array.from({ length: count }, (_, i) => {
    const r = 7 * Math.sqrt(i + 0.5);
    return { x: r2(160 + Math.cos(i * golden) * r), y: r2(120 + Math.sin(i * golden) * r * 0.82) };
  });
  const edges = nodes.slice(1).map((n, i) => {
    let best = 0;
    let d = Infinity;
    for (let j = 0; j <= i; j++) {
      const dd = Math.hypot(nodes[j].x - n.x, nodes[j].y - n.y);
      if (dd < d) {
        d = dd;
        best = j;
      }
    }
    return [nodes[best], n] as const;
  });
  return { nodes, edges };
}

/**
 * Beyond ("Beyond the résumé lines"): schooling, ranking, community and
 * leadership, each drawn as the true shape of its figure with no box around it.
 * Every shape is SVG built from the corpus values and carries a text equivalent
 * naming the figure and where it is from. Data art rounds down (plan G.2 R5): of
 * 1,200 points, the top 0.9 percent is 10 full points and an eleventh at 80%.
 */
export default function BeyondChapter({ education, jee, codechef, community, fest, checkedOn, hues }: Props) {
  const { retrieveInto } = useStage();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const machineRef = useRef<HTMLParagraphElement>(null);

  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const title = titleRef.current;
    const machine = machineRef.current;
    let played = false;
    ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      onEnter: () => {
        if (played || !title) return;
        played = true;
        retrieveInto(title, "beyond");
        condense(gsap, title).restart();
        if (machine) print(gsap, machine, { unit: "char" }).restart();
      },
    });
    for (const block of Array.from(section.querySelectorAll<HTMLElement>("[data-record]"))) {
      let done = false;
      ScrollTrigger.create({
        trigger: block,
        start: "top 75%",
        onEnter: () => {
          if (done) return;
          done = true;
          const art = block.querySelector<SVGElement>("[data-art]");
          if (art) gsap.fromTo(art, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "power3.out" });
          block.querySelectorAll<HTMLElement>("[data-settle]").forEach((f) => settle(gsap, f, f.dataset.settle ?? "").restart());
          block.querySelectorAll<HTMLElement>("[data-lines]").forEach((l) => print(gsap, l, { unit: "line" }).restart());
          block.querySelectorAll<SVGElement>("[data-lit]").forEach((p, i) =>
            gsap.delayedCall(0.5 + i * 0.05, () => stamp(gsap, p as unknown as HTMLElement, { scale: 0.4, corners: false }).restart()),
          );
        },
      });
    }
  });

  const points = jee ? Math.round(Number.parseFloat(jee.millions) * 1000) : 0;
  const lit = jee ? litPoints(Number.parseFloat(jee.top) / 100, points) : { full: 0, partial: 0 };
  const rows = Math.ceil(points / COLS);
  const net = community ? constellation(community.members) : null;
  const source = `on the résumé, checked ${checkedOn}`;

  return (
    <section ref={ref} id="beyond" className={styles.beyond} data-chapter="Beyond" data-node="retrieve" data-ground="void">
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 ref={titleRef} className={styles.title}>
            Beyond the résumé lines
          </h2>
          <p ref={machineRef} className={styles.machine} aria-hidden="true">
            retrieve: <span>education, achievements</span>
          </p>
        </header>

        {education.length > 0 && (
          <div className={styles.record} data-record>
            <h3 className={styles.recordTitle}>Education</h3>
            <ol className={styles.degrees} data-lines>
              {education.map((d) => (
                <li key={d.school} style={{ "--identity": d.hue ?? "var(--hair)" } as React.CSSProperties}>
                  <p className={styles.degree}>{d.degree}</p>
                  <p className={styles.school}>{d.school}</p>
                  <p className={styles.when}>
                    {d.dates}, {d.place}
                  </p>
                  {d.coursework.length > 0 && (
                    <ul className={styles.chips} aria-label="Coursework">
                      {d.coursework.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            <p className={styles.source}>{source}</p>
          </div>
        )}

        {jee && (
          <div className={styles.record} data-record data-side="art-right">
            <div className={styles.copy}>
              <h3 className={styles.recordTitle}>{jee.exam}</h3>
              <p className={styles.figure}>
                <span data-settle={jee.percentile}>{jee.percentile}</span>
                <span className={styles.unit}>percentile</span>
              </p>
              <p className={styles.caption}>top {jee.top} percent nationally</p>
              <p className={styles.legend}>
                1 point = 1,000 of {jee.millions} million candidates
              </p>
              <p className={styles.source}>{source}</p>
            </div>
            <p className={styles.band}>his percentile band, the lit points at the top left</p>
            <svg
              data-art
              className={styles.grid}
              viewBox={`0 0 ${COLS * STEP} ${rows * STEP}`}
              role="img"
              aria-label={`${points.toLocaleString("en-US")} points, one per thousand candidates. The top ${jee.top} percent is ${lit.full} full points and one at ${Math.round(lit.partial * 100)} percent. Source: ${source}.`}
            >
              {Array.from({ length: points }, (_, i) => {
                const full = i < lit.full;
                const partial = i === lit.full && lit.partial > 0;
                return (
                  <rect
                    key={i}
                    x={(i % COLS) * STEP + 3}
                    y={Math.floor(i / COLS) * STEP + 3}
                    width="6"
                    height="6"
                    className={full || partial ? styles.lit : styles.point}
                    style={partial ? { opacity: lit.partial } : undefined}
                    data-lit={full || undefined}
                  />
                );
              })}
              <rect
                x="0.5"
                y="0.5"
                width={(lit.full + (lit.partial > 0 ? 1 : 0)) * STEP - 1}
                height={STEP - 1}
                className={styles.ring}
              />
            </svg>
          </div>
        )}

        {codechef && (
          <div className={styles.record} data-record data-side="art-left" style={{ "--identity": hues.codechef } as React.CSSProperties}>
            <svg data-art className={styles.ladder} viewBox="0 0 120 320" role="img" aria-label={`Global rank ${codechef.rank}, ${codechef.when}. Unlabelled ticks, no other ranks shown. Source: ${source}.`}>
              <line x1="60" y1="8" x2="60" y2="312" className={styles.rail} />
              {Array.from({ length: 39 }, (_, i) => (
                <line key={i} x1={i % 5 === 0 ? 46 : 52} y1={8 + i * 8} x2="60" y2={8 + i * 8} className={styles.tick} />
              ))}
              <line x1="38" y1="72" x2="82" y2="72" className={styles.rung} />
              <rect x="80" y="68" width="8" height="8" className={styles.lit} />
            </svg>
            <div className={styles.copy}>
              <h3 className={styles.recordTitle}>CodeChef</h3>
              <p className={styles.figure}>
                <span data-settle={codechef.rank}>{codechef.rank}</span>
                <span className={styles.unit}>global rank</span>
              </p>
              <p className={styles.caption}>{codechef.when}</p>
              <p className={styles.also}>{codechef.also}</p>
              <p className={styles.source}>{source}</p>
            </div>
          </div>
        )}

        {community && net && (
          <div className={styles.record} data-record data-side="art-right">
            <div className={styles.copy}>
              <h3 className={styles.recordTitle}>{community.name}</h3>
              <p className={styles.figure}>
                <span data-settle={String(community.members)}>{community.members}</span>
                <span className={styles.plus} aria-label="plus" />
                <span className={styles.unit}>members</span>
              </p>
              <p className={styles.caption}>co-founded, {community.where}</p>
              <p className={styles.source}>{source}</p>
            </div>
            <svg
              data-art
              className={styles.net}
              viewBox="0 0 400 240"
              role="img"
              aria-label={`${community.members} member nodes and an open ring for more. Mentees reached ${community.outcomes.join(", ")}. Source: ${source}.`}
            >
              {net.edges.map(([a, b], i) => (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.link} />
              ))}
              {net.nodes.map((n, i) => (
                <circle key={i} cx={n.x} cy={n.y} r="2.2" className={styles.dot} />
              ))}
              <circle cx={net.nodes[net.nodes.length - 1].x + 12} cy={net.nodes[net.nodes.length - 1].y} r="4" className={styles.open} />
              {community.outcomes.map((o, i) => {
                const y = 60 + i * 60;
                return (
                  <g key={o}>
                    <path d={`M${230} 120 C 270 120 270 ${y} 300 ${y}`} className={styles.link} />
                    <circle cx="300" cy={y} r="3.5" className={styles.dot} />
                    <text x="310" y={y + 4} className={styles.label}>
                      {o}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {fest && (
          <div className={styles.record} data-record data-side="art-left">
            <svg
              data-art
              className={styles.hub}
              viewBox="0 0 320 320"
              role="img"
              aria-label={`${fest.colleges} colleges around one hub, ${fest.students} students along the spokes, $${fest.raised} raised from more than ${fest.sponsors} sponsors. Source: ${source}.`}
            >
              {Array.from({ length: fest.colleges }, (_, i) => {
                const a = (i / fest.colleges) * Math.PI * 2 - Math.PI / 2;
                const x = r2(160 + Math.cos(a) * 130);
                const y = r2(160 + Math.sin(a) * 130);
                const per = Math.floor(fest.students / fest.colleges) + (i < fest.students % fest.colleges ? 1 : 0);
                return (
                  <g key={i}>
                    <line x1="160" y1="160" x2={x} y2={y} className={styles.link} />
                    {Array.from({ length: per }, (_, k) => {
                      const t = 0.14 + (k / per) * 0.76;
                      return <circle key={k} cx={r2(160 + Math.cos(a) * 130 * t)} cy={r2(160 + Math.sin(a) * 130 * t)} r="1" className={styles.student} />;
                    })}
                    <circle cx={x} cy={y} r="6" className={styles.college} />
                  </g>
                );
              })}
              <circle cx="160" cy="160" r="9" className={styles.lit} />
            </svg>
            <div className={styles.copy}>
              <h3 className={styles.recordTitle}>
                {fest.role}, {fest.event}
              </h3>
              <p className={styles.figure}>
                <span data-settle={`$${fest.raised}`}>${fest.raised}</span>
                <span className={styles.unit}>raised</span>
              </p>
              <p className={styles.bar} aria-hidden="true">
                <span />
              </p>
              <p className={styles.caption}>
                from more than {fest.sponsors} sponsors, across {fest.colleges} colleges and {fest.students}-plus students
              </p>
              <p className={styles.source}>{source}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
