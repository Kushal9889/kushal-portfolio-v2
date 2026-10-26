import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyServerBundle } from '../scripts/verify-server-bundle.mjs';

for (const variant of ['valid', 'public', 'missing-facts', 'missing-traces']) test(`server bundle: ${variant}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-gate-'));
  try {
    mkdirSync(join(root, '.next'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content/facts.md'), 'fixture');
    const entries = variant === 'public' ? ['../public/frame.webp'] : variant === 'missing-facts' ? ['../package.json'] : ['../content/facts.md'];
    writeFileSync(join(root, 'package.json'), '{}');
    if (variant !== 'missing-traces') writeFileSync(join(root, '.next/route.nft.json'), JSON.stringify({ files: entries }));
    if (variant === 'valid') assert.equal(verifyServerBundle(root).bytes, 7);
    else assert.throws(() => verifyServerBundle(root), variant === 'public' ? /Non-runtime/ : variant === 'missing-facts' ? /facts missing/ : /No production/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
