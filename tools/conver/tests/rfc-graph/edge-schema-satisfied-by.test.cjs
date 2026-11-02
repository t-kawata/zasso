// PX-344 @verifies C001 @verifies C005
// The edge schema gains one optional field. It must accept a real link, reject an empty
// link, and keep rejecting unknown properties so the link cannot drift into a free-form
// bag of annotations.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { validateAgainstSchema } = require('../../.claude/scripts/rfc-graph/schema/validate');

const SCHEMAS_DIR = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/schema');

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function edgeWith(contract) {
  return {
    from: 'N0001',
    to: 'N0002',
    type: 'depends_on',
    attributes: { strength: 'hard', bidirectional: false },
    contracts: [{
      id: 'C001',
      precondition: 'init',
      postcondition: 'token issued',
      invariant: 'state',
      ...contract,
    }],
  };
}

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function validate(edge) {
  return validateAgainstSchema(edge, 'edge.schema.json', SCHEMAS_DIR);
}

describe('edge schema satisfiedBy', () => {
  it('accepts a contract with satisfiedBy', () => {
    const result = validate(edgeWith({ satisfiedBy: 'token issued' }));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it('accepts a contract without satisfiedBy', () => {
    const result = validate(edgeWith({}));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it('accepts a contract id as the satisfiedBy target', () => {
    const result = validate(edgeWith({ satisfiedBy: 'C001' }));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it('rejects an empty satisfiedBy', () => {
    const result = validate(edgeWith({ satisfiedBy: '' }));
    assert.equal(result.valid, false);
  });

  it('still rejects an unknown contract property', () => {
    const result = validate(edgeWith({ inventedLink: 'token issued' }));
    assert.equal(result.valid, false);
  });
});
