// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.
// The five structural invariants PX-300 makes a producer enforce, measured on
// the gaia design data that PX-301 corrected in a regeneration transaction.
//
// Set STAGING_ROOT to the transaction's staging root (or GAIA_ROOT to a live
// workspace after the transaction commits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRegisteredConnectionKind } from '../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';
import { validateContractEdge } from '../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { pinnedColumnGroundingProblems } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';
import { riskFieldForClass } from '../../.claude/scripts/shared-obligations/risk-fields.mjs';

const ROOT = process.env.STAGING_ROOT ?? process.env.GAIA_ROOT ?? null;
const SKIP = ROOT === null ? 'STAGING_ROOT or GAIA_ROOT is not set' : false;

const MINIMAL_KINDS = ['checkpoint-reference', 'adapter-implementation', 'conformance'];
const COLUMNS = ['required_proof_classes', 'result_object_classes'];
const SPEC_NAME = 'GaiaSekkeiShiyousho_v32.md';
const ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';

const readJson = (relative) => JSON.parse(readFileSync(join(ROOT, relative), 'utf8'));
const readJsonl = (relative) => readFileSync(join(ROOT, relative), 'utf8')
  .split('\n').filter(Boolean).map((line) => JSON.parse(line));
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.

function treeManifest() {
  return readJson('WORKSPACIFY-TREE-MANIFEST.json');
}
// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.

function allocateManifest() {
  return readJson('WORKSPACIFY-ALLOCATE-MANIFEST.json');
}
// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.

function edgeKindByBoundary(tree) {
  return new Map(tree.dependencies.boundaries.map((boundary, index) => [
    boundary.id,
    tree.dependencies.normal_edges[index].connectionKind,
  ]));
}
// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.

function isEmpty(value) {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
}

test('C001 the staged tree registers 10 kinds and every boundary carries its edge kind', { skip: SKIP }, () => {
  const tree = treeManifest();
  const expected = edgeKindByBoundary(tree);
  const kinds = new Set(tree.dependencies.normal_edges.map((edge) => edge.connectionKind));

  assert.equal(tree.dependencies.boundaries.length, 84);
  assert.equal(kinds.size, 10);
  for (const boundary of tree.dependencies.boundaries) {
    assert.equal(isRegisteredConnectionKind(boundary.connection_kind), true, boundary.id);
    assert.equal(boundary.connection_kind, expected.get(boundary.id), boundary.id);
  }
});

test('C001 the allocate manifest carries the same kind on all 84 boundaries', { skip: SKIP }, () => {
  const expected = edgeKindByBoundary(treeManifest());
  const registry = allocateManifest().contract_registry;

  assert.equal(registry.length, 84);
  for (const contract of registry) {
    assert.equal(contract.connection_kind, expected.get(contract.boundary_id), contract.boundary_id);
  }
});

test('C002 the 19 expanded boundaries carry errors and tests on both sides', { skip: SKIP }, () => {
  const tree = treeManifest();
  const expected = edgeKindByBoundary(tree);
  const decisions = readJson('workspacify/allocate/DECISIONS.json');
  const contracts = decisions.seeds.flatMap((seed) => seed.contractEdges);

  const targets = tree.dependencies.boundaries
    .filter((boundary) => MINIMAL_KINDS.includes(expected.get(boundary.id)));

  assert.equal(targets.length, 19);
  for (const boundary of targets) {
    const sides = contracts.filter((edge) => edge.boundary_id === boundary.id);
    assert.equal(sides.length, 2, boundary.id);
    for (const side of sides) {
      assert.equal(Array.isArray(side.clauses.tests) && side.clauses.tests.length > 0, true, `${boundary.id} ${side.direction} tests`);
      const hasErrors = Array.isArray(side.clauses.errors) && side.clauses.errors.length > 0;
      const excused = Array.isArray(side.clauses.notApplicable) && side.clauses.notApplicable.includes('errors');
      assert.equal(hasErrors || excused, true, `${boundary.id} ${side.direction} errors`);
    }
  }
});

test('C002 the PX-300 validator accepts every allocate registry row', { skip: SKIP }, () => {
  const tree = treeManifest();
  const boundaries = new Map(tree.dependencies.boundaries.map((boundary) => [boundary.id, boundary]));

  for (const contract of allocateManifest().contract_registry) {
    const verdict = validateContractEdge(contract, boundaries.get(contract.boundary_id));
    assert.equal(verdict.ok, true, `${contract.boundary_id}: ${JSON.stringify(verdict)}`);
  }
});

test('C003 no active pinned column is both empty and ungrounded', { skip: SKIP }, () => {
  const artifact = readJson(ARTIFACT_NAME);
  const specLines = readFileSync(join(ROOT, SPEC_NAME), 'utf8').split('\n');

  assert.deepEqual(pinnedColumnGroundingProblems(artifact, specLines), []);

  const columns = (artifact.pins?.columns ?? []).map((column) => column.name);
  for (const operation of artifact.operations ?? []) {
    if (operation.disposition !== 'active') continue;
    for (const column of columns.filter((name) => COLUMNS.includes(name))) {
      const grounded = operation.grounding?.properties?.[column];
      assert.equal(!isEmpty(operation[column]) || grounded !== undefined, true, `${operation.id}:${column}`);
    }
  }
});

