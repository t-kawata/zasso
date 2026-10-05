// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
// PX-233 @verifies C005
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * What the readers of those artifacts still read.
 *
 * Freezing the file set says an artifact was not added or dropped. It does not say
 * the artifact still holds what its reader looks for — a tree whose resolution
 * record lost its shape would keep the file and break `/generate-checklist`, and a
 * preflight that stopped emitting a variable would keep its exit code and break
 * Step 1 silently. These three consumers are the ones the next ticket's edit sits
 * closest to, so each is exercised end to end rather than described.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkIoStubs,
  disposeFixture,
  generateChecklist,
  materializeDrillWorkspace,
  materializeGrillFixture,
  readTree,
  runDrillPreflight,
} from '../helpers/fixture-workspace.mjs';

const VARIABLE_KEYS = ['RFC_PATH', 'RFC_DIR', 'GRAPH_PATH', 'DIRS_TREE_PATH', 'README_PATH', 'TICKETS_PATH'];

test('C005 postcondition: generate-checklist.js still renders a resolved node as a checked section', () => {
  const fixture = materializeGrillFixture({ seedResolvedNode: true });
  try {
    // The title is read off the tree the fixture wrote rather than restated here:
    // the property under test is "the node's title reaches the checklist", and a
    // literal would be asserting the fixture instead of the generator.
    const title = readTree(fixture.rfcDir).nodes[0].title;
    const checklist = generateChecklist(fixture.rfcDir);

    assert.ok(checklist.includes(title), 'the node title reaches the checklist');
    assert.match(checklist, /✅/, 'a resolved node is marked resolved');
    assert.doesNotMatch(checklist, /🔲/, 'no node is left open in this fixture');
  } finally {
    disposeFixture(fixture);
  }
});

test('C005 postcondition: check-io-stubs.js still exits 0 on an RFC carrying no marker', () => {
  const fixture = materializeGrillFixture();
  try {
    assert.equal(checkIoStubs(fixture.rfcPath), 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('C005 postcondition: drill preflight still emits the six pipeline variables Step 1 binds', () => {
  const workspace = materializeDrillWorkspace();
  try {
    const output = runDrillPreflight(workspace);
    const block = output.slice(output.indexOf('[VARIABLES]'), output.indexOf('[END VARIABLES]'));

    assert.notEqual(block, '', 'the [VARIABLES] block is emitted');
    for (const key of VARIABLE_KEYS) {
      assert.match(block, new RegExp(`^${key}=`, 'm'), `${key} is still emitted`);
    }
  } finally {
    disposeFixture(workspace);
  }
});
