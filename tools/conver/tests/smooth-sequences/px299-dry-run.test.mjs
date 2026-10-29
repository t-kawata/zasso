// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
// The PX-299 worklist over corrected producer data: a grounded column and an
// out-of-scope clause must not reach the worklist as open questions.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

const CORE = ['input', 'output', 'preconditions', 'postconditions', 'invariants'];

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function inputs() {
  return {
    census: { operations: ['OpA'], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: {
      pins: { columns: [{ name: 'required_proof_classes', decidedBy: 'literalInLine' }] },
      operations: [{
        id: 'OpA',
        disposition: 'active',
        required_proof_classes: [],
        grounding: {
          properties: {
            required_proof_classes: {
              classification: 'designer_supplied',
              line: 1,
              quote: 'the proof classes are designer supplied',
            },
          },
        },
      }],
      sequences: [],
      steps: [],
    },
    treeManifest: {
      workspace: { packages: [] },
      dependencies: { boundaries: [{ id: 'b1', stage2_contract_scope: CORE }] },
    },
    allocateManifest: { contract_registry: [{ boundary_id: 'b1', clauses: {} }] },
    packages: [],
    readings: {},
  };
}

test('PX-299 dry run: a grounded pinned column is not an open property obligation', () => {
  const obligations = deriveObligations(inputs());
  const openProperties = obligations.filter((entry) => entry.id.startsWith('PROP:') && entry.state === 'open');
  assert.deepEqual(openProperties, []);

  const grounded = obligations.find((entry) => entry.id === 'PROP:OpA:required_proof_classes');
  assert.equal(grounded.state, 'not_applicable');
  assert.equal(grounded.reason, 'GROUNDED_ABSENT');
});

test('PX-299 dry run: an out-of-scope JUDGE clause is not an open question', () => {
  const obligations = deriveObligations(inputs());
  const openJudge = obligations.filter((entry) => entry.id.startsWith('JUDGE:') && entry.state === 'open');
  assert.deepEqual(
    openJudge.map((entry) => entry.id).sort(),
    ['JUDGE:INVARIANT:b1', 'JUDGE:TRANSLATION:b1'],
    'the two core-clause judgments stay open; the out-of-scope ones do not',
  );

  for (const clause of ['ERRORS', 'TESTS']) {
    const entry = obligations.find((candidate) => candidate.id === `JUDGE:${clause}:b1`);
    assert.equal(entry.state, 'not_applicable');
    assert.equal(entry.reason, 'OUT_OF_STAGE1_SCOPE');
  }
});
