import test from 'node:test';
import assert from 'node:assert/strict';
import { companionProgress, COMPANION_MESSAGES, type CompanionPhase, type CompanionProgress } from '../lib/companion';
import { guardAside, DEFAULT_ASIDE_TEMPERATURE } from '../lib/agent/aside';

test('companion reports each real phase without inventing completion', () => {
  for (const phase of Object.keys(COMPANION_MESSAGES) as CompanionPhase[]) {
    assert.deepEqual(companionProgress(phase), { phase, message: COMPANION_MESSAGES[phase] });
  }
  assert.equal(companionProgress('failed', 'A cheerful aside.').message, COMPANION_MESSAGES.failed);
  assert.equal(companionProgress('done', '  An approved aside.  ').message, 'An approved aside.');
  assert.equal(companionProgress('done', ' ').message, COMPANION_MESSAGES.done);
});

test('activity keeps the current run, including cached answers, and caps its history', () => {
  const css = require.extensions['.css'];
  require.extensions['.css'] = module => { module.exports = {}; };
  let appendActivity: typeof import('../app/components/AgentCompanion').appendActivity;
  try { ({ appendActivity } = require('../app/components/AgentCompanion')); }
  finally { if (css) require.extensions['.css'] = css; else delete require.extensions['.css']; }

  const event = (phase: CompanionPhase): CompanionProgress => ({ phase, message: phase });
  const previous = [event('received'), event('failed')];
  assert.deepEqual(appendActivity(previous, event('received')), [event('received')]);
  assert.deepEqual(appendActivity(previous, event('done')), [event('done')]);
  assert.deepEqual(appendActivity([event('received'), event('checking')], event('done')), [event('received'), event('checking'), event('done')]);
  assert.equal(appendActivity(Array.from({ length: 8 }, () => event('writing')), event('checking')).length, 8);
});

test('creative layer default is separate from factual temperature and retains guard', () => {
  assert.equal(DEFAULT_ASIDE_TEMPERATURE, 0.6);
  assert.equal(guardAside('Invented 42 wins.', 'An answer.'), null);
  assert.equal(guardAside('Meet ImaginaryCompany.', 'An answer.'), null);
  assert.equal(guardAside('The sources get a say, too.', 'An answer.'), 'The sources get a say, too.');
});

import { solveArm, springStep } from '../lib/robot-motion';
test('runtime arm solution preserves both bone lengths in every quadrant and clamps unreachable targets', () => {
  const shoulder = { x: 8, y: 50 };
  for (const target of [{x:0,y:0},{x:100,y:0},{x:100,y:200},{x:-100,y:200},shoulder]) {
    for (const bend of [-1,1] as const) {
      const arm = solveArm(shoulder, target, bend);
      assert.ok(Math.abs(Math.hypot(arm.elbow.x-shoulder.x,arm.elbow.y-shoulder.y)-13)<.00001);
      assert.ok(Math.abs(Math.hypot(arm.hand.x-arm.elbow.x,arm.hand.y-arm.elbow.y)-12)<.00001);
      assert.ok(Number.isFinite(arm.upper) && Number.isFinite(arm.lower));
    }
  }
  assert.notEqual(solveArm(shoulder,{x:100,y:50},1).upper, solveArm(shoulder,{x:-100,y:50},1).upper);
});
test('body spring converges without an unbounded tab-resume time step', () => {
  let position=0, velocity=0;
  for(let i=0;i<200;i++) ({position,velocity}=springStep(position,velocity,5,.016));
  assert.ok(Math.abs(position-5)<.001);
  assert.deepEqual(springStep(0,0,5,100),springStep(0,0,5,.032));
});

import { scrollBurst } from '../lib/robot-motion';
test('border reset requires a continuous one-second scroll burst, never idle debounce', () => {
  let burst=scrollBurst(null,0);
  for(let time=100;time<1000;time+=100) {burst=scrollBurst(burst,time); assert.equal(burst.reset,false);}
  assert.equal(scrollBurst(burst,1000).reset,true);
  assert.equal(scrollBurst(burst,2000).reset,false);
  assert.equal(scrollBurst(null,4000).reset,false);
});
