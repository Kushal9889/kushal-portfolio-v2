import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

const origin = new URL(process.argv[2] ?? 'http://localhost:3217');
assert.ok(['http:', 'https:'].includes(origin.protocol), 'HTTP(S) origin required');
assert.equal(origin.pathname, '/', 'Pass an origin, without a path');
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Origin must not contain credentials, query or fragment');
const results = [];
async function check(path, validate) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    await validate(response);
    results.push({ path, pass: true, ms: Math.round(performance.now() - started) });
  } catch (error) {
    results.push({ path, pass: false, error: String(error), ms: Math.round(performance.now() - started) });
  }
}
for (const path of ['/', '/classic']) await check(path, async response => {
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await response.text(), /Kushal Gaddamwar/);
});
await check('/api/health', async response => {
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.ok(health.passages > 0, 'Missing bundled corpus');
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
});
await check('/kushal-gaddamwar-resume.pdf', async response => {
  assert.match(response.headers.get('content-type') ?? '', /application\/pdf/);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});
await check('/llms.txt', async response => {
  assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
  assert.match(await response.text(), /Kushal Gaddamwar/);
});
await check('/api/agent/stream?q=What%20salary%20does%20he%20want%3F', async response => {
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.ok(response.headers.get('x-request-id'), 'Missing stream correlation ID');
  const events = (await response.text()).split('\n\n').filter(frame => frame.startsWith('data: ')).map(frame => JSON.parse(frame.slice(6)));
  assert.equal(events[0]?.type, 'route');
  assert.equal(events[0]?.route, 'deflect');
  assert.ok(events.some(event => event.type === 'token' && event.text.length > 0));
  assert.equal(events.at(-1)?.type, 'done');
  assert.ok(!events.some(event => event.type === 'error'));
});
mkdirSync('docs', { recursive: true });
const report = { at: new Date().toISOString(), origin: origin.origin, scope: 'HTTP delivery and deterministic policy stream; not live provider or unbuffered streaming proof', results };
writeFileSync('docs/release-smoke.json', JSON.stringify(report, null, 2) + '\n');
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.path} ${result.ms}ms${result.error ? ' ' + result.error : ''}`);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
