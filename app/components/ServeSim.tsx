"use client";

import { useId, useState } from "react";
import spec from "@/content/serving.json";
import { serve } from "@/lib/serving";
import Panel from "./Panel";
import styles from "./ServeSim.module.css";

const CONTEXTS = [2048, 8192, 32768, 131072];
const BATCHES = [1, 8, 32, 128];
const GPU_COUNTS = [1, 2, 4, 8];

const fmt = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/**
 * Serve a model yourself: pick the model, the GPUs, the context length and the
 * batch, and the memory bar and the numbers are recomputed from public
 * specifications (content/serving.json) by lib/serving.ts. A roofline
 * estimate, labelled as one: decode is bounded by reading the weights and the
 * KV cache from memory every step.
 *
 * The bar's colour is the computed state and nothing else: live while the
 * weights and cache fit, warn above 85 percent, fail when they do not fit.
 */
export default function ServeSim() {
  const id = useId();
  const [modelId, setModel] = useState(spec.models[0].id);
  const [gpus, setGpus] = useState(1);
  const [context, setContext] = useState(8192);
  const [batch, setBatch] = useState(32);
  const [fp8, setFp8] = useState(false);
  const model = spec.models.find((m) => m.id === modelId)!;
  const gpu = spec.gpus[0];
  const r = serve({ model, gpu, gpus, context, batch, weightBytes: fp8 ? 1 : 2 });
  const state = !r.fits ? "fail" : r.load > 0.85 ? "warn" : "live";
  // The bar spans whichever is larger, the GPUs' memory or the demand, so an
  // overflow shows as cache running past the memory line, not as a squeeze.
  const memory = gpu.memoryGB * gpus;
  const span = Math.max(memory, r.weightsGB + r.kvGB);
  const pct = (gb: number) => `${(gb / span) * 100}%`;

  const choice = <T extends string | number>(name: string, value: T, options: T[], set: (v: T) => void, label: (v: T) => string) => (
    <fieldset className={styles.choice}>
      <legend>{name}</legend>
      {options.map((o) => (
        <label key={String(o)} data-on={o === value || undefined}>
          <input type="radio" name={`${id}-${name}`} checked={o === value} onChange={() => set(o)} />
          {label(o)}
        </label>
      ))}
    </fieldset>
  );

  return (
    <Panel label="Serve it yourself" kind="instrument" surface="console" heading={3} state={r.fits ? "running" : "degraded"} status={r.fits ? "fits" : "out of memory"}>
      <p className={styles.lede}>
        Where GPU memory and decode speed go. Change the load and watch the KV cache take the GPU.
      </p>
      <div className={styles.controls}>
        {choice("Model", modelId, spec.models.map((m) => m.id), setModel, (v) => spec.models.find((m) => m.id === v)!.label)}
        {choice(`${gpu.label} GPUs`, gpus, GPU_COUNTS, setGpus, (v) => `${v}`)}
        {choice("Context tokens", context, CONTEXTS, setContext, (v) => (v >= 1024 ? `${v / 1024}K` : `${v}`))}
        {choice("Concurrent requests", batch, BATCHES, setBatch, (v) => `${v}`)}
        <label className={styles.toggle}>
          <input type="checkbox" checked={fp8} onChange={(e) => setFp8(e.target.checked)} />
          FP8 weights
        </label>
      </div>

      <div className={styles.bar} data-state={state} role="img" aria-label={`Memory: weights ${fmt(r.weightsGB)} GB, KV cache ${fmt(r.kvGB)} GB of ${fmt(gpu.memoryGB * gpus)} GB`}>
        <span className={styles.weights} style={{ width: pct(r.weightsGB) }} />
        <span className={styles.kv} style={{ width: pct(r.kvGB) }} />
        <span className={styles.reserve} style={{ left: pct(r.capacityGB) }} />
        {span > memory && <span className={styles.limit} style={{ left: pct(memory) }} />}
      </div>

      <dl className={styles.readout} aria-live="polite">
        <div>
          <dt>Weights</dt>
          <dd><data value={r.weightsGB}>{fmt(r.weightsGB)}</data> GB</dd>
        </div>
        <div>
          <dt>KV cache</dt>
          <dd><data value={r.kvGB}>{fmt(r.kvGB, r.kvGB < 10 ? 1 : 0)}</data> GB <small>{fmt(r.kvPerTokenKB)} KB a token, {fmt(r.blocks)} blocks of {spec.blockTokens}</small></dd>
        </div>
        <div>
          <dt>Most requests that fit</dt>
          <dd data-state={state}><data value={r.maxBatch}>{fmt(r.maxBatch)}</data></dd>
        </div>
        <div>
          <dt>Decode throughput</dt>
          <dd>{r.fits ? <><data value={r.tokensPerSecond}>{fmt(r.tokensPerSecond)}</data> tokens/s, <data value={r.perUserTokensPerSecond}>{fmt(r.perUserTokensPerSecond)}</data> each</> : "does not run"}</dd>
        </div>
      </dl>
      <p className={styles.source}>
        Roofline estimate from public specs: <a href={model.source}>{model.label}</a>, <a href={gpu.source}>{gpu.label}</a>. Weights split across GPUs, fp16 KV cache, {spec.reserve * 100}% held for activations.
      </p>
    </Panel>
  );
}
