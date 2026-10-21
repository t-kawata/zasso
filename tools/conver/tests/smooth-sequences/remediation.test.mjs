import test from 'node:test';
import assert from 'node:assert/strict';

import { propertyObligations, reanchorInquest, uncoveredRecord } from '../../.claude/scripts/smooth-sequences/remediation.mjs';

// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
test('an object answer is anchored to a line that names the object', () => {
  const lines = ['nothing here', 'the AssetScore is recomputed by the verifier'];
  const [row] = reanchorInquest([{ subject: '@object:AssetScore', line: 1, quote: 'nothing here', reader: 'old' }], lines);
  assert.equal(row.line, 2);
  assert.ok(row.quote.includes('AssetScore'));
  assert.equal(row.anchor.quote, 'AssetScore');
  assert.equal(row.reader, 'remediation/PX-290');
  assert.equal(row.originalReader, 'old');
});

// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
test('an empty property becomes a closed grounded_absent obligation', () => {
  const artifact = {
    pins: { columns: [{ name: 'required_proof_classes' }, { name: 'purpose' }] },
    operations: [{ id: 'OpA', disposition: 'active', purpose: 'the act', required_proof_classes: [] }],
  };
  const obligations = propertyObligations(artifact);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].id, 'PROP:OpA:required_proof_classes');
  assert.equal(obligations[0].state, 'closed');
});

// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
test('an operation with no span step becomes an escaped record with its artifact position', () => {
  const record = uncoveredRecord({
    id: 'RefundMaturityBond',
    position: 'excluded',
    grounding: { line: 12, note: 'the specification states no act' },
  }, ['line 1', 'line 2']);
  assert.equal(record.subject, 'RefundMaturityBond');
  assert.equal(record.outcome, 'escaped');
  assert.equal(record.position, 'excluded');
  assert.equal(record.line, 12);
  assert.equal(record.why, 'the specification states no act');
});
