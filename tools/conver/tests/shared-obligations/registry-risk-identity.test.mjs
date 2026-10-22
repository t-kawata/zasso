// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C006: one open obligation per (operation, artifact field).
//
// idempotency and replay both read idempotency_scope. Emitting one obligation
// per class asked two readings of one field, so one judgment could cite the
// same value twice under two truncations.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';
import { riskFieldForClass } from '../../.claude/scripts/shared-obligations/risk-fields.mjs';

// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function riskInputs(operation) {
  return {
    census: { operations: [operation.id], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: { operations: [operation], sequences: [], steps: [] },
    treeManifest: { workspace: { packages: [] }, dependencies: { boundaries: [] } },
    allocateManifest: { contract_registry: [] },
    packages: [],
    readings: {},
  };
}

test('C006 a state-mutating operation emits one claim per artifact field', () => {
  const obligations = deriveObligations(riskInputs({
    id: 'OpA',
    disposition: 'active',
    mutates_protocol_state: true,
  }));
  const risks = obligations.filter((entry) => entry.id.startsWith('RISK:OpA:'));

  assert.deepEqual(
    risks.map((entry) => entry.id),
    ['RISK:OpA:concurrency', 'RISK:OpA:idempotency', 'RISK:OpA:partial-failure'],
  );
  assert.equal(risks.some((entry) => entry.id === 'RISK:OpA:replay'), false);
});

test('C006 the idempotency claim names replay and its field', () => {
  const obligations = deriveObligations(riskInputs({
    id: 'OpA',
    disposition: 'active',
    mutates_protocol_state: true,
  }));
  const claim = obligations.find((entry) => entry.id === 'RISK:OpA:idempotency').claim;

  assert.match(claim, /idempotency/);
  assert.match(claim, /replay/);
  assert.match(claim, /idempotency_scope/);
});

test('C006 no two open risk obligations for one operation resolve to one field', () => {
  const obligations = deriveObligations(riskInputs({
    id: 'OpA',
    disposition: 'active',
    mutates_protocol_state: true,
    external_dependency_class: 'remote-ledger',
  }));
  const fields = obligations
    .filter((entry) => entry.id.startsWith('RISK:OpA:') && entry.state === 'open')
    .map((entry) => riskFieldForClass(entry.id.split(':')[2]));

  assert.equal(new Set(fields).size, fields.length, 'two obligations name one artifact field');
});
