// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C003
// A coupling contract is only complete when its clause groups match the scope
// stage 1 declared for that boundary, with preconditions, postconditions and
// invariants always present.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContractEdge, validateContractEdge, canonicalizeClauses } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest } from '../helpers/build-valid-manifest.mjs';

function boundary() {
  return buildValidManifest().manifest.dependencies.boundaries[0];
}

function clauses(overrides = {}) {
  return {
    input: 'the alpha record as delivered by pkg-a',
    output: 'the alpha record after range validation',
    preconditions: ['the record exists in the stage-1 inventory'],
    postconditions: ['the record range is validated'],
    invariants: ['the record range is monotone'],
    errors: ['invalid range is reported as a rejection'],
    canonicalization: 'canonical JSON with sorted keys',
    tests: ['boundary range test'],
    ...overrides,
  };
}

test('C003 a contract edge is canonical, stable and clause-complete', () => {
  const edge = buildContractEdge({
    boundaryId: 'boundary-001',
    consumerPackage: 'pkg-b',
    providerPackage: 'pkg-a',
    direction: 'consumer_to_provider',
    connectionKind: 'value_only',
    owners: { semantic: 'pkg-a', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
    clauses: clauses(),
    sourceRefs: ['s-000002', 's-000001'],
  });

  assert.equal(edge.contract_id, 'contract-boundary-001');
  assert.deepEqual(edge.source_refs, ['s-000001', 's-000002'], 'source refs are canonicalised');
  assert.deepEqual(Object.keys(edge.clauses), ['canonicalization', 'errors', 'input', 'invariants', 'output', 'postconditions', 'preconditions', 'tests']);
  assert.equal(validateContractEdge(edge, boundary()).ok, true);

  const again = buildContractEdge({
    boundaryId: 'boundary-001', consumerPackage: 'pkg-b', providerPackage: 'pkg-a', direction: 'consumer_to_provider',
    connectionKind: 'value_only', owners: edge.owners, clauses: clauses(), sourceRefs: ['s-000001', 's-000002'],
  });
  assert.deepEqual(again, edge, 'building twice yields the identical edge');
});

test('C003 an unknown clause, a duplicate and a missing declaration are rejected', () => {
  const target = boundary();
  const edge = buildContractEdge({
    boundaryId: 'boundary-001', consumerPackage: 'pkg-b', providerPackage: 'pkg-a', direction: 'consumer_to_provider',
    connectionKind: 'value_only', owners: {}, clauses: clauses(), sourceRefs: ['s-000001'],
  });

  const unknown = validateContractEdge({ ...edge, clauses: { ...edge.clauses, telepathy: 'x' } }, target);
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.unknownClauses, ['telepathy']);

  const missingClauses = { ...edge.clauses };
  delete missingClauses.preconditions;
  const missing = validateContractEdge({ ...edge, clauses: missingClauses }, target);
  assert.equal(missing.ok, false);
  assert.ok(missing.missingClauses.includes('preconditions'));

  const emptyCore = validateContractEdge({ ...edge, clauses: { ...edge.clauses, invariants: '   ' } }, target);
  assert.equal(emptyCore.ok, false);
  assert.ok(emptyCore.emptyClauses.includes('invariants'));

  const notInScope = validateContractEdge(
    { ...edge, clauses: { ...edge.clauses, state_ownership: 'pkg-a owns state' } },
    { ...target, stage2_contract_scope: target.stage2_contract_scope.filter((clause) => clause !== 'state_ownership') },
  );
  assert.equal(notInScope.ok, false);
  assert.ok(notInScope.outOfScopeClauses.includes('state_ownership'));
});

test('C003 a contract edge carries the five owner slots, its paths and its source refs', () => {
  const consumerPath = 'crates/protocol/beta';
  const providerPath = 'crates/protocol/alpha';
  const edge = buildContractEdge({
    boundaryId: 'boundary-001', consumerPackage: 'pkg-b', providerPackage: 'pkg-a', direction: 'consumer_to_provider',
    consumerPath, providerPath,
    connectionKind: 'value_only', clauses: clauses(), sourceRefs: ['s-000001'],
    owners: { semantic: 'pkg-a', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' },
  });
  for (const slot of ['semantic', 'state', 'side_effect', 'port', 'adapter']) {
    assert.equal(typeof edge.owners[slot], 'string', `${slot} owner must be present`);
  }
  assert.deepEqual(edge.source_refs, ['s-000001']);
  assert.equal(edge.consumer_path, consumerPath);
  assert.equal(edge.provider_path, providerPath);
});

test('C003 canonicalizeClauses is deterministic and drops empty optional groups', () => {
  const canonical = canonicalizeClauses({ tests: ['b', 'a'], invariants: ['x'], input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], errors: [] });
  assert.deepEqual(Object.keys(canonical), ['input', 'invariants', 'output', 'postconditions', 'preconditions', 'tests']);
  assert.deepEqual(canonical.tests, ['a', 'b'], 'list clauses are sorted');
  assert.deepEqual(canonicalizeClauses({}), {});
});
