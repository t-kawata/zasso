import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openTransaction } from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import { materializeChainWorkspace } from './helpers/chain-fixture.mjs';

/** The two authored decisions documents a live workspace may carry. */
function writeLiveDecisions(root) {
  const allocatePath = join(root, 'workspacify/allocate/DECISIONS.json');
  const treePath = join(root, 'workspacify/tree/DECISIONS.json');
  mkdirSync(dirname(allocatePath), { recursive: true });
  mkdirSync(dirname(treePath), { recursive: true });
  writeFileSync(allocatePath, `${JSON.stringify({ version: 2, semantic_review: { status: 'APPROVED' } })}\n`);
  writeFileSync(treePath, `${JSON.stringify({ workspace: [], semantic_review: { status: 'APPROVED' } })}\n`);
  return { allocatePath, treePath };
}

test('a transaction without a decisions candidate inherits the live decisions', () => {
  const workspace = materializeChainWorkspace();
  try {
    const live = writeLiveDecisions(workspace.root);
    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: workspace.candidatePath,
      reason: 'inherit the live decisions',
    });

    assert.equal(
      readFileSync(join(opened.stagingRoot, 'workspacify/allocate/DECISIONS.json'), 'utf8'),
      readFileSync(live.allocatePath, 'utf8'),
    );
    assert.equal(
      readFileSync(join(opened.stagingRoot, 'workspacify/tree/DECISIONS.json'), 'utf8'),
      readFileSync(live.treePath, 'utf8'),
    );
  } finally {
    workspace.remove();
  }
});
