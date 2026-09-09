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
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
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
