"use client";

import { useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import Reach from "../Reach";
import Glyph from "./Glyph";
import { mailDraft } from "@/lib/reach";
import { clock } from "@/lib/numbers";
import { print } from "@/lib/verbs";
import { useStage } from "./StageContext";
import { impact, IMPACT_HIT } from "./impact";
import { markFrameReady, parseFrame, scrollInstant, waitFor, watchRefresh } from "./frame";
import { CONTACT_CORE as CORE, CONTACT_EYE as EYE, CONTACT_FOV } from "./stations";
import styles from "./ContactFinale.module.css";

/** Share of the hold spent gathering the field, when there is a field to gather. */
const GATHER = 0.52;
/** Share of the hold the orange takes to cover the screen from the gathered point. */
const FLOOD = 0.2;

/**
 * The last chapter. Everything the page showed was drawn from one corpus; here
 * the field gathers into a single point, that point floods the screen orange,
 * and what is left is the way to write to him.
 *
 * Without the motion bundle it is simply the orange chapter, complete.
 */
export default function ContactFinale({
  register,
  reach,
  availableIn,
  forwardText,
}: {
  register: { term: string; value: string }[];
  reach: React.ComponentProps<typeof Reach>;
  /** Months from today to the month named in availability, computed rather than restated. */
  availableIn: number | null;
  /** The three-line forward blurb, shown as an artifact rather than only behind a copy button. */
  forwardText: string;
}) {
  const draft = mailDraft(reach.email, reach.site, reach.context);
  const [handedAt, setHandedAt] = useState<Date | null>(null);
  const draftBodyRef = useRef<HTMLParagraphElement>(null);
  const { cloud, flash } = useStage();
  const innerRef = useRef<HTMLDivElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restRef = useRef<HTMLDivElement>(null);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const inner = innerRef.current;
    const flood = floodRef.current;
    const title = titleRef.current;
    const rest = restRef.current;
    if (!inner || !flood || !title || !rest) return;
    const frame = parseFrame();
    const framed = frame?.chapter === "contact";
    const refresh = watchRefresh(ScrollTrigger);

    section.dataset.flood = "on";
    section.dataset.ground = "void";
    flood.style.transform = "scale(0)";

    // The title lands, then the ways to reach him follow it in.
    const arrive = impact(gsap, title, { shake: inner, flash: flash.current });
    arrive.fromTo(
      rest.children,
      { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", immediateRender: true },
      IMPACT_HIT,
    );

    // The draft types itself inside the envelope when the chapter lands. It is
    // built outside the arrival timeline and played on the landing edge, so a
    // timeline parked at zero never leaves the draft blank.
    const body = draftBodyRef.current;
    const draftPrint = body ? print(gsap, body, { unit: "word" }) : null;

    // The one action the whole page is walking toward arrives last and arrives
    // hardest, out of the same depth every other figure on the page came from.
    const mail = rest.querySelector<HTMLElement>('a[href^="mailto:"]');
    if (mail) {
      gsap.set(mail, { transformPerspective: 900 });
      arrive.fromTo(
        mail,
        { z: -320, scale: 0.92 },
        { z: 0, scale: 1, duration: 0.5, ease: "expo.out", immediateRender: false },
        IMPACT_HIT + 0.18,
      );
    }

    // Only the hold that is on screen may move the camera.
    let live = false;
    /** Centre of the "Email him" control, in viewport pixels. */
    let origin: { x: number; y: number } | null = null;
    const measureOrigin = () => {
      const box = mail?.getBoundingClientRect();
      origin = box && box.width > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    };
    let arrived = false;
    const apply = (p: number) => {
      const c = cloud.current && !cloud.current.stats.lost ? cloud.current : null;
      const gatherEnd = c ? GATHER : 0.04;
      if (c && live) c.setCollapse(CORE, Math.min(Math.max(p / gatherEnd, 0), 1));

      // The orange grows out of the one action this chapter leads to, not out
      // of the middle of the screen: the origin is the centre of "Email him",
      // measured once per refresh.
      const at = origin ?? (c && live ? c.project(CORE) : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const f = Math.min(Math.max((p - gatherEnd) / FLOOD, 0), 1);
      flood.style.transform = `translate3d(${Math.round(at.x - window.innerWidth / 2)}px, ${Math.round(at.y - window.innerHeight / 2)}px, 0) scale(${(f * f).toFixed(4)})`;
      const ground = f >= 0.98 ? "voltage" : "void";
      if (section.dataset.ground !== ground) section.dataset.ground = ground;

      const landAt = gatherEnd + FLOOD;
      if (p >= landAt && !arrived) {
        arrived = true;
        if (framed) {
          arrive.progress(1);
          draftPrint?.progress(1);
        } else {
          arrive.restart();
          draftPrint?.restart();
        }
      } else if (p < landAt - 0.03 && arrived) {
        arrived = false;
        arrive.pause(0);
      }
    };

    const proxy = { p: 0 };
    const sequence = gsap.timeline().to(proxy, {
      p: 1,
      duration: 1,
      ease: "none",
      onUpdate: () => {
        if (!framed && !refresh.refreshing()) apply(proxy.p);
      },
    });
    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      // Ends where the chapter has arrived. Holding a screen that has stopped
      // moving is scroll the reader pays for and gets nothing back from.
      end: "+=100%",
      pin: true,
      scrub: framed ? true : 0.8,
      animation: sequence,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle: (self) => {
        if (refresh.refreshing()) return;
        live = self.isActive;
        // Measured while the chapter is pinned, which is the only time the
        // button is where the reader will see it.
        if (self.isActive) measureOrigin();
      },
      onLeaveBack: () => {
        if (!refresh.refreshing()) cloud.current?.setCollapse(CORE, 0);
      },
      // A link to this chapter lands where it has settled, not on an empty field.
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.end));
      },
    });

    // The camera arrives framed on the whole field by itself: the page-long
    // travel in Stage ends on this exact pose where this hold begins, so the
    // gathering starts from the full corpus without a cut to it.

    // After a re-measure, the field and the flood are put back where the page is.
    refresh.onSettled(() => {
      live = hold.isActive;
      if (hold.progress > 0) cloud.current?.setCamera(EYE, CORE, CONTACT_FOV);
      apply(hold.progress);
    });

    if (framed && frame) {
      requestAnimationFrame(async () => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        await waitFor(() => Boolean(cloud.current), 10_000);
        live = true;
        cloud.current?.setCamera(EYE, CORE, CONTACT_FOV);
        cloud.current?.setField({ disperse: 0, dim: 1 });
        sequence.progress(frame.p);
        apply(frame.p);
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  const [forwardCopied, setForwardCopied] = useState(false);
  const copyForward = async () => {
    try {
      await navigator.clipboard.writeText(forwardText);
      setForwardCopied(true);
      window.setTimeout(() => setForwardCopied(false), 4000);
    } catch {
      setForwardCopied(false);
    }
  };

  return (
    <section ref={sectionRef} id="contact" className={styles.finale} data-chapter="Contact" data-node="act" data-ground="voltage">
      <div ref={floodRef} className={styles.flood} aria-hidden="true" />
      <div ref={innerRef} className={styles.inner}>
        <div className={styles.side}>
          <h2 ref={titleRef} className={styles.title}>
            Get in touch
          </h2>
          {availableIn !== null && (
            <p className={styles.countdown}>
              available in {availableIn} {availableIn === 1 ? "month" : "months"}
            </p>
          )}
        </div>
        <div ref={restRef} className={styles.rest}>
          <dl className={styles.register}>
            {register.map((row) => (
              <div key={row.term}>
                <dt>{row.term}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {/* What the mail client receives, shown before the press. The same
              mailDraft() call builds this text and the mailto URL below it, so
              the reader sees exactly what they are about to send. The header
              edge is the envelope flap. */}
          <figure className={styles.draft} aria-label="Draft email">
            <div className={styles.draftHead}>
              <p>
                <span>To</span>
                {draft.to}
              </p>
              <p>
                <span>Subject</span>
                {draft.subject}
              </p>
            </div>
            <p ref={draftBodyRef} className={styles.draftBody}>
              {draft.body}
            </p>
            {handedAt && (
              <p className={styles.draftEvent}>
                <Glyph name="EnvelopeSimple:bold" size={12} />
                handed to your mail client <time dateTime={handedAt.toISOString()}>{clock(handedAt)}</time>
              </p>
            )}
          </figure>

          <div className={styles.reach} onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a[href^="mailto:"]')) setHandedAt(new Date()); }}>
            <Reach {...reach} />
          </div>

          {/* The forward line as a visible artifact: a colleague pasting this
              into a channel should never need to click a hidden button first
              to see what they are about to send. */}
          <figure className={styles.forward}>
            <pre className={styles.forwardText}>{forwardText}</pre>
            <figcaption className={styles.forwardFoot}>
              <span className={styles.forwardCaption}>what a colleague would paste</span>
              <button type="button" className={styles.forwardCopy} onClick={copyForward} aria-live="polite">
                {forwardCopied ? "Copied" : "Copy this"}
              </button>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
