// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
// PX-310 @verifies C002
// A legacy v3 fact carries no typed origin. The checker must infer it from the
// operation row, the contract registry, or the step quote instead of rejecting
// facts whose text is a projection of a typed row.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATION_FACT_FIELDS,
  resolveFactOrigin,
  typedFactSupports,
} from '../../.claude/scripts/smooth-sequences/lib/fact-origin.mjs';

test('C002 a legacy session_binding fact resolves through the operation boolean', () => {
  const fact = { factId: 'session_binding', text: 'a session binding is required' };
  const operation = { requires_session_binding: true };
  assert.equal(resolveFactOrigin(fact, { operation }), 'operation');
  assert.equal(
    typedFactSupports(fact, 'operation', { operation }),
    true,
  );
});

test('C002 a false boolean does not support a positive requirement phrase', () => {
  const fact = { factId: 'remote_time_handshake', text: 'a remote time handshake is required' };
  const operation = { requires_remote_time_handshake: false };
  assert.equal(typedFactSupports(fact, 'operation', { operation }), false);
});

test('C002 a legacy boundary fact resolves through the contract registry text', () => {
  const fact = { factId: 'boundary:boundary-005/entailment/0', text: 'the clause must hold' };
  const contractRegistry = [{ boundary_id: 'boundary-005', clauses: { entailment: ['the clause must hold'] } }];
  assert.equal(resolveFactOrigin(fact, { contractRegistry }), 'contract_registry');
  assert.equal(typedFactSupports(fact, 'contract_registry', { contractRegistry }), true);
});

test('C002 an unsupported prose fact stays unowned', () => {
  const fact = { factId: 'prose:x:0', text: 'a sentence no row carries' };
  const operation = {};
  const contractRegistry = [];
  assert.equal(resolveFactOrigin(fact, { operation, contractRegistry, step: { quote: 'unrelated' } }), null);
  assert.equal(typedFactSupports(fact, 'operation', { operation }), false);
});

test('C002 the fixed operation field table names every legacy family', () => {
  assert.equal(OPERATION_FACT_FIELDS.session_binding, 'requires_session_binding');
  assert.equal(OPERATION_FACT_FIELDS.remote_time_handshake, 'requires_remote_time_handshake');
  assert.equal(OPERATION_FACT_FIELDS.pre_state_checkpoint, 'required_pre_state_checkpoint');
});
