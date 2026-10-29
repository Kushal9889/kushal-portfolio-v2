/**
 * Request limits the agent runs under, in one place so the page can state them
 * (the film's cards) from the same numbers the server uses.
 */

/** Earlier exchanges a question may carry (relatedHistory picks among them). */
export const HISTORY_TURNS = 2;
/** Characters of each earlier answer that go back into the prompt. */
export const HISTORY_ANSWER_CHARS = 400;
/** Output cap for a medium answer, in tokens (policy.ts answerLength picks per question). */
export const MEDIUM_ANSWER_TOKENS = 260;
