// [::TICKET::] PX-193 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-193 --for-spec --no-implementation-order`.
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
      sides: {
        consumer: { packageId: 'pkg-b' },
        provider: { packageId: 'pkg-a' },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { owners: { semantic: 'pkg-a', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' }, clauses: clauses(), sourceRefs: ['s-000002', 's-000001'] },
    });

  assert.equal(edge.contract_id, 'contract-boundary-001');
  assert.deepEqual(edge.source_refs, ['s-000001', 's-000002'], 'source refs are canonicalised');
  assert.deepEqual(Object.keys(edge.clauses), ['canonicalization', 'errors', 'input', 'invariants', 'output', 'postconditions', 'preconditions', 'tests']);
  assert.equal(validateContractEdge(edge, boundary()).ok, true);

  const again = buildContractEdge({
      boundaryId: 'boundary-001',
      sides: {
        consumer: { packageId: 'pkg-b' },
        provider: { packageId: 'pkg-a' },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { owners: edge.owners, clauses: clauses(), sourceRefs: ['s-000001', 's-000002'] },
    });
  assert.deepEqual(again, edge, 'building twice yields the identical edge');
});

test('C003 a contract edge carries a source refs ground and omits it when absent', () => {
  const ground = 'the provider owns no inventory segment';
  const sides = {
    consumer: { packageId: 'pkg-b' },
    provider: { packageId: 'pkg-a' },
  };

  const grounded = buildContractEdge({ boundaryId: 'boundary-001', sides, content: { clauses: clauses(), sourceRefsGround: ground } });
  const plain = buildContractEdge({ boundaryId: 'boundary-001', sides, content: { clauses: clauses() } });

  assert.equal(grounded.source_refs_ground, ground);
  assert.equal('source_refs_ground' in plain, false, 'an absent ground adds no field');
});

test('C003 an unknown clause, a duplicate and a missing declaration are rejected', () => {
  const target = boundary();
  const edge = buildContractEdge({
      boundaryId: 'boundary-001',
      sides: {
        consumer: { packageId: 'pkg-b' },
        provider: { packageId: 'pkg-a' },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { owners: {}, clauses: clauses(), sourceRefs: ['s-000001'] },
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
      boundaryId: 'boundary-001',
      sides: {
        consumer: { packageId: 'pkg-b', path: consumerPath },
        provider: { packageId: 'pkg-a', path: providerPath },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { clauses: clauses(), sourceRefs: ['s-000001'], owners: { semantic: 'pkg-a', state: 'not_applicable', side_effect: 'not_applicable', port: 'not_applicable', adapter: 'not_applicable' } },
    });
  for (const slot of ['semantic', 'state', 'side_effect', 'port', 'adapter']) {
    assert.equal(typeof edge.owners[slot], 'string', `${slot} owner must be present`);
  }
  assert.deepEqual(edge.source_refs, ['s-000001']);
  assert.equal(edge.consumer_path, consumerPath);
  assert.equal(edge.provider_path, providerPath);
});

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('C003 an edge kind that differs from the boundary kind is rejected by name', () => {
  const target = { ...boundary(), connection_kind: 'state_transition' };
  const edge = buildContractEdge({
    boundaryId: 'boundary-001',
    sides: { consumer: { packageId: 'pkg-b' }, provider: { packageId: 'pkg-a' } },
    relation: { connectionKind: 'value_only' },
    content: { owners: {}, clauses: clauses(), sourceRefs: ['s-000001'] },
  });

  const verdict = validateContractEdge(edge, target);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.kindMismatch, { expected: 'state_transition', actual: 'value_only' });
});

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('C003 an absent declared non-core clause is refused unless notApplicable names it', () => {
  const target = boundary();
  const withoutErrors = { ...clauses() };
  delete withoutErrors.errors;
  const base = buildContractEdge({
    boundaryId: 'boundary-001',
    sides: { consumer: { packageId: 'pkg-b' }, provider: { packageId: 'pkg-a' } },
    relation: { connectionKind: 'value_only' },
    content: { owners: {}, clauses: withoutErrors, sourceRefs: ['s-000001'] },
  });

  const absent = validateContractEdge(base, target);
  assert.equal(absent.ok, false);
  assert.deepEqual(absent.absentScopeClauses, ['errors']);

  const excused = validateContractEdge(
    { ...base, clauses: { ...base.clauses, notApplicable: ['errors'] } },
    target,
  );
  assert.equal(excused.ok, true);
  assert.deepEqual(excused.absentScopeClauses, []);
});

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('C003 notApplicable is canonical, and an unknown or core clause name is refused', () => {
  const edge = buildContractEdge({
    boundaryId: 'boundary-001',
    sides: { consumer: { packageId: 'pkg-b' }, provider: { packageId: 'pkg-a' } },
    relation: { connectionKind: 'value_only' },
    content: {
      owners: {},
      clauses: { ...clauses(), notApplicable: ['tests', 'errors', 'tests'] },
      sourceRefs: ['s-000001'],
    },
  });

  assert.deepEqual(edge.clauses.notApplicable, ['errors', 'tests']);
  assert.throws(() => canonicalizeClauses({ ...clauses(), notApplicable: ['telepathy'] }), /telepathy/);
  assert.throws(() => canonicalizeClauses({ ...clauses(), notApplicable: ['invariants'] }), /core/);
});

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
test('C003 an empty declared non-core clause is refused and cannot be excused by notApplicable', () => {
  const target = boundary();
  const edge = buildContractEdge({
    boundaryId: 'boundary-001',
    sides: { consumer: { packageId: 'pkg-b' }, provider: { packageId: 'pkg-a' } },
    relation: { connectionKind: 'value_only' },
    content: { owners: {}, clauses: clauses(), sourceRefs: ['s-000001'] },
  });

  const empty = validateContractEdge({ ...edge, clauses: { ...edge.clauses, canonicalization: '   ' } }, target);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.emptyScopeClauses, ['canonicalization']);

  const excused = validateContractEdge(
    { ...edge, clauses: { ...edge.clauses, canonicalization: '   ', notApplicable: ['canonicalization'] } },
    target,
  );
  assert.equal(excused.ok, true);

  const contradiction = validateContractEdge(
    { ...edge, clauses: { ...edge.clauses, notApplicable: ['canonicalization'] } },
    target,
  );
  assert.equal(contradiction.ok, false);
  assert.deepEqual(contradiction.conflictingNotApplicable, ['canonicalization']);
});

test('C003 canonicalizeClauses is deterministic and drops empty optional groups', () => {
  const canonical = canonicalizeClauses({ tests: ['b', 'a'], invariants: ['x'], input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], errors: [] });
  assert.deepEqual(Object.keys(canonical), ['input', 'invariants', 'output', 'postconditions', 'preconditions', 'tests']);
  assert.deepEqual(canonical.tests, ['a', 'b'], 'list clauses are sorted');
  assert.deepEqual(canonicalizeClauses({}), {});
});
