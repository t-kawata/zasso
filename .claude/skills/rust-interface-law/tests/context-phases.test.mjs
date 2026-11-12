import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'scripts/cli.mjs');

function makeManifest(dir) {
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify({
    phases: ['contract', 'adapter', 'docs'],
    units: [{ id: 'app-rest', role: 'rest', interfaces: ['rest'] }],
    root: dir,
    roles: {},
    nodes: [
      { id: 'C-1', type: 'CodeBlock', phase: 'contract', delivery: 'must', applies_to: 'all', content_sha256: 'a'.repeat(64), body: 'contract body' },
      { id: 'A-1', type: 'Rule', phase: 'adapter', delivery: 'must', applies_to: 'rest', content_sha256: 'b'.repeat(64), body: '| `REST-01` | C | rest | REST | P | adapter rule | V1 | test |' },
      { id: 'D-1', type: 'Rule', phase: 'docs', delivery: 'must', applies_to: 'all', content_sha256: 'c'.repeat(64), body: '| `DOC-01` | G | docs | DOC | P | docs rule | V2 | test |' },
    ],
  }));
  return path;
}

test('context --phases delivers only requested phases in manifest order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'law-phases-'));
  try {
    const manifest = makeManifest(dir);
    const ledger = join(dir, 'ledger.json');

    execFileSync(process.execPath, [cli, 'context', '--manifest', manifest, '--phase', 'contract', '--ledger', ledger], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = execFileSync(process.execPath, [
      cli, 'context', '--manifest', manifest, '--phases', 'docs,adapter', '--ledger', ledger,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    assert.match(output, /adapter phase/);
    assert.match(output, /docs phase/);
    assert.ok(output.indexOf('adapter phase') < output.indexOf('docs phase'));
    assert.doesNotMatch(output, /contract body/);

    const state = JSON.parse(readFileSync(ledger, 'utf8'));
    assert.deepEqual(state.phases, ['contract', 'adapter', 'docs']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('context --phases fails when a predecessor is not delivered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'law-phases-'));
  try {
    const manifest = makeManifest(dir);
    const ledger = join(dir, 'ledger.json');
    assert.throws(
      () => execFileSync(process.execPath, [
        cli, 'context', '--manifest', manifest, '--phases', 'adapter', '--ledger', ledger,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      (error) => /predecessor phase not delivered/.test(String(error.stderr)),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
