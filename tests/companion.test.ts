import test from 'node:test';
import assert from 'node:assert/strict';
import { companionProgress, COMPANION_MESSAGES, type CompanionPhase } from '../lib/companion';
import { guardAside, DEFAULT_ASIDE_TEMPERATURE } from '../lib/agent/aside';

test('companion reports each real phase without inventing completion', () => {
  for (const phase of Object.keys(COMPANION_MESSAGES) as CompanionPhase[]) {
    assert.deepEqual(companionProgress(phase), { phase, message: COMPANION_MESSAGES[phase] });
  }
  assert.equal(companionProgress('failed', 'A cheerful aside.').message, COMPANION_MESSAGES.failed);
  assert.equal(companionProgress('done', '  An approved aside.  ').message, 'An approved aside.');
  assert.equal(companionProgress('done', ' ').message, COMPANION_MESSAGES.done);
});

test('creative layer default is separate from factual temperature and retains guard', () => {
  assert.equal(DEFAULT_ASIDE_TEMPERATURE, 0.6);
  assert.equal(guardAside('Invented 42 wins.', 'An answer.'), null);
  assert.equal(guardAside('Meet ImaginaryCompany.', 'An answer.'), null);
  assert.equal(guardAside('The sources get a say, too.', 'An answer.'), 'The sources get a say, too.');
});
