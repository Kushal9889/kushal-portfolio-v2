"use client";

import { useEffect, useRef } from "react";
import field from "@/lib/agent/field.json";
import { createCloud, type Cloud, type RGB, type Vec3 } from "./cloud-gl";
import { parseFrame } from "./frame";
import styles from "./CorpusCloud.module.css";

/** World units per field unit. The field is normalised to [-1, 1]. */
export const WORLD_SCALE = 2.2;

export type FieldSection = { title: string; point: Vec3; passages: number };

/** A term particle: the word itself, where it sits, and the section it came from. */
export type FieldWord = { text: string; point: Vec3; section: string };

export type FieldInfo = {
  sections: FieldSection[];
  words: FieldWord[];
  variance: typeof field.variance;
  source: typeof field.source;
  particles: number;
};

function readRGB(el: Element, name: string, fallback: RGB): RGB {
  const parts = getComputedStyle(el).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n))
    ? (parts.map((n) => n / 255) as RGB)
    : fallback;
}

export default function CorpusCloud({
  onReady,
  onUnavailable,
}: {
  onReady?: (cloud: Cloud, info: FieldInfo) => void;
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const { positions, clusters, kinds, labels } = field.particles;

    // Four cores or fewer is a machine drawing this on an integrated GPU. Every
    // passage anchor is kept, and the terms orbiting each one are thinned to a
    // third, so the field keeps its shape at a third of the fragment cost.
    const thin = (navigator.hardwareConcurrency ?? 8) <= 4;
    const drawn: number[] = [];
    let sinceAnchor = 0;
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === 0) {
        sinceAnchor = 0;
        drawn.push(i);
      } else if (!thin || sinceAnchor++ % 3 === 0) {
        drawn.push(i);
      }
    }

    const cloud = createCloud(
      canvas,
      {
        positions: Float32Array.from(drawn.flatMap((i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]), (v) => v * WORLD_SCALE),
        clusters: Float32Array.from(drawn, (i) => clusters[i]),
        kinds: Float32Array.from(drawn, (i) => kinds[i]),
        count: drawn.length,
      },
      {
        ink: readRGB(canvas, "--ink-rgb", [0.96, 0.95, 0.93]),
        voltage: readRGB(canvas, "--voltage-rgb", [1, 0.31, 0]),
      },
      // A reproducible capture measures the page, not the machine it ran on, so
      // the frame-time guard stays out of it.
      // It also skips the far-plane arrival, so the first frame is already the pose.
      { watchdog: parseFrame() === null && !new URLSearchParams(window.location.search).has("nofreeze"), arrive: parseFrame() === null },
    );

    if (!cloud) {
      onUnavailable?.();
      return;
    }

    // Only particles that are drawn can be read out as words, so a thinned field
    // never labels a point that is not there.
    const words: FieldWord[] = [];
    for (const i of drawn) {
      if (kinds[i] !== 1 || !labels[i]) continue;
      words.push({
        text: labels[i],
        section: field.sections[clusters[i]].title,
        point: [positions[i * 3] * WORLD_SCALE, positions[i * 3 + 1] * WORLD_SCALE, positions[i * 3 + 2] * WORLD_SCALE],
      });
    }

    onReady?.(cloud, {
      sections: field.sections.map((s) => ({
        title: s.title,
        passages: s.passages,
        point: s.centroid.map((v) => v * WORLD_SCALE) as Vec3,
      })),
      words,
      variance: field.variance,
      source: field.source,
      particles: drawn.length,
    });

    return () => cloud.destroy();
    // Mounted once; callbacks are read at mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}
