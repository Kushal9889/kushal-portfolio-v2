/** UI status only: never infer successful execution from an animation. */
export const ASK_AGENT_EVENT = 'corpus:ask';
export const COMPANION_EVENT = 'corpus:companion';
export const OPEN_AGENT_EVENT = 'corpus:open';
export type CompanionPhase = 'received' | 'searching' | 'writing' | 'checking' | 'done' | 'failed' | 'stopped';
export type CompanionProgress = { phase: CompanionPhase; message: string };
export type CompanionStop = { id: string; label: string; invitation: string; question: string };

export const COMPANION_MESSAGES: Record<CompanionPhase, string> = {
  received: 'Good question. Let’s follow the evidence.',
  searching: 'Looking through the record, not guessing.',
  writing: 'Turning the relevant passages into an answer.',
  checking: 'Source checks returned. Inspect the answer and its sources.',
  done: 'The answer is ready. The sources get a say, too.',
  failed: 'That run could not finish. Your question is safe to retry.',
  stopped: 'Paused. You’re in control of the next move.',
};

export function companionProgress(phase: CompanionPhase, aside?: string): CompanionProgress {
  return { phase, message: phase === 'done' && aside?.trim() ? aside.trim() : COMPANION_MESSAGES[phase] };
}
