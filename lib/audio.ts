/**
 * The stage's audio engine.
 *
 * Off on every first visit. One `AudioContext`, created suspended and resumed
 * only inside the press on the sound toggle, suspended again whenever the tab is
 * hidden. Each motion verb owns one voice: `tick`, `pulse`, `click`, `whoosh`,
 * `swell` and `shimmer` are synthesized here from oscillators and filtered noise
 * bursts, because a synth makes those cleanly at exact verb durations; `stamp`,
 * `print` and `dock` are recorded foley, because the impact transient and the
 * material body of a real hit are what a synth misses.
 *
 * Every failure is silent. A missing file, a buffer that will not decode, a
 * browser without Web Audio: `play()` becomes a no-op and nothing is written to
 * the console. Sound is a second way to read the page, never the only way.
 *
 * Mix: effects at -12 dBFS (the files are normalised there at build time),
 * ambient at -20 dBFS, master trimmed so the true peak stays under -3 dBFS.
 * `print` is rate limited to one strike per 90ms, because a typing line would
 * otherwise fire a typebar per character.
 */

import type { Pitch, VerbName } from "./verbs";
import { VERB_EVENT, type VerbDetail } from "./verbs";

const STORE_KEY = "stage:sound";
const MASTER = 0.7;
const PRINT_EVERY_MS = 90;

/** The recorded hits, Opus first with an AAC fallback for Safari. */
const SAMPLES: Partial<Record<VerbName, string>> = {
  stamp: "/sound/h5a",
  print: "/sound/h5b",
  dock: "/sound/h5c",
};

/** A semitone ratio per pitch class, so a chapter can sit a minor third apart. */
const RATIO: Record<Pitch, number> = { base: 1, minus3: 0.84, plus3: 1.19 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = false;
let lastPrint = 0;
const buffers = new Map<VerbName, AudioBuffer | null>();

function read() {
  try {
    return window.localStorage.getItem(STORE_KEY) === "on";
  } catch {
    return false;
  }
}

function write(value: boolean) {
  try {
    window.localStorage.setItem(STORE_KEY, value ? "on" : "off");
  } catch {
    // A refused store changes nothing; the toggle still works for this visit.
  }
}

/** One short burst of noise, reused by the whoosh and the shimmer. */
function noise(context: AudioContext, seconds: number) {
  const frames = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  return buffer;
}

function tone(context: AudioContext, out: GainNode, freq: number, seconds: number, type: OscillatorType, peak: number) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + seconds);
  osc.connect(gain).connect(out);
  osc.start();
  osc.stop(context.currentTime + seconds + 0.02);
}

function burst(context: AudioContext, out: GainNode, seconds: number, filter: BiquadFilterType, cutoff: number, peak: number) {
  const src = context.createBufferSource();
  src.buffer = noise(context, seconds);
  const band = context.createBiquadFilter();
  band.type = filter;
  band.frequency.value = cutoff;
  const gain = context.createGain();
  gain.gain.value = peak;
  src.connect(band).connect(gain).connect(out);
  src.start();
}

/** The synthesized voices, one per verb that code makes better than a recording. */
function synth(verb: VerbName, ratio: number) {
  if (!ctx || !master) return;
  switch (verb) {
    case "settle":
      tone(ctx, master, 2100 * ratio, 0.05, "square", 0.05);
      break;
    case "pulse":
      tone(ctx, master, 880 * ratio, 0.12, "sine", 0.06);
      break;
    case "condense":
      tone(ctx, master, 1400 * ratio, 0.5, "triangle", 0.04);
      burst(ctx, master, 0.5, "highpass", 2600 * ratio, 0.03);
      break;
    case "dissolve":
      burst(ctx, master, 0.45, "bandpass", 1200 * ratio, 0.07);
      break;
    case "flood":
      tone(ctx, master, 120 * ratio, 1.1, "sine", 0.12);
      burst(ctx, master, 1.1, "lowpass", 700 * ratio, 0.05);
      break;
    default:
      break;
  }
}

async function sample(verb: VerbName) {
  if (!ctx) return null;
  if (buffers.has(verb)) return buffers.get(verb) ?? null;
  buffers.set(verb, null);
  const base = SAMPLES[verb];
  if (!base) return null;
  const canOpus = typeof Audio !== "undefined" && new Audio().canPlayType('audio/ogg; codecs="opus"') !== "";
  try {
    const res = await fetch(`${base}${canOpus ? ".opus" : ".m4a"}`);
    if (!res.ok) return null;
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(verb, decoded);
    return decoded;
  } catch {
    // A missing or undecodable file leaves this verb silent, and nothing else changes.
    return null;
  }
}

function playSample(buffer: AudioBuffer, ratio: number) {
  if (!ctx || !master) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = ratio;
  src.connect(master);
  src.start();
}

function onVerb(event: Event) {
  if (!on || !ctx || ctx.state !== "running") return;
  const detail = (event as CustomEvent<VerbDetail>).detail;
  if (!detail) return;
  const ratio = RATIO[detail.pitch] ?? 1;
  if (detail.verb === "print") {
    const now = performance.now();
    if (now - lastPrint < PRINT_EVERY_MS) return;
    lastPrint = now;
  }
  if (SAMPLES[detail.verb]) {
    const ready = buffers.get(detail.verb);
    if (ready) playSample(ready, ratio);
    else void sample(detail.verb).then((b) => b && playSample(b, ratio));
    return;
  }
  synth(detail.verb, ratio);
}

function onHidden() {
  if (ctx && document.visibilityState === "hidden") void ctx.suspend();
  else if (ctx && on) void ctx.resume();
}

/** Whether sound is on for this visit. Read once, at mount. */
export function soundOn() {
  return typeof window === "undefined" ? false : read();
}

/**
 * Turns sound on or off. Must be called inside the press itself: a context
 * created anywhere else stays suspended for the rest of the visit.
 */
export function setSound(next: boolean) {
  on = next;
  write(next);
  if (!next) {
    void ctx?.suspend();
    return;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
      window.addEventListener(VERB_EVENT, onVerb);
      document.addEventListener("visibilitychange", onHidden);
      // The recorded hits are fetched only after this first opt-in.
      void sample("stamp");
      void sample("print");
      void sample("dock");
    }
    void ctx.resume();
  } catch {
    // No Web Audio: the toggle still reads "on" and every play is a no-op.
  }
}
