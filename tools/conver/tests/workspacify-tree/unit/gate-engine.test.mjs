// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-177: workspacify-tree gate engine tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { LAYERS, validatePackageCatalog } from '../../../.claude/scripts/workspacify-tree/lib/workspace-model.mjs';
import { runOwnershipChecks } from '../../../.claude/scripts/workspacify-tree/lib/ownership.mjs';
import { detectCycles, runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { REASON_CODES, checkDependencyMatrix } from '../../../.claude/scripts/workspacify-tree/lib/dependencies.mjs';
import { findOverSplitRisks } from '../../../.claude/scripts/workspacify-tree/lib/boundary-review.mjs';
import { checkPortAdapterBoundary } from '../../../.claude/scripts/workspacify-tree/lib/adapters.mjs';
import { checkDatabasePolicy } from '../../../.claude/scripts/workspacify-tree/lib/database-policy.mjs';
import { normalizeAliases, detectAliasCycles } from '../../../.claude/scripts/workspacify-tree/lib/alias-normalization.mjs';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { loadDecisionInput, assertDecisionSchema } from '../../../.claude/scripts/workspacify-tree/lib/decision-input.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const readFixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

// ---- C001: §9.3 owner assignment ----------------------------------------

test('workspace-model: validatePackageCatalog accepts a valid catalog', () => {
  const packages = [
    { id: 'pkg-0001', name: 'alpha-protocol', path: 'crates/protocol/alpha', layer: 'protocol', kind: 'production-library' },
    { id: 'pkg-0002', name: 'beta-core', path: 'crates/core/beta', layer: 'core', kind: 'production-library' },
  ];
  assert.equal(validatePackageCatalog(packages).length, 0);
});

test('workspace-model: invalid package entries produce errors', () => {
  const packages = [
    { id: '', name: '', path: 'x', layer: 'not-a-layer', kind: 'production-library' },
    { id: 'pkg-0002', name: 'b', path: '', layer: 'core', kind: 'mystery-kind' },
  ];
  const errors = validatePackageCatalog(packages);
  assert.ok(errors.length >= 2);
});

test('ownership C001 [@verifies C001]: an object with zero owners is reported as orphan', () => {
  const orphan = runOwnershipChecks(readFixture('ownerless-model.json'));
  assert.ok(orphan.orphan_object_count >= 2);
  assert.equal(orphan.owner_collision_count, 0);
});

test('ownership C001 [@verifies C001]: an object owned by two packages is reported as a collision', () => {
  const collision = runOwnershipChecks(readFixture('collision-model.json'));
  assert.ok(collision.owner_collision_count >= 1);
});

test('ownership: an object owned by a non-protocol package is an invalid owner layer', () => {
  const result = runOwnershipChecks({
    objects: [{ id: 'obj-0001', owner_package: 'pkg-core' }],
    claims: [],
    packages: [{ id: 'pkg-core', name: 'core', path: 'core', layer: 'core', kind: 'production-library' }],
  });
  assert.ok(result.invalid_owner_layer_count >= 1);
});

test('ownership invariant [@verifies C001]: clean ownership yields zero counts', () => {
  const clean = runOwnershipChecks({
    objects: [{ id: 'obj-0001', owner_package: 'pkg-protocol' }],
    claims: [],
    packages: [{ id: 'pkg-protocol', name: 'p', path: 'p', layer: 'protocol', kind: 'production-library' }],
  });
  assert.equal(clean.orphan_object_count, 0);
  assert.equal(clean.orphan_claim_count, 0);
  assert.equal(clean.owner_collision_count, 0);
  assert.equal(clean.invalid_owner_layer_count, 0);
});

// ---- C002: layer rules --------------------------------------------------

test('dag C002 [@verifies C002]: foundation layer depending on adapter/core is a layer violation', () => {
  const model = readFixture('forbidden-layer-model.json');
  const report = runDagChecks({ packages: model.packages, edges: model.edges, forbiddenEdges: [] });
  assert.ok(report.layer_violation_count >= 2, 'foundation -> adapter/core are layer violations');
  assert.ok(report.forbidden_edge_count >= 2);
});

test('dag C002 invariant [@verifies C002]: production packages never depend on conformance', () => {
  const packages = [
    { id: 'pkg-prod', name: 'prod', path: 'p', layer: 'protocol', kind: 'production-library' },
    { id: 'pkg-conf', name: 'conf', path: 'c', layer: 'conformance', kind: 'conformance' },
  ];
  const report = runDagChecks({ packages, edges: [{ from: 'pkg-prod', to: 'pkg-conf', kind: 'normal' }], forbiddenEdges: [] });
  assert.ok(report.forbidden_edge_count >= 1);
});

// ---- C003: DAG checks ---------------------------------------------------

test('dag C003 [@verifies C003]: unknown refs, self loop, duplicates and cycles are reported', () => {
  const packages = [
    { id: 'a', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library' },
    { id: 'b', name: 'b', path: 'b', layer: 'protocol', kind: 'production-library' },
  ];
  const edges = [
    { from: 'a', to: 'b', kind: 'normal' },
    { from: 'b', to: 'a', kind: 'normal' },
    { from: 'a', to: 'a', kind: 'normal' },
    { from: 'a', to: 'missing', kind: 'normal' },
    { from: 'a', to: 'b', kind: 'normal' },
  ];
  const report = runDagChecks({ packages, edges, forbiddenEdges: [] });
  assert.ok(report.cycle_count >= 1);
  assert.ok(report.self_loop_count >= 1);
  assert.ok(report.unknown_dependency_count >= 1);
  assert.ok(report.duplicate_edge_count >= 1);
});

test('dag: detectCycles finds a two-node cycle and leaves acyclic graphs alone', () => {
  assert.equal(detectCycles(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]).length, 1);
  assert.equal(detectCycles(['a', 'b'], [{ from: 'a', to: 'b' }]).length, 0);
});

test('dag invariant [@verifies C003]: a valid acyclic graph yields a topological order', () => {
  const packages = [
    { id: 'a', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library' },
    { id: 'b', name: 'b', path: 'b', layer: 'protocol', kind: 'production-library' },
  ];
  const report = runDagChecks({ packages, edges: [{ from: 'a', to: 'b', kind: 'normal' }], forbiddenEdges: [] });
  assert.equal(report.cycle_count, 0);
  assert.ok(report.topological_order.length >= 2);
  assert.ok(report.topological_order.indexOf('a') < report.topological_order.indexOf('b'));
});

test('dag property fixture: cycle-model reports at least one cycle', () => {
  const model = readFixture('cycle-model.json');
  const report = runDagChecks({ packages: model.packages, edges: model.edges, forbiddenEdges: [] });
  assert.ok(report.cycle_count >= 1);
});

// ---- C004: dependency matrix + gate pipeline ----------------------------

test('dependencies: reason codes are enumerated', () => {
  assert.ok(Array.isArray(REASON_CODES));
  assert.ok(REASON_CODES.includes('port-contract'));
  assert.ok(REASON_CODES.includes('conformance'));
});

test('dependencies: missing reason codes and alternatives are reported', () => {
  const packages = [{ id: 'a', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library' }];
  const normalEdges = [
    { from: 'a', to: 'a', kind: 'normal', reasonCode: 'port-contract', reason: 'ok' },
    { from: 'a', to: 'unknown', kind: 'normal', reasonCode: 'port-contract', reason: 'ok' },
    { from: 'a', to: 'a', kind: 'normal', reason: 'no reason code' },
  ];
  const forbiddenEdges = [
    { from: 'a', to: 'a', reason: 'cycle', alternative: { kind: 'port-injection', description: 'inject' } },
    { from: 'a', to: 'a', reason: 'cycle' },
  ];
  const report = checkDependencyMatrix({ packages, normalEdges, forbiddenEdges });
  assert.equal(report.missingReasonCode.length, 1);
  assert.equal(report.undeclared.length, 1);
  assert.equal(report.missingAlternative.length, 1);
});

test('boundary-review: over-split risk candidates are discovered, not decided', () => {
  const packages = [
    { id: 'pkg-a', name: 'a', path: 'a', layer: 'protocol', kind: 'production-library', owns: { objects: [], claims: [] } },
    { id: 'pkg-b', name: 'b', path: 'b', layer: 'protocol', kind: 'production-library', owns: { objects: ['obj-1'], claims: [] } },
    { id: 'pkg-c', name: 'c', path: 'c', layer: 'protocol', kind: 'production-library', owns: { objects: ['obj-1'], claims: [] } },
  ];
  const risks = findOverSplitRisks(packages);
  assert.ok(risks.some((risk) => risk.kind === 'no-owner' && risk.packageId === 'pkg-a'));
  assert.ok(risks.some((risk) => risk.kind === 'duplicate-ownership' && risk.objectId === 'obj-1'));
});

test('adapters: unattached adapters and missing ports are reported', () => {
  const ports = [{ id: 'port-store', name: 'store-port', provides: ['storage'], implementedBy: ['pkg-adapter'] }];
  const packages = [
    { id: 'pkg-adapter', name: 'sqlite', layer: 'adapters', kind: 'adapter' },
    { id: 'pkg-orphan-adapter', name: 'clock-adapter', layer: 'adapters', kind: 'adapter' },
    { id: 'pkg-protocol', name: 'proto', layer: 'protocol', kind: 'production-library', externalImplementations: ['payment'] },
  ];
  const report = checkPortAdapterBoundary({ ports, packages });
  assert.ok(report.violations.some((v) => v.type === 'unattached-adapter' && v.packageId === 'pkg-orphan-adapter'));
  assert.ok(report.missingPorts.includes('payment'));
});

test('validation gate C004 [@verifies C004]: an unreviewed REVIEW_REQUIRED item never transitions to COMPLETE', () => {
  const pipeline = runGatePipeline({
    structure: { reconstruction: { status: 'PASS' } },
    inventory: { unresolved_candidates: [{ kind: 'unknown-classification' }] },
    workspace: {},
    decisions: { approvals: [] },
  });
  assert.notEqual(pipeline.status, 'COMPLETE');
  assert.ok(pipeline.finalAudit.unresolved_count >= 1);
});

test('decision-input: decisions-ok fixture passes the decision schema', () => {
  const decisions = loadDecisionInput(new URL('../fixtures/decisions-ok.json', import.meta.url).pathname);
  const report = assertDecisionSchema(decisions);
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

// ---- C005: database policy ----------------------------------------------

test('database C005 [@verifies C005]: raw sql and db type leaks are flagged', () => {
  const model = readFixture('db-mix-model.json');
  const report = checkDatabasePolicy(model);
  assert.ok(report.raw_sql_count >= 1);
  assert.ok(report.db_type_leak_count >= 1);
});

test('database invariant [@verifies C005]: domain/protocol never reference concrete db types in a clean model', () => {
  const report = checkDatabasePolicy({
    databasePolicy: { applicable: true, rawSqlProhibited: true, commonStorePort: 'store-port' },
    packages: [],
  });
  assert.equal(report.raw_sql_count, 0);
  assert.equal(report.db_type_leak_count, 0);
});

// ---- PX-217: the gate judges every count it computes ----------------------
// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
//
// Every assertion below toggles exactly one field of one input that reaches
// COMPLETE, so a status change can only come from the field under test. The
// baseline was measured before the fix: `completeInput()` returned COMPLETE
// with G0..G5 all PASS.

const gate = (pipeline, id) => pipeline.gates.find((entry) => entry.id === id);

const storageObject = {
  id: 'obj-0001',
  canonical_name: 'StorageRecord',
  classification: 'record',
  owner_package: 'pkg-0001',
  source_refs: [{ line_start: 1, byte_start: 0, byte_end: 10 }],
};

const storagePackage = (over = {}) => ({
  id: 'pkg-0001',
  name: 'gaia-storage',
  path: 'crates/protocol/storage',
  layer: 'protocol',
  kind: 'production-library',
  responsibilities: ['owns storage records'],
  seed_required: true,
  owns: { objects: ['obj-0001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
  ...over,
});

const workspaceTree = [{
  name: 'crates',
  path: 'crates',
  kind: 'dir',
  children: [{
    name: 'protocol',
    path: 'crates/protocol',
    kind: 'dir',
    children: [{ name: 'storage', path: 'crates/protocol/storage', kind: 'dir', children: [] }],
  }],
}];

const completeInput = ({
  packages = [storagePackage()],
  adapters = { ports: [], databasePolicy: { applicable: true, rawSqlProhibited: true } },
  inventory = {},
  approvals = [],
} = {}) => ({
  structure: { reconstruction: { status: 'PASS' }, spec_pulse: { candidates: [] } },
  inventory: {
    objects: [storageObject],
    claims: [],
    terms: [],
    invariants: [],
    stateMachines: [],
    errorCodes: [],
    requiredTests: [],
    normalization_decisions: [],
    unresolved_candidates: [],
    ...inventory,
  },
  workspace: { packages, tree: workspaceTree },
  dependencies: { normalEdges: [], forbiddenEdges: [], boundaries: [] },
  adapters,
  review: { candidates: [] },
  decisions: {
    approvals,
    ownership: [],
    semantic_review: { status: 'APPROVED', statement: 'checked', approver: 'ai-session' },
    spec_defects: [],
    residual_questions: [],
    dependency_reviews: [],
  },
});

// ---- C001: G5 judges migration atomicity --------------------------------

test('PX-217 C001 [@verifies C001]: G5 refuses a catalog that declares migration atomicity as domain atomicity', () => {
  const clean = runGatePipeline(completeInput());
  const mutant = runGatePipeline(completeInput({ packages: [storagePackage({ migrationAsAtomicity: true })] }));

  assert.equal(clean.status, GATE_STATUS.COMPLETE);
  assert.notEqual(mutant.status, GATE_STATUS.COMPLETE);
  assert.equal(gate(mutant, 'G5').status, GATE_STATUS.FAIL);
  assert.equal(gate(mutant, 'G5').counts.migration_atomicity_misuse_count, 1);
  assert.ok(gate(mutant, 'G5').reasons.some((reason) => reason.includes('pkg-0001')));
  assert.equal(mutant.finalAudit.migration_atomicity_misuse_count, 1);
});

test('PX-217 C001 [@verifies C001]: the two dimensions that already refused still refuse', () => {
  for (const violation of [
    { rawSqlFragments: ['SELECT * FROM checkpoint'] },
    { dbSpecificTypes: ['sqlx::PgPool'] },
  ]) {
    const pipeline = runGatePipeline(completeInput({ packages: [storagePackage(violation)] }));
    assert.equal(gate(pipeline, 'G5').status, GATE_STATUS.FAIL);
    assert.notEqual(pipeline.status, GATE_STATUS.COMPLETE);
  }
});

test('PX-217 C001 [@verifies C001]: the database evaluation returns one key set on both exits', () => {
  const withoutAdapters = runGatePipeline(completeInput({ adapters: undefined }));

  assert.equal(gate(withoutAdapters, 'G5').status, GATE_STATUS.PASS);
  assert.equal(gate(withoutAdapters, 'G5').counts.raw_sql_count, 0);
  assert.equal(gate(withoutAdapters, 'G5').counts.db_type_leak_count, 0);
  assert.equal(gate(withoutAdapters, 'G5').counts.migration_atomicity_misuse_count, 0);
  assert.equal(withoutAdapters.finalAudit.migration_atomicity_misuse_count, 0);
  assert.equal(withoutAdapters.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C001 [@verifies C001]: an inapplicable policy reaches the same zero counts as an absent one', () => {
  const inapplicable = runGatePipeline(completeInput({
    adapters: { ports: [], databasePolicy: { applicable: false } },
  }));

  assert.equal(gate(inapplicable, 'G5').counts.migration_atomicity_misuse_count, 0);
  assert.equal(inapplicable.status, GATE_STATUS.COMPLETE);
});

// ---- C002: G3 judges the port/adapter boundary --------------------------

const storePort = { id: 'port-store', name: 'store-port', provides: ['storage'], implementedBy: ['pkg-0001'] };
const attachedAdapter = () => completeInput({
  packages: [storagePackage({ kind: 'adapter' })],
  adapters: { ports: [storePort], databasePolicy: { applicable: false } },
});
const orphanAdapter = () => completeInput({
  packages: [storagePackage({ kind: 'adapter' })],
  adapters: { ports: [], databasePolicy: { applicable: false } },
});
const unprovidedCapability = () => completeInput({
  packages: [storagePackage({ externalImplementations: ['payment'] })],
});

test('PX-217 C002 [@verifies C002]: G3 refuses an adapter no port implements through', () => {
  assert.equal(runGatePipeline(attachedAdapter()).status, GATE_STATUS.COMPLETE);

  const refused = runGatePipeline(orphanAdapter());
  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(refused, 'G3').counts.unattached_adapter_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('pkg-0001')));
  assert.equal(refused.finalAudit.unattached_adapter_count, 1);
  assert.notEqual(refused.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C002 [@verifies C002]: G3 refuses a capability no port provides', () => {
  const refused = runGatePipeline(unprovidedCapability());

  assert.equal(gate(refused, 'G3').counts.missing_port_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('payment')));
  assert.equal(refused.finalAudit.missing_port_count, 1);
});

test('PX-217 C002 [@verifies C002]: the boundary check leaves every other count where it was', () => {
  const baseline = runGatePipeline(completeInput());
  const withBoundary = runGatePipeline(completeInput());

  assert.equal(withBoundary.status, GATE_STATUS.COMPLETE);
  for (const id of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5']) {
    assert.equal(gate(withBoundary, id).status, gate(baseline, id).status);
  }
  for (const name of [
    'orphan_object_count', 'owner_collision_count', 'uncovered_edge_count',
    'unknown_owns_reference_count', 'unattached_adapter_count', 'missing_port_count',
  ]) {
    assert.equal(gate(withBoundary, 'G3').counts[name], 0, `${name} should be zero for the clean catalog`);
  }
});

// ---- C003: object/claim collisions --------------------------------------

const collisionObjects = [
  { id: 'obj-0001', canonical_name: 'forum_id', classification: 'record' },
  { id: 'obj-0002', canonical_name: 'ForumId', classification: 'record' },
];
const collisionClaims = [{ id: 'clm-0001', canonical_name: 'forum_id' }];
const publishedCollision = [{
  normalized_key: 'forumid',
  object_candidates: ['forum_id'],
  claim_candidates: ['forum_id'],
}];

test('PX-217 C003 [@verifies C003]: the claim list changes the report and not the merge', () => {
  const withoutClaims = normalizeAliases(collisionObjects);
  const withClaims = normalizeAliases(collisionObjects, { collisionWith: collisionClaims });

  assert.equal(withoutClaims.collisions.length, 0);
  assert.equal(withClaims.collisions.length, 1);
  assert.equal(withClaims.collisions[0].normalized_key, 'forumid');
  assert.deepEqual(withClaims.candidates, withoutClaims.candidates);
  assert.deepEqual(withClaims.candidates[0].aliases, ['ForumId']);
});

test('PX-217 C003 [@verifies C003]: G3 refuses a collision no approval resolves', () => {
  const refused = runGatePipeline(completeInput({ inventory: { object_claim_collisions: publishedCollision } }));

  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(refused, 'G3').counts.object_claim_collision_count, 1);
  assert.equal(gate(refused, 'G3').counts.unresolved_object_claim_collision_count, 1);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('forumid')));
  assert.equal(refused.finalAudit.unresolved_object_claim_collision_count, 1);
  assert.notEqual(refused.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C003 [@verifies C003]: an approval naming the normalized key resolves the collision', () => {
  const resolved = runGatePipeline(completeInput({
    inventory: { object_claim_collisions: publishedCollision },
    approvals: [{ decisionId: 'forumid', rationale: 'the name is an object and a claim by design', approver: 'ai-session' }],
  }));

  assert.equal(gate(resolved, 'G3').counts.object_claim_collision_count, 1);
  assert.equal(gate(resolved, 'G3').counts.unresolved_object_claim_collision_count, 0);
  assert.equal(resolved.status, GATE_STATUS.COMPLETE);
});

// ---- C004: alias cycles -------------------------------------------------

const cyclicDecisions = [
  { from: 'A', to: 'B', reason: 'same-normalized-key' },
  { from: 'B', to: 'A', reason: 'same-normalized-key' },
];
const acyclicDecisions = [{ from: 'ForumId', to: 'forum_id', reason: 'same-normalized-key' }];
const aliasPairs = (decisions) => decisions.map((decision) => ({ name: decision.from, alias: decision.to }));

test('PX-217 C004 [@verifies C004]: the alias map reported is the map supplied', () => {
  assert.equal(detectAliasCycles(aliasPairs(cyclicDecisions)).length, 1);
  assert.deepEqual(detectAliasCycles(aliasPairs(cyclicDecisions))[0].path, ['A', 'B', 'A']);
  assert.equal(detectAliasCycles(aliasPairs(acyclicDecisions)).length, 0);
});

test('PX-217 C004 [@verifies C004]: a published alias cycle makes G3 refuse', () => {
  const clean = runGatePipeline(completeInput({ inventory: { normalization_decisions: acyclicDecisions } }));
  const refused = runGatePipeline(completeInput({ inventory: { normalization_decisions: cyclicDecisions } }));

  assert.equal(gate(clean, 'G3').counts.alias_cycle_count, 0);
  assert.equal(clean.status, GATE_STATUS.COMPLETE);
  assert.equal(gate(refused, 'G3').counts.alias_cycle_count, 1);
  assert.equal(gate(refused, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.ok(gate(refused, 'G3').reasons.some((reason) => reason.includes('A')));
  assert.equal(refused.finalAudit.alias_cycle_count, 1);
});

test('PX-217 C004 [@verifies C004]: a decision mapping a name to itself is a duplicate, not a cycle', () => {
  // normalizeAliases emits `from === to` when one group holds two candidates with the
  // same canonical name — a duplicate it has already merged. Reported as a cycle it
  // would refuse a sound run and misname the cause.
  const duplicated = [{ from: 'ForumId', to: 'ForumId', reason: 'same-normalized-key' }];
  const pipeline = runGatePipeline(completeInput({ inventory: { normalization_decisions: duplicated } }));

  assert.equal(gate(pipeline, 'G3').counts.alias_cycle_count, 0);
  assert.equal(pipeline.status, GATE_STATUS.COMPLETE);
});

test('PX-217 C004 [@verifies C004]: the alias map is read from the published decisions', () => {
  const refused = runGatePipeline(completeInput({
    inventory: { normalization_decisions: cyclicDecisions, objects: [storageObject], claims: [] },
  }));

  // The candidates are untouched and still resolve their owners: only the published
  // decisions carry the cycle, and that alone is enough to refuse.
  assert.equal(refused.finalAudit.orphan_object_count, 0);
  assert.equal(gate(refused, 'G3').counts.alias_cycle_count, 1);
});

// ---- C005: the predicate and the report are two renderings of one count --

const GATED_COUNT_NAMES = [
  'migration_atomicity_misuse_count',
  'unattached_adapter_count',
  'missing_port_count',
  'object_claim_collision_count',
  'unresolved_object_claim_collision_count',
  'alias_cycle_count',
];

test('PX-217 C005 [@verifies C005]: every count a predicate reads is reported twice', () => {
  const pipeline = runGatePipeline(completeInput());
  const g3 = gate(pipeline, 'G3').counts;
  const g5 = gate(pipeline, 'G5').counts;

  for (const name of GATED_COUNT_NAMES) {
    assert.ok(name in g3 || name in g5, `${name} is read by a predicate but missing from gate counts`);
    assert.ok(name in pipeline.finalAudit, `${name} is read by a predicate but missing from finalAudit`);
  }
});

test('PX-217 C005 [@verifies C005]: the same name list is reconciled against both records', () => {
  const refused = runGatePipeline(completeInput({
    packages: [storagePackage({ migrationAsAtomicity: true })],
    inventory: { object_claim_collisions: publishedCollision },
  }));
  const reported = refused.finalAudit;

  // The expected value is asserted first: comparing two undefineds would agree
  // with each other and prove nothing about either record.
  assert.equal(reported.migration_atomicity_misuse_count, 1);
  assert.equal(reported.object_claim_collision_count, 1);
  assert.equal(reported.unresolved_object_claim_collision_count, 1);

  assert.equal(reported.migration_atomicity_misuse_count, gate(refused, 'G5').counts.migration_atomicity_misuse_count);
  assert.equal(reported.object_claim_collision_count, gate(refused, 'G3').counts.object_claim_collision_count);
  assert.equal(reported.unresolved_object_claim_collision_count, gate(refused, 'G3').counts.unresolved_object_claim_collision_count);
});

// ---- Boy Scout: G5 decides on the violation counts alone ----------------

test('PX-217 Boy Scout [@verifies C001]: G5 passes without requiring an approval and still reports the count', () => {
  const pipeline = runGatePipeline(completeInput({ approvals: [] }));

  assert.equal(gate(pipeline, 'G5').status, GATE_STATUS.PASS);
  assert.equal(gate(pipeline, 'G5').counts.approval_count, 0);
});
