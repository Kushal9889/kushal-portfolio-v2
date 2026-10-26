/**
 * One completed request, for the telemetry strip in the hero.
 *
 * Emitted per answer rather than polled, and never on a timer: the strip is
 * completely still between requests because nothing is happening between them.
 * A sparkline that moves on its own would be decoration dressed as measurement,
 * which is the one thing this page cannot afford to fake.
 */
export const TELEMETRY_EVENT = "corpus:telemetry";

export type TelemetryPing = {
  ms: number;
  tokens: number;
  cost: number;
  provider: string | null;
  /** The film reads these to say whose request the orange light is. All optional, so older listeners are unaffected. */
  tokensIn?: number;
  tokensOut?: number;
  timings?: Record<string, number>;
  sources?: string[];
  /** A stored answer served for a question someone asked before. */
  warm?: boolean;
  /** Answered from the retrieved notes because no model responded. */
  degraded?: boolean;
  /** The page's own load-time request: a fixed question, run at `ranAt` (epoch ms). */
  recorded?: boolean;
  ranAt?: number;
  /** Characters in the answer. When a provider reports no token usage, the film estimates tokens from it (about 4 per token) and calls it an estimate. */
  answerChars?: number;
};

/**
 * A request leaving this tab, the moment it leaves.
 *
 * Not `corpus:ask`, which is the inbound command asking the agent to run a
 * question. This is the outbound fact that one started, with its time, so
 * anything drawing the request can begin drawing it before the first byte
 * comes back. `question` is null for the page's own load-time request, whose
 * text arrives with its answer.
 */
export const SENT_EVENT = "corpus:sent";

export type SentDetail = { question: string | null; t0: number; recorded?: boolean };

/**
 * The page's load-time answer, handed from the hero to the agent so it shows
 * as the agent's first turn instead of in a second pane beside it. `null` when
 * the load-time request failed.
 */
export const SEED_EVENT = "corpus:seed";

export type SeedDetail = {
  question: string;
  answer: string;
  sources: string[];
  total: number;
  provider: string | null;
  timings: Record<string, number>;
} | null;
