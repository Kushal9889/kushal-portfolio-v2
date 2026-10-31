import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const run = promisify(execFile);
const script = resolve('scripts/release-smoke.mjs');
for (const fault of [null, 'pdf', 'stream']) test(`release smoke ${fault ? 'rejects ' + fault + ' corruption' : 'accepts valid delivery'}`, async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, passages: 20 }));
    }
    if (req.url.endsWith('.pdf')) {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      return res.end(fault === 'pdf' ? '<html>missing</html>' : '%PDF-fixture');
    }
    if (req.url.startsWith('/api/agent/stream')) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'fixture' });
      return res.end(fault === 'stream' ? 'data: {broken\n\n' : [
        { type: 'route', route: 'deflect' }, { type: 'token', text: 'Policy answer' }, { type: 'done' },
      ].map(e => `data: ${JSON.stringify(e)}\n\n`).join(''));
    }
    res.writeHead(200, { 'content-type': req.url === '/llms.txt' ? 'text/plain' : 'text/html' });
    res.end('Kushal Gaddamwar');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'release-smoke-'));
  try {
    const execution = run(process.execPath, [script, `http://127.0.0.1:${server.address().port}`], { cwd: directory });
    if (fault) await assert.rejects(execution, error => error.code === 1 && error.stdout.includes('FAIL'));
    else assert.match((await execution).stdout, /PASS/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
