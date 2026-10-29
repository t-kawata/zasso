// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C004: a boundary obligation is open only when stage 1 declared its clause.
//
// The registry used to open TRANSLATION, INVARIANT, ERRORS and TESTS for every
// boundary. The 19 boundaries of the three unscoped connection kinds were
// therefore asked for clauses their own scope never named, and the worklist
// carried questions no contract could answer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

const CORE = ['input', 'output', 'preconditions', 'postconditions', 'invariants'];

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function boundaryInputs({ scope, notApplicable = [] }) {
  return {
    census: { operations: [], entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact: { operations: [], sequences: [], steps: [] },
    treeManifest: {
      workspace: { packages: [] },
      dependencies: { boundaries: [{ id: 'b1', stage2_contract_scope: scope }] },
    },
    allocateManifest: {
      contract_registry: [{
        boundary_id: 'b1',
        clauses: notApplicable.length === 0 ? {} : { notApplicable },
      }],
    },
    packages: [],
    readings: {},
  };
}

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function obligationOf(input, id) {
  return deriveObligations(input).find((entry) => entry.id === id);
}

test('C004 an in-scope clause produces an open obligation', () => {
  const entry = obligationOf(boundaryInputs({ scope: [...CORE, 'errors', 'tests'] }), 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'open');
  assert.equal(entry.reason, undefined);
});

test('C004 an out-of-scope clause is not applicable by scope, not by declaration', () => {
  const entry = obligationOf(boundaryInputs({ scope: CORE }), 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'not_applicable');
  assert.equal(entry.reason, 'OUT_OF_STAGE1_SCOPE');
});

test('C004 a declared notApplicable is distinct from an out-of-scope clause', () => {
  const declared = obligationOf(
    boundaryInputs({ scope: [...CORE, 'errors', 'tests'], notApplicable: ['errors'] }),
    'JUDGE:ERRORS:b1',
  );
  assert.equal(declared.state, 'not_applicable');
  assert.equal(declared.reason, 'DECLARED_NOT_APPLICABLE');
  assert.notEqual(declared.reason, 'OUT_OF_STAGE1_SCOPE');
});

test('C004 the uppercase declaration PX-297 recorded still closes the lowercase clause', () => {
  const entry = obligationOf(
    boundaryInputs({ scope: [...CORE, 'errors', 'tests'], notApplicable: ['ERRORS'] }),
    'JUDGE:ERRORS:b1',
  );
  assert.equal(entry.state, 'not_applicable');
  assert.equal(entry.reason, 'DECLARED_NOT_APPLICABLE');
});

test('C004 no JUDGE obligation is open outside the declared scope', () => {
  const obligations = deriveObligations(boundaryInputs({ scope: CORE }));
  const openJudge = obligations.filter((entry) => entry.id.startsWith('JUDGE:') && entry.state === 'open');
  const scopeOf = (id) => {
    const kind = id.split(':')[1];
    if (kind === 'ENTAILMENT') return ['preconditions', 'postconditions'];
    if (kind === 'TRANSLATION') return ['input', 'output'];
    if (kind === 'INVARIANT') return ['invariants'];
    return [kind.toLowerCase()];
  };

  assert.deepEqual(openJudge.map((entry) => entry.id).sort(), ['JUDGE:INVARIANT:b1', 'JUDGE:TRANSLATION:b1']);
  for (const entry of openJudge) {
    for (const clause of scopeOf(entry.id)) {
      assert.ok(CORE.includes(clause), `${entry.id} opens an out-of-scope clause`);
    }
  }
  for (const clause of ['ERRORS', 'TESTS']) {
    const entry = obligations.find((candidate) => candidate.id === `JUDGE:${clause}:b1`);
    assert.equal(entry.state, 'not_applicable');
    assert.equal(entry.reason, 'OUT_OF_STAGE1_SCOPE');
  }
});

test('C004 a boundary without a declared scope keeps its obligations open', () => {
  const inputs = boundaryInputs({ scope: CORE });
  delete inputs.treeManifest.dependencies.boundaries[0].stage2_contract_scope;
  const entry = obligationOf(inputs, 'JUDGE:ERRORS:b1');
  assert.equal(entry.state, 'open');
});
