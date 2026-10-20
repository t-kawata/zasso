// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
/**
 * The counters the implementation order reads.
 *
 * A counter is provenance: it answers how many generations, sessions or distributions
 * happened. An absent, unreadable or malformed record is unknown, never a reason to stop
 * the plan, so every reader answers null instead of throwing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  educeGenerationOf,
  readCompletedSessions,
  readPackageDistribution,
  readRootEduceGeneration,
  readRootSmoothGeneration,
} from '../../../.claude/scripts/workspacify-order/lib/counters.mjs';
import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

/** A workspace with one package, so a counter document has a directory to sit in. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function workspaceWithPackage() {
  return materializeOrderWorkspace({ packages: ['pkg-0001'] });
}

test('C001 postcondition: the root educe and smooth generations are read from their run directories', () => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001'],
    rootCounters: { educe: 10, smooth: 2 },
  });
  try {
    assert.equal(readRootEduceGeneration(workspace.root), 10);
    assert.equal(readRootSmoothGeneration(workspace.root), 2);
  } finally {
    workspace.remove();
  }
});

test('C001 boundary: an absent, unreadable or zero generation is unknown', () => {
  const workspace = workspaceWithPackage();
  try {
    assert.equal(readRootEduceGeneration(workspace.root), null);
    assert.equal(readRootSmoothGeneration(workspace.root), null);

    mkdirSync(join(workspace.root, 'educe-sequences'), { recursive: true });
    mkdirSync(join(workspace.root, 'smooth-sequences'), { recursive: true });
    writeFileSync(join(workspace.root, 'educe-sequences', 'status.json'), '{not json');
    writeFileSync(join(workspace.root, 'smooth-sequences', 'status.json'), '{not json');
    assert.equal(readRootEduceGeneration(workspace.root), null);
    assert.equal(readRootSmoothGeneration(workspace.root), null);

    writeFileSync(join(workspace.root, 'educe-sequences', 'status.json'), JSON.stringify({ generation: 0, phases: [] }));
    writeFileSync(join(workspace.root, 'smooth-sequences', 'status.json'), JSON.stringify({ generation: 0 }));
    assert.equal(readRootEduceGeneration(workspace.root), null);
    assert.equal(readRootSmoothGeneration(workspace.root), null);
  } finally {
    workspace.remove();
  }
});

test('C001 invariant: an educe status with phases and no generation is generation 1', () => {
  assert.equal(educeGenerationOf({ phases: [{ id: 1 }] }), 1);
  assert.equal(educeGenerationOf({ generation: 0, phases: [{ id: 1 }] }), 1);
  assert.equal(educeGenerationOf({ generation: 0, phases: [] }), null);
  assert.equal(educeGenerationOf({ generation: 7, phases: [] }), 7);
  assert.equal(educeGenerationOf(null), null);
});

test('C002 postcondition: a non-negative completedSessions is known and every other value is unknown', () => {
  const workspace = workspaceWithPackage();
  try {
    const statusPath = workspace.statusPathOf('pkg-0001');
    writeFileSync(statusPath, JSON.stringify({ completedSessions: 3 }));
    assert.equal(readCompletedSessions(workspace.directoryOf('pkg-0001')), 3);
    writeFileSync(statusPath, JSON.stringify({ completedSessions: 0 }));
    assert.equal(readCompletedSessions(workspace.directoryOf('pkg-0001')), 0);
    for (const value of [-1, 1.5, '3', null]) {
      writeFileSync(statusPath, JSON.stringify({ completedSessions: value }));
      assert.equal(readCompletedSessions(workspace.directoryOf('pkg-0001')), null, String(value));
    }
  } finally {
    workspace.remove();
  }
});

test('C002 boundary: an unreadable or absent Status.json answers null', () => {
  const workspace = workspaceWithPackage();
  try {
    assert.equal(readCompletedSessions(workspace.directoryOf('pkg-0001')), null);
    writeFileSync(workspace.statusPathOf('pkg-0001'), '{not json');
    assert.equal(readCompletedSessions(workspace.directoryOf('pkg-0001')), null);
  } finally {
    workspace.remove();
  }
});

test('C003 postcondition: a valid distribution record is read and a malformed one is unknown', () => {
  const workspace = workspaceWithPackage();
  try {
    const recordPath = workspace.distributionPathOf('pkg-0001');
    writeFileSync(recordPath, JSON.stringify({ schemaVersion: 1, distributions: 3, digest: 'a'.repeat(64) }));
    assert.deepEqual(readPackageDistribution(workspace.directoryOf('pkg-0001')), { distributions: 3, digest: 'a'.repeat(64) });

    for (const record of [
      { schemaVersion: 2, distributions: 3, digest: 'a'.repeat(64) },
      { schemaVersion: 1, distributions: -1, digest: 'a'.repeat(64) },
      { schemaVersion: 1, distributions: 1.5, digest: 'a'.repeat(64) },
      { schemaVersion: 1, distributions: 3 },
    ]) {
      writeFileSync(recordPath, JSON.stringify(record));
      assert.equal(readPackageDistribution(workspace.directoryOf('pkg-0001')), null, JSON.stringify(record));
    }

    writeFileSync(recordPath, '{not json');
    assert.equal(readPackageDistribution(workspace.directoryOf('pkg-0001')), null);
  } finally {
    workspace.remove();
  }
});

test('C006 boundary: every reader is total on a missing directory', () => {
  assert.equal(readCompletedSessions('/tmp/px-282-no-such-directory'), null);
  assert.equal(readPackageDistribution('/tmp/px-282-no-such-directory'), null);
  assert.equal(readRootEduceGeneration('/tmp/px-282-no-such-root'), null);
  assert.equal(readRootSmoothGeneration('/tmp/px-282-no-such-root'), null);
});
