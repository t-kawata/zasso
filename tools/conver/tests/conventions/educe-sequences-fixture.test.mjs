// The fixture is frozen (PX-240, contract C006), and the committed record is anchored
// to the specification it was read from (contract C013).
//
// Two things are held here. Every byte beneath the frozen corpus is named by the
// manifest with its digest, so a hand-edited fixture fails rather than silently
// changing what the golden test measures. And the committed artifact records the digest
// of the committed specification, so the record cannot survive a change to the text it
// cites — which is the whole reason a citation is meaningful only against one revision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkRenderFreshness } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const FIXTURES = fileURLToPath(new URL('../educe-sequences/fixtures/', import.meta.url));
const CORPUS_ROOT = join(FIXTURES, 'gaia');
const MANIFEST_PATH = join(CORPUS_ROOT, 'MANIFEST.json');
const SPEC_PATH = join(FIXTURES, 'spec', 'ledger.md');
const GOLDEN_PATH = join(FIXTURES, 'spec', 'ledger-sequences.json');
const RENDER_PATH = join(FIXTURES, 'spec', 'ledger-sequences.md');

/** Every file beneath a root, as paths relative to it. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function filesBeneath(root, prefix = '') {
  const found = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(full).isDirectory()) found.push(...filesBeneath(full, relative));
    else found.push(relative);
  }
  return found;
}

test('C006 every file the manifest names exists at its recorded digest and length', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  for (const [name, record] of Object.entries(manifest.files)) {
    const body = readFileSync(join(CORPUS_ROOT, name));
    assert.equal(body.length, record.bytes, `${name} has ${body.length} bytes, not ${record.bytes}`);
    assert.equal(createHash('sha256').update(body).digest('hex'), record.sha256, name);
  }
});

test('C006 no file exists beneath the frozen root that the manifest does not name', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const named = new Set(Object.keys(manifest.files));
  const unnamed = filesBeneath(CORPUS_ROOT).filter((name) => name !== 'MANIFEST.json' && !named.has(name));

  assert.deepEqual(unnamed, [], 'an unnamed file is a fixture nobody is holding to anything');
});

test('C006 a fixture file altered by one byte fails the check and names the file', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const victim = 'GaiaSekkeiShiyousho_v32.md';
  const original = readFileSync(join(CORPUS_ROOT, victim));

  try {
    writeFileSync(join(CORPUS_ROOT, victim), Buffer.concat([original, Buffer.from('x')]));
    const drifted = Object.entries(manifest.files).filter(([name, record]) => {
      const body = readFileSync(join(CORPUS_ROOT, name));
      return createHash('sha256').update(body).digest('hex') !== record.sha256;
    });

    assert.deepEqual(drifted.map(([name]) => name), [victim]);
  } finally {
    writeFileSync(join(CORPUS_ROOT, victim), original);
  }
});

test('C013 the committed artifact records the digest of the committed specification', () => {
  const spec = readSpecification(SPEC_PATH);
  const recorded = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')).spec;

  assert.equal(recorded.sha256, spec.sha256);
  assert.equal(recorded.lines, spec.lineCount);
  assert.equal(recorded.path.includes('/Users/'), false, 'a recorded path names no machine');
});

test('C014 the committed rendering is byte-equal to a re-render of the committed artifact', () => {
  const artifact = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  assert.deepEqual(checkRenderFreshness({ artifact, committedPath: RENDER_PATH }).files, []);
});
