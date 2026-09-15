"use client";

import { useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { condense, corners, print, stamp } from "@/lib/verbs";
import { segmentsFor } from "@/lib/numbers";
import { IssuerDot, NvidiaMark } from "../Mark";
import { useStage } from "./StageContext";
import styles from "./CredentialsChapter.module.css";

type Receipt = { host: string; status: number | null; checkedOn: string };

export type Plate = {
  id: string;
  kind: "exam" | "program" | "course";
  name: string;
  short: string | null;
  issuer: string;
  year: number;
  why: string | null;
  verify: { label: string; url: string; code: string | null; receipt: Receipt } | null;
  segments: { earned: number; total: number } | null;
  earned: { name: string; url: string; code: string | null; receipt: Receipt }[];
  pending: string[];
  identity: { hue: string; garment: string; border: string; nameplate: string | null; quarters?: string[] } | null;
};

type Filter = "all" | Plate["kind"];

const SEAL: Record<Plate["kind"], string> = { exam: "proctored exam", program: "program", course: "course" };
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "exam", label: "Exam" },
  { key: "program", label: "Program" },
  { key: "course", label: "Course" },
];

/** Seven-segment geometry in a 12 by 20 box: segment, x, y, width, height. */
const SEG_RECTS: [string, number, number, number, number][] = [
  ["a", 2, 0, 8, 2],
  ["b", 10, 2, 2, 7],
  ["c", 10, 11, 2, 7],
  ["d", 2, 18, 8, 2],
  ["e", 0, 11, 2, 7],
  ["f", 0, 2, 2, 7],
  ["g", 2, 9, 8, 2],
];

function Segmented({ text }: { text: string }) {
  return (
    <span className={styles.seven} aria-hidden="true">
      {text.split("").map((ch, i) =>
        ch === "/" ? (
          <svg key={i} viewBox="0 0 8 20" className={styles.slash}>
            <line x1="7" y1="1" x2="1" y2="19" />
          </svg>
        ) : (
          <svg key={i} viewBox="0 0 12 20">
            {SEG_RECTS.map(([s, x, y, w, h]) => (
              <rect key={s} x={x} y={y} width={w} height={h} data-on={segmentsFor(ch).includes(s) || undefined} />
            ))}
          </svg>
        ),
      )}
    </span>
  );
}

/** The proctored seal: a ring of 36 ticks around the kind label. */
function SealRing() {
  return (
    <svg viewBox="0 0 40 40" className={styles.ring} aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2;
        const at = (r: number, f: typeof Math.cos) => Math.round((20 + f(a) * r) * 100) / 100;
        return <line key={i} x1={at(16, Math.cos)} y1={at(16, Math.sin)} x2={at(19, Math.cos)} y2={at(19, Math.sin)} />;
      })}
    </svg>
  );
}

function ReceiptRow({ receipt, checker }: { receipt: Receipt; checker: string }) {
  return (
    <p className={styles.receipt}>
      <span className={styles.receiptHead}>link check</span>
      <span>{receipt.host}</span>
      {receipt.status !== null && <span data-ok={receipt.status < 400 || undefined}>{receipt.status}</span>}
      <span>checked {receipt.checkedOn}</span>
      <span className={styles.checker}>{checker}</span>
    </p>
  );
}

