import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function inputs(operation) {
  return {
    artifact: {
      pins: { columns: [{ name: 'required_proof_classes' }], sourceEnumerations: [] },
      operations: [operation],
      sequences: [],
      steps: [],
      sections: [],
    },
    treeManifest: {},
    allocateManifest: {},
    packages: [],
    readings: {},
  };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function propertyOf(operation) {
  return deriveObligations(inputs(operation))
    .find((entry) => entry.id === 'PROP:OpA:required_proof_classes');
}

// @verifies C004
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('an empty pinned column is an open property obligation', () => {
  const obligation = propertyOf({
    id: 'OpA',
    disposition: 'active',
    required_proof_classes: [],
  });
  assert.notEqual(obligation, undefined);
  assert.equal(obligation.state, 'open');
  assert.equal(obligation.predicate, 'judgment:property');
});

// @verifies C004
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a column-specific grounding citation closes the property as not applicable', () => {
  const obligation = propertyOf({
    id: 'OpA',
    disposition: 'active',
    required_proof_classes: [],
    grounding: {
      properties: {
        required_proof_classes: {
          classification: 'grounded_absent',
          line: 5,
          quote: 'the specification states no proof class',
        },
      },
    },
  });
  assert.equal(obligation.state, 'not_applicable');
  assert.equal(obligation.reason, 'GROUNDED_ABSENT');
});

// @verifies C004
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('an operation-level grounding does not stand in for a column citation', () => {
  const obligation = propertyOf({
    id: 'OpA',
    disposition: 'active',
    required_proof_classes: [],
    grounding: {
      classification: 'object_type_not_an_operation',
      line: 5,
      quote: 'the object is not an operation',
    },
  });
  assert.equal(obligation.state, 'open');
});

// @verifies C004
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a present value creates no property obligation', () => {
  const obligation = propertyOf({
    id: 'OpA',
    disposition: 'active',
    required_proof_classes: ['proof'],
  });
  assert.equal(obligation, undefined);
});
