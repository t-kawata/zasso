// PX-307 @verifies C001
// The view is the package's share of the sequences artifact. Before this ticket it
// carried ids only; these tests pin the obligation payload and the ordered steps that
// let every later layer say what a ticket must do.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPackageView } from '../../.claude/scripts/sequences-slice/lib/view.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureArtifact() {
  return {
    spec: { lines: 100 },
    operations: [{
      id: 'Produce',
      result_object_classes: ['Thing'],
      kind: 'command',
      purpose: 'produce a thing',
      required_authority: 'user',
      allowed_status_transitions: ['draft', 'placed'],
      idempotency_scope: 'request',
      finality_predicate: 'placed',
      cancellation_rule: 'before placement',
      reversal_or_recovery_rule: 'compensate',
      reject_code_families: ['invalid'],
      boundary_effects: [],
      evidence: { spec_lines: [12] },
    }],
    sequences: [{ id: 'A-1', outcome: 'direct' }],
    steps: [{
      id: 's1',
      sequence: 'A-1',
      operation: 'Produce',
      subject: 'user',
      predicate: 'produces',
      object: 'Thing',
      contract: { pre: [{ factId: 'authority', text: 'user is authorized' }], post: [] },
      contract_prose: 'the user produces a thing',
      line: 12,
      quote: 'The user produces a Thing.',
    }],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureTreeManifest() {
  return {
    inventory: { objects: [{ canonical_name: 'Thing', owner_package: 'pkg-1' }] },
    structure: { segments: [] },
  };
}

test('C001 an operation unit carries its implementation obligation', () => {
  const view = buildPackageView({ artifact: fixtureArtifact(), treeManifest: fixtureTreeManifest(), packageSegments: [] }, 'pkg-1');
  const operation = view.ownedOperationUnits.find((unit) => unit.unitId === 'op-Produce');
  assert.equal(operation.obligation.purpose, 'produce a thing');
  assert.equal(operation.obligation.requiredAuthority, 'user');
  assert.deepEqual(operation.obligation.allowedStatusTransitions, ['draft', 'placed']);
  assert.deepEqual(operation.obligation.specLines, [12]);
  assert.equal(operation.roleCandidate, 'implementer');
});

test('C001 an object-valued status graph reaches the operation obligation unchanged', () => {
  // The v3 artifact states the status graph as `status -> targets`, not as a flat list.
  // An array-only projection would replace it with an empty list, and the make brief
  // would then have no status contract to plan.
  const artifact = fixtureArtifact();
  artifact.operations[0].allowed_status_transitions = { draft: ['placed'], placed: [] };
  const view = buildPackageView({ artifact, treeManifest: fixtureTreeManifest(), packageSegments: [] }, 'pkg-1');
  const operation = view.ownedOperationUnits.find((unit) => unit.unitId === 'op-Produce');
  assert.deepEqual(operation.obligation.allowedStatusTransitions, { draft: ['placed'], placed: [] });
});

test('C001 a sequence unit carries its ordered steps with contract, line and quote', () => {
  const view = buildPackageView({ artifact: fixtureArtifact(), treeManifest: fixtureTreeManifest(), packageSegments: [] }, 'pkg-1');
  const sequence = view.ownedSequenceUnits.find((unit) => unit.unitId === 'seq-A-1');
  assert.equal(sequence.steps.length, 1);
  assert.equal(sequence.steps[0].stepId, 's1');
  assert.equal(sequence.steps[0].operationId, 'Produce');
  assert.equal(sequence.steps[0].contract.pre[0].factId, 'authority');
  assert.equal(sequence.steps[0].line, 12);
  assert.equal(sequence.steps[0].quote, 'The user produces a Thing.');
});

test('C001 the four unit arrays remain a partition', () => {
  const view = buildPackageView({ artifact: fixtureArtifact(), treeManifest: fixtureTreeManifest(), packageSegments: [] }, 'pkg-1');
  const all = [
    ...view.ownedOperationUnits,
    ...view.ownedSequenceUnits,
    ...view.crossBoundarySequenceUnits,
    ...view.obligationUnits,
  ];
  assert.equal(new Set(all.map((unit) => unit.unitId)).size, all.length);
});

test('C001 a multi-owner operation is marked undecided rather than guessed', () => {
  const artifact = fixtureArtifact();
  artifact.operations[0].result_object_classes = ['Thing', 'Other'];
  const treeManifest = {
    inventory: { objects: [
      { canonical_name: 'Thing', owner_package: 'pkg-1' },
      { canonical_name: 'Other', owner_package: 'pkg-2' },
    ] },
    structure: { segments: [] },
  };
  const view = buildPackageView({ artifact, treeManifest, packageSegments: [] }, 'pkg-1');
  const operation = view.ownedOperationUnits.find((unit) => unit.unitId === 'op-Produce');
  assert.deepEqual(operation.ownerPackageIds, ['pkg-1', 'pkg-2']);
  assert.equal(operation.roleCandidate, 'undecided');
});

test('C001 a cross-boundary sequence carries the same ordered steps', () => {
  const artifact = fixtureArtifact();
  artifact.operations.push({
    id: 'Consume',
    result_object_classes: ['Other'],
    kind: 'query',
    purpose: 'consume a thing',
    evidence: { spec_lines: [20] },
  });
  artifact.sequences = [{ id: 'A-1', outcome: 'direct' }];
  artifact.steps.push({
    id: 's2',
    sequence: 'A-1',
    operation: 'Consume',
    subject: 'other',
    predicate: 'consumes',
    object: 'Thing',
    contract: { pre: [], post: [] },
    line: 20,
    quote: 'The other consumes a Thing.',
  });
  const treeManifest = {
    inventory: { objects: [
      { canonical_name: 'Thing', owner_package: 'pkg-1' },
      { canonical_name: 'Other', owner_package: 'pkg-2' },
    ] },
    structure: { segments: [] },
  };
  const view = buildPackageView({ artifact, treeManifest, packageSegments: [] }, 'pkg-1');
  const shared = view.crossBoundarySequenceUnits.find((unit) => unit.unitId === 'xdir-A-1');
  assert.equal(shared.steps.length, 2);
  assert.deepEqual(shared.steps.map((step) => step.stepId), ['s1', 's2']);
});
