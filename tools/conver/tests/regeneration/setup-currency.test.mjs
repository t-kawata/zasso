import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestOf } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { runSetup } from '../../.claude/scripts/regeneration/lib/transaction.mjs';

const STALE_DIGEST = '0'.repeat(64);
const EDUSE_BEGIN = 'educe-sequences/rail/phase.mjs';

/** A staging root with one spec and the fixed tree manifest setup reads back. */
function stagingWithSpec() {
  const directory = mkdtempSync(join(tmpdir(), 'conver-setup-'));
  const specPath = join(directory, 'spec.md');
  writeFileSync(specPath, '# spec\n');
  writeFileSync(join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ workspace: { packages: [] } }));
  return { directory, specPath };
}

/** Write the one artifact recording the digest the caller names. */
function writeArtifact(directory, specDigest) {
  writeFileSync(join(directory, 'Plan-sequences.json'), JSON.stringify({ spec: { sha256: specDigest } }));
}

/** A producer runner that records every script and reports success. */
function recordingRunner(calls) {
  return (cwd, script, args) => {
    calls.push({ script, args });
    return { ok: true, stdout: '', stderr: '' };
  };
}

test('setup skips the educe generation when the staged artifact already records the spec', () => {
  const { directory, specPath } = stagingWithSpec();
  const calls = [];
  try {
    writeArtifact(directory, digestOf(specPath));
    const result = runSetup({
      root: directory,
      stagingRoot: directory,
      candidateSpec: specPath,
      runNodeFn: recordingRunner(calls),
    });

    assert.equal(result.ok, true);
    assert.equal(calls.some(({ script }) => script === EDUSE_BEGIN), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('setup begins a new educe generation when the staged artifact records another spec', () => {
  const { directory, specPath } = stagingWithSpec();
  const calls = [];
  try {
    writeArtifact(directory, STALE_DIGEST);
    const result = runSetup({
      root: directory,
      stagingRoot: directory,
      candidateSpec: specPath,
      runNodeFn: recordingRunner(calls),
    });

    assert.equal(result.ok, true);
    assert.equal(calls.some(({ script }) => script === EDUSE_BEGIN), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
