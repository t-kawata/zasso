// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

/** The smallest workspace that reaches the boundary-clause loop. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function boundaryInputs(clauses) {
  return {
    census: { operations: [], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: { operations: [], sequences: [], steps: [] },
    treeManifest: {
      workspace: { packages: [] },
      dependencies: { boundaries: [{ id: 'b1' }] },
    },
    allocateManifest: {
      contract_registry: [{ boundary_id: 'b1', clauses }],
    },
    packages: [],
    readings: {},
  };
}

/** One obligation by id. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function obligationOf(clauses, id) {
  return deriveObligations(boundaryInputs(clauses)).find((entry) => entry.id === id);
}

test('C005 an empty clauses object keeps the boundary obligation open', () => {
  const entry = obligationOf({}, 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'open');
  assert.notEqual(entry.reason, 'DECLARED_NOT_APPLICABLE');
});

test('C005 an explicitly declared non-applicable kind closes only that kind', () => {
  const errors = obligationOf({ notApplicable: ['ERRORS'] }, 'JUDGE:ERRORS:b1');
  const tests = obligationOf({ notApplicable: ['ERRORS'] }, 'JUDGE:TESTS:b1');
  assert.equal(errors.state, 'not_applicable');
  assert.equal(errors.reason, 'DECLARED_NOT_APPLICABLE');
  assert.equal(tests.state, 'open');
});

test('C005 an empty array is not a non-applicable declaration', () => {
  const entry = obligationOf({ errors: [] }, 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'open');
});

test('C005 a clause value is still resolved and closes through its decision', () => {
  const entry = obligationOf({ errors: ['InvalidSig'] }, 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'open');
  assert.notEqual(entry.reason, 'DECLARED_NOT_APPLICABLE');
});
