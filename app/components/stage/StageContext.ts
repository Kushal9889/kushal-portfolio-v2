import { createContext, useContext, type RefObject } from "react";
import type { Cloud } from "./cloud-gl";
import type { FieldInfo } from "./CorpusCloud";

export type StageApi = {
  cloud: RefObject<Cloud | null>;
  field: RefObject<FieldInfo | null>;
  cloudReady: boolean;
  /** Full-viewport hairline that impacts flash. */
  flash: RefObject<HTMLDivElement | null>;
  /** How far the hero dive has run, 0..1. Pointer parallax only applies at rest. */
  dive: RefObject<number>;
  /**
   * What the hero has lit in the field: the sections its answer was grounded in.
   * The page-long camera lights each chapter's own sections as it passes them,
   * and puts this back when the reader returns to the hero.
   */
  glow: RefObject<number[] | null>;
  /**
   * Condense into `el`: the nearest cluster of the chapter's own sections gathers
   * at the element and returns to the field (plan 4.3). A no-op before the field
   * is up and under reduced motion.
   */
  retrieveInto: (el: Element, chapter?: string) => void;
  /** Opens the agent drawer, and asks `question` once the agent has mounted. */
  openAsk: (question?: string) => void;
};

/** Dispatched by the hero when its answer arrives: the milliseconds each graph node took. */
export const TIMINGS_EVENT = "corpus:timings";
export type TimingsDetail = { timings: Record<string, number>; question: string };

export const StageContext = createContext<StageApi | null>(null);

export function useStage(): StageApi {
  const api = useContext(StageContext);
  if (!api) throw new Error("useStage must be used inside <Stage>");
  return api;
}
