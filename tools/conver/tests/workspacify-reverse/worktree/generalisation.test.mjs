// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
// @verifies C001
/**
 * Worktree isolation, with the guard taken from the caller's subject.
 *
 * The isolation used to read its default guard out of `sandbox.mjs`'s
 * `PRODUCTION_PATHS` — the two paired trees of one experiment. That default was
 * never exercised by this suite: every case here passes its guarded paths
 * explicitly, which is why the constant could be deleted without a test turning
 * red. It is exercised now, so the default has somewhere to be wrong.
 *
 * Two claims are held apart.
 *
 * The first is that the guard is computed from the caller rather than read from a
 * constant. The digest of the experiment's guarded set, taken from the
 * declaration, must equal the digest of the same trees taken by name — so moving
 * the guard from a constant to a call site did not change its value. The paired
 * trees are 30,000 files, so the equality is proved over a synthetic pair of the
 * same shape and the experiment's own declaration is pinned separately by set
 * equality; what this ticket changed is the mechanism, not the bytes.
 *
 * The second is that a subject naming no guard still gets one: a caller who
 * declares nothing guards the subject itself, which is the tree the worktree was
 * cut from and the only tree a Red reconstruction could damage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestMainTree, withIsolatedWorktree } from '../../../.claude/scripts/workspacify-reverse/lib/worktree-isolation.mjs';
import { resolveGuardedPaths } from '../../../.claude/scripts/workspacify-reverse/lib/sandbox.mjs';
import { createGitBackedTree, createSyntheticTree } from '../helpers/scratch.mjs';

/**
 * The conver repository this suite belongs to, derived from this file rather than
 * from the cwd and normalized, because a guarded path is compared as a string.
 */
const CONVER_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

/** The two paired trees the experiment guards, named at the call site that guards them. */
const EXPERIMENT_PAIRED_TREES = Object.freeze(['siprs-with-4layers', 'siprs-for-reverse']);

test('UT-C001-inv the experiment guard computed from the caller equals the two paired trees', () => {
  const declared = resolveGuardedPaths({ subjectRoot: CONVER_ROOT, declared: EXPERIMENT_PAIRED_TREES });

  assert.deepEqual(
    declared,
    [...EXPERIMENT_PAIRED_TREES.map((name) => join(CONVER_ROOT, name)), CONVER_ROOT].sort(),
    'the experiment is guarded exactly as before: the two paired trees, computed from the caller',
  );
  assert.equal(
    declared.includes(join(CONVER_ROOT, 'siprs-for-reverse')),
    true,
    'the guard still names the reverse tree it was built for',
  );
});

test('UT-C001-inv a guard taken from a declaration digests the same as the same trees taken by name', () => {
  const subject = createSyntheticTree(
    { 'left/Cargo.toml': '[package]\nname = "left"\n', 'right/Cargo.toml': '[package]\nname = "right"\n' },
    { prefix: 'wsp-p23-5-pair-' },
  );
  const pairedTrees = ['left', 'right'];
  try {
    const declared = resolveGuardedPaths({ subjectRoot: subject.root, declared: pairedTrees });
    const byDeclaration = digestMainTree(declared);
    const byName = digestMainTree(pairedTrees.map((name) => join(subject.root, name)));

    for (const tree of Object.keys(byName)) {
      assert.deepEqual(
        byDeclaration[tree],
        byName[tree],
        'the guard moved from a constant to a call site without changing its value',
      );
    }
    assert.equal(Object.keys(byDeclaration).length, declared.length);
  } finally {
    subject.dispose();
  }
});

test('UT-C001-inv digestMainTree takes its guarded paths, so no default names a project', () => {
  assert.equal(digestMainTree.length, 1, 'a default parameter could not see the caller subject and would encode a constant');
});

test('UT-C001-inv withIsolatedWorktree guards the caller subject when none is declared', async () => {
  const tree = createGitBackedTree({ 'Cargo.toml': '[package]\nname = "pingable"\n' }, { prefix: 'wsp-p23-5-wt-' });
  try {
    const record = await withIsolatedWorktree(tree.root, async () => ({ redProved: true }));

    assert.deepEqual(Object.keys(record.mainTreeDigest.after), [tree.root]);
    assert.equal(record.mainTreeDigest.unchanged, true);
    assert.equal(record.restorationOutcome, 'destroyed');
  } finally {
    tree.dispose();
  }
});
