"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import Stage from "@/app/components/stage/Stage";
import HeroStage from "@/app/components/stage/HeroStage";
import { useStage } from "@/app/components/stage/StageContext";
import { collide, impact, IMPACT_HIT } from "@/app/components/stage/impact";
import { markFrameReady, parseFrame, scrollInstant } from "@/app/components/stage/frame";
import styles from "./lab.module.css";

type Openable = { key: string; label: string; url: string; about: string };

type Bug = { figure: string; unit: string; sentence: string; href: string; label: string };
type Evals = {
  cases: number;
  passed: number;
  runs: number;
  totalRuns: number;
  totalPasses: number;
  precision1: number;
  scored: number;
  mrr: number;
  p95: number;
  groups: { name: string; cases: number; passed: number }[];
  detail: { name: string; pass: boolean }[];
};
type Model = { chosen: string; chosenOn: string; observations: number };

export type LabProps = {
  name: string;
  agent: { email: string; linkedin: string; site: string; openable: Openable[] };
  hero: { headline: string; qualifier: string; current: string; available: string };
  bug: Bug;
  evals: Evals;
  model: Model;
};

export default function Lab({ name, agent, hero, bug, evals, model }: LabProps) {
  return (
    <Stage name={name} agent={agent}>
      <HeroStage {...hero} />
      <ImpactChapter bug={bug} />
      <BentoChapter evals={evals} model={model} />
      <section id="contact" className={styles.end} data-chapter="End" data-ground="void">
        <p>End of lab</p>
      </section>
    </Stage>
  );
}

function centre(el: HTMLElement) {
  return el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2 - window.innerHeight / 2;
}

/** The figure arrives from depth and hits the glass once it is in full view. */
function ImpactChapter({ bug }: { bug: Bug }) {
  const { flash } = useStage();
  const innerRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLAnchorElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger }) => {
    const inner = innerRef.current;
    const figure = figureRef.current;
    const text = textRef.current;
    if (!inner || !figure || !text) return;

    const hit = impact(gsap, figure, { shake: inner, flash: flash.current });
    hit.from(text.children, { y: 24, opacity: 0, stagger: 0.08, duration: 0.5, ease: "power3.out" }, IMPACT_HIT);
    const trigger = ScrollTrigger.create({
      trigger: inner,
      start: "top 45%",
      onEnter: () => hit.restart(),
      onLeaveBack: () => hit.pause(0),
    });

    const frame = parseFrame();
    if (frame?.chapter === "impact") {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(Math.max(trigger.start + 2, centre(inner)));
        ScrollTrigger.update();
        hit.pause().progress(frame.p);
        markFrameReady();
      });
    }
  });

  return (
    <section ref={ref} id="bug" className={styles.bug} data-chapter="The bug" data-ground="sheet">
      <div ref={innerRef} className={styles.bugInner}>
        <p className={styles.figureWrap}>
          <a ref={figureRef} className={styles.figure} href={bug.href} aria-label={`${bug.figure} ${bug.unit}`}>
            {bug.figure}
          </a>
        </p>
        <div ref={textRef}>
          <p className={styles.unit}>{bug.unit}</p>
          <p className={styles.sentence}>{bug.sentence}</p>
          <p className={styles.pr}>
            <a href={bug.href}>{bug.label}</a>
          </p>
        </div>
      </div>
    </section>
  );
}

/** Cards dock one after another and shove their neighbours. */
function BentoChapter({ evals, model }: { evals: Evals; model: Model }) {
  const gridRef = useRef<HTMLDivElement>(null);

  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger }) => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    const dock = gsap.timeline({ paused: true });
    cards.forEach((card, i) => {
      dock.add(impact(gsap, card, { strength: 0.6, paused: false }), i * 0.16);
      dock.call(() => collide(gsap, card, cards, 0.8), [], i * 0.16 + IMPACT_HIT);
    });
    const trigger = ScrollTrigger.create({
      trigger: grid,
      start: "top 72%",
      onEnter: () => dock.restart(),
      onLeaveBack: () => dock.pause(0),
    });

    const frame = parseFrame();
    if (frame?.chapter === "bento") {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(Math.max(trigger.start + 2, centre(grid)));
        ScrollTrigger.update();
        dock.pause().progress(frame.p);
        markFrameReady();
      });
    }
  });

  const p1 = Math.round(evals.precision1 * 100);

  return (
    <section ref={ref} id="measured" className={styles.bento} data-chapter="Measured" data-ground="void">
      <div ref={gridRef} className={styles.grid}>
        <article className={`${styles.card} ${styles.cardA}`}>
          <p className={styles.cardLabel}>Eval suite</p>
          <p className={styles.big}>
            {evals.totalPasses}
            <span>/{evals.totalRuns}</span>
          </p>
          <p className={styles.cardNote}>
            assertion runs passed, {evals.cases} cases × {evals.runs} runs
          </p>
          <ul className={styles.groups}>
            {evals.groups.map((g) => (
              <li key={g.name}>
                <span>{g.name}</span>
                <span
                  className={styles.bar}
                  data-full={g.passed === g.cases}
                  style={{ "--w": g.passed / g.cases } as React.CSSProperties}
                />
                <span>
                  {g.passed}/{g.cases}
                </span>
              </li>
            ))}
          </ul>
        </article>
        <article className={`${styles.card} ${styles.cardB}`}>
          <p className={styles.cardLabel}>Retrieval</p>
          <p className={styles.mid}>{p1}%</p>
          <p className={styles.cardNote}>
            precision at 1 on {evals.scored} scored questions, MRR {evals.mrr}
          </p>
        </article>
        <article className={`${styles.card} ${styles.cardC}`}>
          <p className={styles.cardLabel}>p95 latency</p>
          <p className={styles.mid}>{evals.p95.toLocaleString("en-US")}</p>
          <p className={styles.cardNote}>milliseconds</p>
        </article>
        <article className={`${styles.card} ${styles.cardD}`}>
          <p className={styles.cardLabel}>Model</p>
          <p className={styles.model}>{model.chosen.split("/").pop()}</p>
          <p className={styles.cardNote}>chosen on {model.chosenOn}</p>
        </article>
        <article className={`${styles.card} ${styles.cardE}`}>
          <p className={styles.cardLabel}>
            {evals.passed} of {evals.cases} cases pass on every run
          </p>
          <div className={styles.ticks}>
            {evals.detail.map((c) => (
              <span key={c.name} className={styles.tick} data-pass={c.pass} title={c.name} />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
