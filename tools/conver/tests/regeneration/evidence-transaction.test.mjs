import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveGeneration, openTransaction } from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import { materializeChainWorkspace } from './helpers/chain-fixture.mjs';

// [::TICKET::] PX-290 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-290 --for-spec --no-implementation-order`.
test('an evidence-only transaction stages the evidence and derives without the producers', () => {
  const workspace = materializeChainWorkspace();
  try {
    const directory = join(workspace.root, 'educe-sequences');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'EVIDENCE-MANIFEST.json'), '{"schemaVersion":1,"receipts":[]}\n');
    writeFileSync(join(directory, 'readings-uncovered.jsonl'), '{"subject":"OpA","outcome":"escaped"}\n');

    const opened = openTransaction({
      root: workspace.root,
      candidateEvidence: directory,
      reason: 'evidence remediation',
    });
    const derived = deriveGeneration({ root: workspace.root, transactionId: opened.transactionId });

    assert.equal(derived.state, 'derived');
    assert.equal(existsSync(join(opened.stagingRoot, 'educe-sequences', 'readings-uncovered.jsonl')), true);
    assert.equal(existsSync(join(opened.stagingRoot, 'WORKSPACIFY-TREE-MANIFEST.json')), true);
    assert.equal(existsSync(join(opened.stagingRoot, 'crates', 'alpha', 'SEQUENCES.json')), true);
  } finally {
    rmSync(`${workspace.root}.regeneration`, { recursive: true, force: true });
    workspace.remove();
  }
});
