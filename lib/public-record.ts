import { redact } from './redact';

/** The same public text at server and client boundaries; never serialize raw private names. */
export function publicRecordText(text: string, privateNames: string[] = []) {
  return privateNames.filter(Boolean).reduce((value, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return value.replace(new RegExp(`\\b${escaped}\\b`, 'g'), '[client]');
  }, redact(text).text);
}