test('C003 the 27 existing groundings are byte-identical to the recorded baseline', { skip: SKIP }, () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/px301-preserved-groundings.json', import.meta.url), 'utf8'));
  const operations = new Map(readJsonl('educe-sequences/readings-span.jsonl')
    .flatMap((row) => row.operations ?? [])
    .map((operation) => [operation.id, operation]));

  assert.equal(Object.keys(baseline).length, 27);
  for (const [operationId, properties] of Object.entries(baseline)) {
    assert.deepEqual(operations.get(operationId)?.grounding?.properties, properties, operationId);
  }
});

test('C004 the live workspace is unchanged from the transaction baseline', { skip: SKIP || process.env.GAIA_ROOT === undefined || process.env.PX301_LIVE_BASELINE === undefined }, () => {
  const baseline = JSON.parse(readFileSync(process.env.PX301_LIVE_BASELINE, 'utf8'));
  for (const name of Object.keys(baseline)) {
    assert.equal(digest(join(process.env.GAIA_ROOT, name)), baseline[name], name);
  }
});

test('C004 the transaction names this staging root and is still active', { skip: SKIP }, () => {
  const liveRoot = process.env.GAIA_ROOT ?? ROOT;
  const ledger = JSON.parse(readFileSync(join(liveRoot, 'regeneration/GENERATIONS.json'), 'utf8'));
  const entry = ledger.transactions.find((transaction) => transaction.stagingRoot === ROOT);
  assert.notEqual(entry, undefined);
  assert.equal(['open', 'derived', 'judgment-required', 'verified'].includes(entry.state), true, entry.state);
});

test('C005 the staged worklist has no open PROP and no out-of-scope JUDGE', { skip: SKIP }, () => {
  const tree = treeManifest();
  const allocate = allocateManifest();
  const artifact = readJson(ARTIFACT_NAME);
  const readings = { span: readJsonl('educe-sequences/readings-span.jsonl') };
  const obligations = deriveObligations({
    census: {
      operations: (artifact.operations ?? []).map((operation) => operation.id),
      entries: (artifact.sequences ?? []).map((entry) => entry.id),
      sections: (artifact.sections ?? []).map((section) => section.id),
    },
    declaration: { entries: artifact.sequences ?? [], sections: artifact.sections ?? [] },
    artifact,
    treeManifest: tree,
    allocateManifest: allocate,
    packages: tree.workspace?.packages ?? [],
    readings,
  });

  assert.deepEqual(obligations.filter((entry) => entry.id.startsWith('PROP:') && entry.state === 'open'), []);

  const boundaries = new Map(tree.dependencies.boundaries.map((boundary) => [boundary.id, boundary]));
  for (const entry of obligations) {
    if (!entry.id.startsWith('JUDGE:') || entry.state !== 'open') continue;
    const [, kind, subject] = entry.id.split(':');
    const boundaryId = subject.split('/')[0];
    const clauses = kind === 'ENTAILMENT'
      ? ['preconditions', 'postconditions']
      : kind === 'TRANSLATION' ? ['input', 'output']
        : kind === 'INVARIANT' ? ['invariants'] : [kind.toLowerCase()];
    const boundary = boundaries.get(boundaryId);
    assert.notEqual(boundary, undefined, entry.id);
    for (const clause of clauses) {
      assert.ok(boundary.stage2_contract_scope.includes(clause), entry.id);
    }
  }
});

test('C005 no two open risk obligations for one operation name one field', { skip: SKIP }, () => {
  const tree = treeManifest();
  const artifact = readJson(ARTIFACT_NAME);
  const obligations = deriveObligations({
    census: { operations: (artifact.operations ?? []).map((operation) => operation.id), entries: [], sections: [] },
    declaration: { entries: [], sections: [] },
    artifact,
    treeManifest: tree,
    allocateManifest: allocateManifest(),
    packages: [],
    readings: {},
  });

  const seen = new Set();
  for (const entry of obligations.filter((row) => row.id.startsWith('RISK:') && row.state === 'open')) {
    const [, operationId, riskClass] = entry.id.split(':');
    const key = `${operationId}:${riskFieldForClass(riskClass)}`;
    assert.equal(seen.has(key), false, key);
    seen.add(key);
  }
});

// [::TICKET::] PX-301 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-301 --for-spec --no-implementation-order`.
test('C006 the live evidence is unchanged from the transaction baseline', { skip: SKIP || process.env.GAIA_ROOT === undefined }, () => {
  // The baseline is the live generation the transaction opened against, recorded
  // before any staging write. Comparing the staging rows instead would answer a
  // different question once PX-299 re-authors them: those rows are PX-299's
  // contract, not PX-301's, and only the live workspace still carries the
  // pre-authoring bytes this check is about.
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/px301-live-evidence-baseline.json', import.meta.url), 'utf8'));

  for (const [relativePath, expected] of Object.entries(baseline.files)) {
    assert.equal(digest(join(process.env.GAIA_ROOT, relativePath)), expected, relativePath);
  }
});
