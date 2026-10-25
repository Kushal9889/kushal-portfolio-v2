import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyServerBundle(root = process.cwd()) {
  const build = join(root, '.next');
  const traces = readdirSync(build, { recursive: true }).filter(name => name.endsWith('.nft.json') && !name.startsWith('standalone/'));
  assert.ok(traces.length > 0, 'No production output traces; build first');
  const files = new Set();
  for (const name of traces) {
    const trace = join(build, name);
    const entries = JSON.parse(readFileSync(trace, 'utf8')).files;
    assert.ok(Array.isArray(entries) && entries.length > 0, `Empty trace: ${name}`);
    for (const entry of entries) {
      const path = resolve(dirname(trace), entry);
      const local = relative(root, path).split(sep).join('/');
      assert.ok(!/^(public|docs|\.claude|\.netlify|\.cache|tests|scripts|release)\//.test(local), `Non-runtime file in server trace: ${local}`);
      files.add(path);
    }
  }
  let bytes = 0;
  for (const path of files) bytes += statSync(path).size;
  assert.ok(bytes <= 200 * 1024 * 1024, `Server traces ${bytes} bytes exceed 200 MiB budget`);
  assert.ok(files.has(join(root, 'content/facts.md')), 'Runtime facts missing from server traces');
  return { traces: traces.length, files: files.size, bytes, budgetBytes: 200 * 1024 * 1024 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyServerBundle(), null, 2));
}