function checkerOf(url: string) {
  const name = new URL(url).hostname.split(".").slice(-2)[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Credentials: every certification as a chamfered plate, each checkable in one
 * press. Filters really filter (non-matching plates dim, stay readable and stay
 * in the accessibility tree). Verify opens the issuer's record in a new tab and
 * marks the plate; Copy ID copies the code the record is keyed by. Receipts read
 * the date each link was last checked from `content/links.json`.
 */
export default function CredentialsChapter({ plates, linksCheckedOn }: { plates: Plate[]; linksCheckedOn: string }) {
  const { retrieveInto, flash } = useStage();
  const [filter, setFilter] = useState<Filter>("all");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
        retrieveInto(title, "credentials");
        condense(gsap, title).restart();
        if (machine) print(gsap, machine, { unit: "char" }).restart();
      },
    });
    // Each plate stamps down as it arrives; only the proctored exam carries the flash.
    for (const plate of Array.from(section.querySelectorAll<HTMLElement>("[data-plate]"))) {
      let done = false;
      ScrollTrigger.create({
        trigger: plate,
        start: "top 82%",
        onEnter: () => {
          if (done) return;
          done = true;
          const exam = plate.dataset.kind === "exam";
          stamp(gsap, plate, { flash: exam ? flash.current : null, corners: exam }).restart();
          plate.querySelectorAll<HTMLElement>("[data-earned]").forEach((seg, i) =>
            gsap.delayedCall(0.45 + i * 0.06, () => stamp(gsap, seg, { scale: 0.6, corners: false }).restart()),
          );
        },
      });
    }
  });

  const counts: Record<Filter, number> = {
    all: plates.length,
    exam: plates.filter((p) => p.kind === "exam").length,
    program: plates.filter((p) => p.kind === "program").length,
    course: plates.filter((p) => p.kind === "course").length,
  };

  const verify = (plate: Plate, el: HTMLElement | null) => {
    setOpening(plate.id);
    window.setTimeout(() => {
      setOpening(null);
      setOpened((o) => ({ ...o, [plate.id]: true }));
    }, 1200);
    const card = el?.closest<HTMLElement>("[data-plate]");
    if (card) corners(card, true);
  };

  const copy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      // A refused clipboard changes nothing, rather than claiming a copy.
    }
  };

  return (
    <section ref={ref} id="credentials" className={styles.credentials} data-chapter="Credentials" data-node="retrieve" data-ground="void">
      {/* Links written before the split land here. */}
      <span id="proof" className={styles.alias} aria-hidden="true" />
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 ref={titleRef} className={styles.title}>
            Credentials
          </h2>
          <p ref={machineRef} className={styles.machine} aria-hidden="true">
            verify: <span>{plates.length}</span> credentials, links checked <span>{linksCheckedOn}</span>
          </p>
          <div className={styles.filters} role="group" aria-label="Show one kind of credential">
            {FILTERS.filter((f) => counts[f.key] > 0).map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                <span>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </header>

        <div className={styles.plates}>
          {plates.map((p) => {
            const dim = filter !== "all" && p.kind !== filter;
            const hue = p.identity?.hue;
            return (
              <article
                key={p.id}
                data-plate
                data-kind={p.kind}
                data-dim={dim || undefined}
                data-border={p.identity?.border}
                className={styles.plate}
                style={{ "--identity": hue ?? "var(--ink)" } as React.CSSProperties}
                aria-label={`${p.name}, ${p.issuer}, ${p.year}`}
              >
                {p.identity?.border === "stripe" && <span className={styles.stripe} aria-hidden="true" />}
                {p.identity?.quarters && (
                  <span className={styles.quarters} aria-hidden="true">
                    {p.identity.quarters.map((q) => (
                      <i key={q} style={{ background: q }} />
                    ))}
                  </span>
                )}
                <header className={styles.top}>
                  <span className={styles.issuer}>
                    {p.issuer === "NVIDIA" ? (
                      <span className={styles.mark}>
                        <NvidiaMark size={16} />
                      </span>
                    ) : p.identity?.nameplate ? (
                      <span className={styles.nameplate}>{p.identity.nameplate}</span>
                    ) : (
                      <IssuerDot issuer={p.issuer} size={16} />
                    )}
                    <span>
                      {p.issuer}, {p.year}
                    </span>
                  </span>
                  <span className={styles.seal} data-kind={p.kind}>
                    {p.kind === "exam" && <SealRing />}
                    {SEAL[p.kind]}
                  </span>
                </header>

                <div className={styles.face}>
                  {p.segments ? (
                    <p className={styles.figure} aria-label={`${p.segments.earned} of ${p.segments.total} courses earned`}>
                      <Segmented text={`${p.segments.earned}/${p.segments.total}`} />
                    </p>
                  ) : p.short ? (
                    <p className={styles.figure}>{p.short}</p>
                  ) : null}
                  <h3 className={styles.name}>{p.name}</h3>
                  {p.why && <p className={styles.detail}>{p.why}</p>}
                  {p.segments && (
                    <p className={styles.segments} aria-hidden="true">
                      {Array.from({ length: p.segments.total }, (_, i) => (
                        <span key={i} data-earned={i < p.segments!.earned || undefined} />
                      ))}
                    </p>
                  )}
                </div>

                {p.kind === "program" && (
                  <div className={styles.courses}>
                    <details className={styles.split}>
                      <summary>
                        Verify {p.earned.length} of {p.segments?.total ?? p.earned.length}
                      </summary>
                      <ul className={styles.earned}>
                        {p.earned.map((c) => (
                          <li key={c.url}>
                            <a href={c.url} target="_blank" rel="noopener">
                              {c.name}
                            </a>
                            <span>checked {c.receipt.checkedOn}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    {p.pending.length > 0 && (
                      <>
                        <p className={styles.coursesHead}>not started</p>
                        <ul className={styles.pending}>
                          {p.pending.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                <footer className={styles.strip}>
                  {p.verify && (
                    <>
                      <div className={styles.actions}>
                        <a
                          href={p.verify.url}
                          target="_blank"
                          rel="noopener"
                          className={styles.verify}
                          data-garment={p.identity?.garment}
                          onClick={(e) => verify(p, e.currentTarget)}
                        >
                          {opening === p.id ? `Opening ${checkerOf(p.verify.url)}` : p.verify.label}
                        </a>
                        {p.verify.code && (
                          <button type="button" className={styles.copy} onClick={() => copy(p.id, p.verify!.code!)} aria-live="polite">
                            {copied === p.id ? "copied" : "Copy ID"}
                          </button>
                        )}
                        {opened[p.id] && (
                          <span className={styles.opened}>
                            <i aria-hidden="true" />
                            opened this session, link checked {p.verify.receipt.checkedOn}
                          </span>
                        )}
                      </div>
                      <ReceiptRow receipt={p.verify.receipt} checker={checkerOf(p.verify.url)} />
                    </>
                  )}
                  {!p.verify && p.earned[0] && <ReceiptRow receipt={p.earned[0].receipt} checker={checkerOf(p.earned[0].url)} />}
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
