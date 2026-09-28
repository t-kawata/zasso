// [::TICKET::] PX-219 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-219 --for-spec --no-implementation-order`.
// PX-219 @verifies C003 C004
/**
 * Publication and its undo, as unit cases.
 *
 * `publishWorkspace` places the tree, the seeds and the allocate manifest and can
 * undo a rename it already made; nothing could undo a publication that a later gate
 * refused. These cases pin the two halves separately: the names a publication places,
 * and the removal that restores the root it was placed into. The safety property they
 * exist for is the third case - an entry the root already held is never a candidate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  publishedTopLevelNames,
  rollbackPublication,
} from '../../../.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs';

// [::TICKET::] PX-219 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-219 --for-spec --no-implementation-order`.
function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

const PLAN = { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/gaia-soul'] };
const RENDERED = new Map([['pkg-0002', { package: { path: 'crates/protocol/gaia-soul' } }]]);

test('C003 publishedTopLevelNames names each top-level entry once, sorted', () => {
  assert.deepEqual(
    publishedTopLevelNames({ plan: PLAN, renderedByPackage: RENDERED }),
    ['WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates'],
  );
});

test('C003 publishedTopLevelNames tolerates a plan with no directories', () => {
  // The derivation guards `plan.relativeDirs` the way verifyStagedWorkspace, the
  // module's other reader of the same field, already did. A plan that carries no
  // directories still places the manifest, and nothing else.
  assert.deepEqual(
    publishedTopLevelNames({ plan: {}, renderedByPackage: new Map() }),
    ['WORKSPACIFY-ALLOCATE-MANIFEST.json'],
  );
});

test('C004 rollbackPublication removes the entries this run created', () => {
  const dir = tempDir('wt-roll-');
  try {
    mkdirSync(join(dir, 'crates/protocol/gaia-soul'), { recursive: true });
    writeFileSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}\n');
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: publishedTopLevelNames({ plan: PLAN, renderedByPackage: RENDERED }),
      preExistingEntries: new Set(),
    });
    assert.deepEqual(result.removed, ['WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates']);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 rollbackPublication never removes an entry that pre-existed the run', () => {
  const dir = tempDir('wt-roll2-');
  try {
    mkdirSync(join(dir, 'docs/archive'), { recursive: true });
    writeFileSync(join(dir, 'spec.md'), '# spec\n');
    mkdirSync(join(dir, 'crates'), { recursive: true });
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: ['crates', 'docs', 'spec.md'],
      preExistingEntries: new Set(['docs', 'spec.md']),
    });
    assert.deepEqual(result.removed, ['crates'], "pre-existing content is not this run's to delete");
    assert.deepEqual(readdirSync(dir).sort(), ['docs', 'spec.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 rollbackPublication reports nothing removed when it placed nothing', () => {
  const dir = tempDir('wt-roll3-');
  try {
    const result = rollbackPublication({
      manifestDir: dir,
      topLevelNames: ['crates'],
      preExistingEntries: new Set(),
    });
    assert.deepEqual(result.removed, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
