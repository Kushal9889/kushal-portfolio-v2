"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import { condense, print, settle } from "@/lib/verbs";
import Glyph from "./Glyph";
import { useStage } from "./StageContext";
import styles from "./BuiltChapter.module.css";

type Props = {
  site: {
    title: string;
    evals: { passes: number; runs: number; measured: string };
    audit: { passed: number; total: number; blocking: number; ranOn: string; commit: string } | null;
    linksCheckedOn: string;
    links: number;
    defects: number;
    auditUrl: string;
    /** The portfolio repository's own last commit, from the build cache. */
    lastCommit: { at: string; checkedOn: string } | null;
    repo: string;
  };
};
type Status = "checking" | "live" | "build";

export default function BuiltChapter({ site }: Props) {
  const { retrieveInto } = useStage();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const machineRef = useRef<HTMLParagraphElement>(null);
  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const title = titleRef.current;
    const machine = machineRef.current;
    const panes = Array.from(section.querySelectorAll<HTMLElement>("[data-pane]"));
    const figures = Array.from(section.querySelectorAll<HTMLElement>("[data-settle]"));
    let played = false;
    ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      onEnter: () => {
        if (played) return;
        played = true;
        if (title) {
          retrieveInto(title, "built");
          condense(gsap, title).restart();
        }
        if (machine) print(gsap, machine, { unit: "char" }).restart();
        panes.forEach((pane, i) => {
          gsap.fromTo(pane, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.24, delay: 0.1 + i * 0.08, ease: "power2.out" });
          const lines = pane.querySelector<HTMLElement>("[data-print]");
          if (lines) gsap.delayedCall(0.34 + i * 0.08, () => print(gsap, lines, { unit: "line" }).restart());
        });
        figures.forEach((f, i) => gsap.delayedCall(0.5 + i * 0.09, () => settle(gsap, f, f.dataset.settle ?? "").restart()));
      },
    });
  });


  return (
    <section ref={ref} id="built" className={styles.built} data-chapter="Built" data-node="retrieve" data-ground="void">
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 ref={titleRef} className={styles.title}>Running now</h2>
          <p ref={machineRef} className={styles.machine} aria-hidden="true">observe: this page</p>
        </header>
        <div className={styles.panes}>
          <article className={styles.pane} data-pane aria-labelledby="pane-site">
            <header className={styles.bar}>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span id="pane-site" className={styles.paneTitle}>
                <Glyph name="Terminal:duotone" size={14} />
                this page
              </span>
              <StatusWord status="build" />
            </header>
            <div className={styles.body}>
              <dl className={styles.rows} data-print>
                <div>
                  <dt>evals</dt>
                  <dd>
                    {site.evals.passes} of {site.evals.runs} runs, measured {site.evals.measured}
                  </dd>
                </div>
                {site.audit && (
                  <div>
                    <dt>audit</dt>
                    <dd>
                      {site.audit.passed} of {site.audit.total}, {site.audit.blocking} blocking, {site.audit.ranOn}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>links</dt>
                  <dd>
                    {site.links} checked {site.linksCheckedOn}
                  </dd>
                </div>
                <div>
                  <dt>defects</dt>
                  <dd>{site.defects} shipped and guarded</dd>
                </div>
                {/* This page's own repository, so the pane names both: the one
                    it is about and the one it is served from. */}
                {site.lastCommit && (
                  <div>
                    <dt>last commit</dt>
                    <dd>
                      <time dateTime={site.lastCommit.at}>
                        {new Date(site.lastCommit.at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>{" "}
                      on {site.repo}, read {site.lastCommit.checkedOn}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <footer className={styles.status}>
              <span>from committed build records</span>
              <a href={site.auditUrl}>
                <span aria-hidden="true">$ </span>npm run audit
              </a>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}

function StatusWord({ status }: { status: Status }) {
  return (
    <span className={styles.word} data-status={status}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}
