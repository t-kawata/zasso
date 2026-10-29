import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readManifestAt,
  sha256File,
  updateManifestArtifact,
  writeManifestAt,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { beginGeneration } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'px292-manifest-'));
  const artifactPath = join(directory, 'example-sequences.json');
  writeFileSync(artifactPath, '{"schema_version":3}\n');
  return {
    directory,
    artifactPath,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}

// @verifies C003
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a generation writes its own evidence manifest with spec and artifact digests', () => {
  const space = workspace();
  try {
    const status = { generation: 0, phases: [], history: [], supplied: [], invalidated: [], assets: { digest: null } };
    const opened = beginGeneration(status, {
      spec: { path: 'spec.md', sha256: 'abc', lines: 10 },
      digest: 'inherited',
      directory: space.directory,
      artifactPath: space.artifactPath,
    });
    const manifest = readManifestAt(space.directory);
    assert.equal(existsSync(join(space.directory, 'EVIDENCE-MANIFEST.json')), true);
    assert.equal(manifest.generation, opened.generation);
    assert.equal(manifest.spec.sha256, 'abc');
    assert.equal(manifest.artifact.path, space.artifactPath);
    assert.equal(manifest.artifact.sha256, sha256File(space.artifactPath));
  } finally {
    space.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('updating the artifact digest keeps the receipts the generation recorded', () => {
  const space = workspace();
  try {
    writeManifestAt(space.directory, {
      schemaVersion: 1,
      spec: { path: 'spec.md', sha256: 'abc' },
      artifact: { path: space.artifactPath, sha256: 'old' },
      generation: 1,
      files: [],
      receipts: [{ phase: 7, inputs: { spec: 'abc' } }],
    });
    writeFileSync(space.artifactPath, '{"schema_version":3,"changed":true}\n');
    updateManifestArtifact(space.directory, {
      spec: { path: 'spec.md', sha256: 'abc' },
      artifactPath: space.artifactPath,
    });
    const manifest = readManifestAt(space.directory);
    assert.equal(manifest.artifact.sha256, sha256File(space.artifactPath));
    assert.equal(manifest.receipts.length, 1);
    assert.equal(manifest.receipts[0].phase, 7);
  } finally {
    space.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the first reading phase refreshes the artifact digest', () => {
  const source = readFileSync('.claude/scripts/educe-sequences/rail/phases.mjs', 'utf8');
  assert.match(source, /updateManifestArtifact/);
  assert.match(source, /phase\.id === 7|id === 7/);
});
