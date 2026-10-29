// @verifies C011
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
test('the report labels every denominator component', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runCommand([workspace.root, '--audit']);
    assert.deepEqual(result.report.denominator.operations, { all: 2, active: 2 });
    assert.equal(result.report.denominator.sequences.realized, 1);
    assert.equal(result.report.denominator.sequences.entryRegions, 1);
    assert.equal(result.report.denominator.sequences.source, 'artifact');
    assert.equal(result.report.denominator.boundaries, 1);
    assert.deepEqual(result.report.denominator.surfaces, { requiredInterfaces: 3, demandColumns: 3 });
  } finally {
    workspace.remove();
  }
});
