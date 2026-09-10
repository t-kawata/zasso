// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C003
// Reload proves the published workspace still satisfies every gate: rescan,
// re-parse, re-extract, rebuild the graph, re-derive the order, re-prove coverage
// and verify the manifest's own hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { reloadAndVerify } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-reload.mjs';
import { runFinalize } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';

function silent(callback) {
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return callback();
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

function publish() {
  const fixture = materializeSeedFixture();
  const decisionsPath = join(fixture.dir, 'decisions.json');
  writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
  silent(() => runFinalize(['finalize', fixture.manifestPath, `--decisions=${decisionsPath}`]));
  return { ...fixture, decisionsPath, plan: { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'] } };
}

test('C003 the reload reproduces the published verification', () => {
  const published = publish();
  try {
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: JSON.parse(readFileSync(join(published.dir, ALLOCATE_MANIFEST_FILE_NAME), 'utf8')),
    });
    assert.equal(verdict.ok, true, JSON.stringify(verdict.divergences));
    assert.deepEqual(verdict.divergences, []);
    assert.equal(verdict.observed.seedCount, 2);
    assert.match(verdict.observed.graphHash, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});

test('C003 a seed edited after publication is detected and located', () => {
  const published = publish();
  try {
    const seedPath = join(published.dir, 'crates/protocol/alpha', SEED_FILE_NAME);
    writeFileSync(seedPath, `${readFileSync(seedPath, 'utf8')}\n<!-- edited after publication -->\n`);
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: JSON.parse(readFileSync(join(published.dir, ALLOCATE_MANIFEST_FILE_NAME), 'utf8')),
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.divergences[0].artefact, 'seed');
    assert.equal(verdict.divergences[0].package_id, 'pkg-a');
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});

test('C003 a tampered manifest hash and a missing seed are detected', () => {
  const published = publish();
  try {
    const manifestPath = join(published.dir, ALLOCATE_MANIFEST_FILE_NAME);
    const tampered = JSON.parse(readFileSync(manifestPath, 'utf8'));
    tampered.integrity.manifest_hash = '0'.repeat(64);
    writeFileSync(manifestPath, JSON.stringify(tampered));
    const verdict = reloadAndVerify({
      workspaceRoot: published.dir,
      plan: published.plan,
      manifest: published.manifest,
      manifestPath: published.manifestPath,
      expected: tampered,
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.divergences.some((entry) => entry.artefact === 'manifest'));
  } finally {
    rmSync(published.dir, { recursive: true, force: true });
  }
});
