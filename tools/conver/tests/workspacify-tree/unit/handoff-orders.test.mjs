// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C005
// The hand-off carries two different orders and they must not be conflated:
// contract_definition_order orders contract items, while
// dependencies.dag.implementation_order orders packages (providers first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';
import { buildValidTreeManifest, materializeTreeFixture } from '../helpers/build-valid-tree-manifest.mjs';

function clone(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

test('C005 a well-formed hand-off passes the entry gate', () => {
  const fixture = materializeTreeFixture();
  try {
    const gate = checkTreeEntryGate(fixture.manifest, fixture.specPath);
    assert.equal(gate.ok, true, JSON.stringify(gate.errors));
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C005 contract_definition_order must permute the declared contract items', () => {
  const { manifest } = buildValidTreeManifest();
  const base = materializeTreeFixture();
  try {
    const emptied = clone(manifest);
    emptied.stage2_handoff.contract_definition_order = [];
    const emptyGate = checkTreeEntryGate(emptied, base.specPath);
    assert.equal(emptyGate.ok, false);
    assert.ok(emptyGate.errors.some((message) => message.includes('contract_definition_order')), JSON.stringify(emptyGate.errors));

    const foreign = clone(manifest);
    foreign.stage2_handoff.contract_definition_order = ['obj-999999'];
    assert.ok(checkTreeEntryGate(foreign, base.specPath).errors.some((message) => message.includes('contract_definition_order')));

    const duplicated = clone(manifest);
    duplicated.stage2_handoff.contract_definition_order = ['obj-000001', 'obj-000001'];
    assert.ok(checkTreeEntryGate(duplicated, base.specPath).errors.some((message) => message.includes('contract_definition_order')));
  } finally {
    rmSync(base.dir, { recursive: true, force: true });
  }
});

test('C005 implementation_order must place every provider before its consumer', () => {
  const { manifest } = buildValidTreeManifest();
  const base = materializeTreeFixture();
  try {
    const consumerFirst = clone(manifest);
    consumerFirst.dependencies.dag.implementation_order = { serial: ['pkg-beta', 'pkg-alpha'], levels: [['pkg-beta'], ['pkg-alpha']] };
    const gate = checkTreeEntryGate(consumerFirst, base.specPath);
    assert.equal(gate.ok, false);
    assert.ok(gate.errors.some((message) => message.includes('implementation_order')), JSON.stringify(gate.errors));

    const wrongPartition = clone(manifest);
    wrongPartition.dependencies.dag.implementation_order = { serial: ['pkg-alpha', 'pkg-beta'], levels: [['pkg-alpha', 'pkg-beta']] };
    assert.equal(checkTreeEntryGate(wrongPartition, base.specPath).ok, false);

    const missingProof = clone(manifest);
    delete missingProof.dependencies.dag;
    assert.ok(checkTreeEntryGate(missingProof, base.specPath).errors.some((message) => message.includes('dag')));
  } finally {
    rmSync(base.dir, { recursive: true, force: true });
  }
});

test('C005 contract_boundaries must mirror the dependency boundaries one to one', () => {
  const { manifest, boundaries } = buildValidTreeManifest();
  const base = materializeTreeFixture();
  try {
    assert.equal(manifest.stage2_handoff.contract_boundaries.length, boundaries.length);

    const missing = clone(manifest);
    missing.stage2_handoff.contract_boundaries = [];
    assert.ok(checkTreeEntryGate(missing, base.specPath).errors.some((message) => message.includes('contract_boundaries')));

    const extra = clone(manifest);
    extra.stage2_handoff.contract_boundaries = [
      ...extra.stage2_handoff.contract_boundaries,
      { id: 'boundary-999', consumer_package: 'pkg-beta', provider_package: 'pkg-alpha', stage2_contract_scope: ['input'] },
    ];
    assert.ok(checkTreeEntryGate(extra, base.specPath).errors.some((message) => message.includes('contract_boundaries')));
  } finally {
    rmSync(base.dir, { recursive: true, force: true });
  }
});

test('C005 every dependency boundary declares the five core clauses', () => {
  const { manifest } = buildValidTreeManifest();
  for (const boundary of manifest.dependencies.boundaries) {
    for (const clause of ['input', 'output', 'preconditions', 'postconditions', 'invariants']) {
      assert.ok(boundary.stage2_contract_scope.includes(clause), `${boundary.id} must declare ${clause}`);
    }
  }
});

test('C005 a boundary scope with an unknown, repeated or missing core clause is rejected', () => {
  const { manifest } = buildValidTreeManifest();
  const base = materializeTreeFixture();
  try {
    const unknownClause = clone(manifest);
    unknownClause.dependencies.boundaries[0].stage2_contract_scope = ['input', 'output', 'preconditions', 'postconditions', 'invariants', 'telepathy'];
    const unknownGate = checkTreeEntryGate(unknownClause, base.specPath);
    assert.equal(unknownGate.ok, false);
    assert.ok(unknownGate.errors.some((message) => message.includes('unknown clause "telepathy"')), JSON.stringify(unknownGate.errors));

    const repeatedClause = clone(manifest);
    repeatedClause.dependencies.boundaries[0].stage2_contract_scope = ['input', 'input', 'output', 'preconditions', 'postconditions', 'invariants'];
    assert.ok(checkTreeEntryGate(repeatedClause, base.specPath).errors.some((message) => message.includes('repeats the clause "input"')));

    const missingCore = clone(manifest);
    missingCore.dependencies.boundaries[0].stage2_contract_scope = ['input', 'output'];
    assert.ok(checkTreeEntryGate(missingCore, base.specPath).errors.some((message) => message.includes('missing the core clause "preconditions"')));
  } finally {
    rmSync(base.dir, { recursive: true, force: true });
  }
});

test('C005 a malformed order or scope shape is reported rather than ignored', () => {
  const { manifest } = buildValidTreeManifest();
  const base = materializeTreeFixture();
  try {
    const noOrder = clone(manifest);
    delete noOrder.dependencies.dag.implementation_order;
    assert.ok(checkTreeEntryGate(noOrder, base.specPath).errors.some((message) => message.includes('must carry serial and levels')));

    const unsortedLevel = clone(manifest);
    unsortedLevel.dependencies.dag.implementation_order = { serial: ['pkg-beta', 'pkg-alpha'], levels: [['pkg-beta', 'pkg-alpha']] };
    assert.ok(checkTreeEntryGate(unsortedLevel, base.specPath).errors.some((message) => message.includes('sorted by package id')));

    const noMirror = clone(manifest);
    delete noMirror.stage2_handoff.contract_boundaries;
    assert.ok(checkTreeEntryGate(noMirror, base.specPath).errors.some((message) => message.includes('contract arrays must be present')));

    const noInventory = clone(manifest);
    noInventory.inventory = { objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [], terms: [], normalization_decisions: [], unresolved_candidates: [] };
    assert.equal(checkTreeEntryGate(noInventory, base.specPath).errors.some((message) => message.includes('contract_definition_order')), false);
  } finally {
    rmSync(base.dir, { recursive: true, force: true });
  }
});
