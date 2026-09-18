// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C002
// The Workspace Integration Graph turns the extracted contracts into a workspace
// level proof: unknown packages, self loops, undeclared or forbidden edges, layer
// violations, cycles, owner collisions and missing test obligations are all zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIntegrationGraph, runGraphViolations } from '../../../.claude/scripts/workspacify-allocate/lib/wig.mjs';
import { buildContractIndex } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildContractEdge, validateContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildBoundaryContractScope } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';
import { runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';
import { buildValidManifest, contractEdgesForPackage, makeDecisions } from '../helpers/build-valid-manifest.mjs';

// [::TICKET::] PX-218 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-218 --for-spec --no-implementation-order`.
function fixture(overrides = {}) {
  const { manifest } = buildValidManifest(overrides);
  const parsedByPackage = new Map();
  for (const seed of makeDecisions(manifest).seeds) {
    parsedByPackage.set(seed.packageId, {
      contractEdges: seed.contractEdges.map((edge) => buildContractEdge({
        boundaryId: edge.boundary_id,
        sides: {
          consumer: { packageId: edge.consumer_package },
          provider: { packageId: edge.provider_package },
        },
        relation: { direction: edge.direction, connectionKind: edge.connection_kind },
        content: { owners: edge.owners, clauses: edge.clauses, sourceRefs: edge.source_refs },
      })),
    });
  }
  return { manifest, index: buildContractIndex({ parsedByPackage, manifest }) };
}

test('C002 a consistent workspace yields an empty violation list and a stable hash', () => {
  const { manifest, index } = fixture();
  const graph = buildIntegrationGraph({ contractIndex: index, manifest });
  assert.equal(graph.nodes.length, manifest.workspace.packages.length);
  assert.equal(graph.edges.length, 1);

  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.summary.edge_count, 1);
  assert.equal(report.summary.node_count, 2);
  assert.match(report.hash, /^[0-9a-f]{64}$/);
  assert.equal(runGraphViolations({ graph: buildIntegrationGraph({ contractIndex: index, manifest }), manifest }).hash, report.hash);
});

test('C002 an undeclared edge, a forbidden edge, a self loop and a layer violation are detected', () => {
  const { manifest, index } = fixture();
  const graph = buildIntegrationGraph({ contractIndex: index, manifest });

  const forbidden = { ...manifest, dependencies: { ...manifest.dependencies, forbidden_edges: [{ from: 'pkg-b', to: 'pkg-a' }] } };
  assert.ok(runGraphViolations({ graph, manifest: forbidden }).violations.some((entry) => entry.class === 'forbidden_edge'));

  const undeclared = { ...manifest, dependencies: { ...manifest.dependencies, normal_edges: [], boundaries: [] } };
  assert.ok(runGraphViolations({ graph, manifest: undeclared }).violations.some((entry) => entry.class === 'undeclared_edge'));

  const selfLoopGraph = { ...graph, edges: [{ ...graph.edges[0], consumer_package: 'pkg-a', provider_package: 'pkg-a' }] };
  assert.ok(runGraphViolations({ graph: selfLoopGraph, manifest }).violations.some((entry) => entry.class === 'self_loop'));

  const unknownGraph = { ...graph, edges: [{ ...graph.edges[0], provider_package: 'pkg-ghost' }] };
  assert.ok(runGraphViolations({ graph: unknownGraph, manifest }).violations.some((entry) => entry.class === 'unknown_package'));

  const layerViolation = buildValidManifest({
    workspace: {
      tree: manifest.workspace.tree,
      packages: manifest.workspace.packages.map((pkg) => (pkg.id === 'pkg-a' ? { ...pkg, layer: 'conformance' } : pkg)),
      ownership: manifest.workspace.ownership,
    },
  }).manifest;
  const layerIndex = buildContractIndex({ parsedByPackage: new Map([['pkg-b', { contractEdges: [graph.edges[0].contract] }]]), manifest: layerViolation });
  const layerGraph = buildIntegrationGraph({ contractIndex: layerIndex, manifest: layerViolation });
  assert.ok(runGraphViolations({ graph: layerGraph, manifest: layerViolation }).violations.some((entry) => entry.class === 'layer_violation'));
});

test('C002 owner collisions, missing test obligations and missing proofs are reported', () => {
  const { manifest, index } = fixture();
  const graph = buildIntegrationGraph({ contractIndex: index, manifest });

  const noTests = { ...graph, edges: [{ ...graph.edges[0], contract: { ...graph.edges[0].contract, clauses: { ...graph.edges[0].contract.clauses, tests: [] } } }] };
  const report = runGraphViolations({ graph: noTests, manifest });
  assert.ok(report.violations.some((entry) => entry.class === 'missing_test_obligation'));
  assert.equal(report.ok, false);

  // Proof semantics are declared by the boundary scope; a contract that omits the
  // verifier while the boundary demands one breaks the proof lifecycle.
  const proofFixture = (() => {
    const { manifest: base } = buildValidManifest();
    const boundaries = [{ ...base.dependencies.boundaries[0], stage2_contract_scope: [...base.dependencies.boundaries[0].stage2_contract_scope, 'proof_verification'] }];
    const { manifest: proofManifest } = buildValidManifest({
      dependencies: { ...base.dependencies, boundaries, dag: base.dependencies.dag },
      stage2_handoff: { ...base.stage2_handoff, contract_boundaries: boundaries },
    });
    const seeds = makeDecisions(proofManifest).seeds;
    const parsed = new Map(seeds.map((seed) => [seed.packageId, {
      contractEdges: seed.contractEdges.map((edge) => buildContractEdge({
        boundaryId: edge.boundary_id,
        sides: {
          consumer: { packageId: edge.consumer_package },
          provider: { packageId: edge.provider_package },
        },
        relation: { direction: edge.direction, connectionKind: edge.connection_kind },
        content: { owners: edge.owners, clauses: edge.clauses, sourceRefs: edge.source_refs },
      })),
    }]));
    return { manifest: proofManifest, graph: buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage: parsed, manifest: proofManifest }), manifest: proofManifest }) };
  })();
  const noProof = {
    ...proofFixture.graph,
    edges: proofFixture.graph.edges.map((edge) => {
      const clauses = { ...edge.contract.clauses };
      delete clauses.proof_verification;
      return { ...edge, contract: { ...edge.contract, clauses } };
    }),
  };
  assert.ok(runGraphViolations({ graph: noProof, manifest: proofFixture.manifest }).violations.some((entry) => entry.class === 'proof_lifecycle_break'));
  assert.equal(runGraphViolations({ graph: proofFixture.graph, manifest: proofFixture.manifest }).violations.some((entry) => entry.class === 'proof_lifecycle_break'), false);

  const collision = { ...graph, edges: [{ ...graph.edges[0], contract: { ...graph.edges[0].contract, owners: { ...graph.edges[0].contract.owners, state: 'pkg-b' } } }, { ...graph.edges[0], contract: { ...graph.edges[0].contract, contract_id: 'contract-boundary-002', owners: { ...graph.edges[0].contract.owners, state: 'pkg-a' } } }] };
  assert.ok(runGraphViolations({ graph: collision, manifest }).violations.length >= 1);
});

// ---------------------------------------------------------------------------
// PX-218 @verifies C001
// PX-218 @verifies C002
// PX-218 @verifies C003
// PX-218 @verifies C004
//
// The clause a boundary owes is the clause its declared scope names.
//
// The WIG used to infer `proof_verification` from `signature` (see the pre-repair
// `declaresClause`). No contract could satisfy that inference: `validateContractEdge`
// refuses as out of scope any clause `stage2_contract_scope` does not declare
// (`contract-model.mjs` -> `outOfScopeClauses` -> `seed-local-checks.mjs` -> G3), so
// the one `typed_protocol_input` boundary in the reported workspace failed G5 when the
// clause was omitted and G3 when it was written.
//
// boundary-036 of that workspace (`pkg-0014 gaia-operation -> pkg-0001 gaia-foundation`,
// reason code `operation-envelope`), verbatim from the defect report Appendix A.1.
const BOUNDARY_036_SCOPE = [
  'input', 'output', 'preconditions', 'postconditions', 'invariants',
  'errors', 'canonicalization', 'signature', 'tests',
];
const TYPED_PROTOCOL_SCOPE = buildBoundaryContractScope('typed_protocol_input');
const CONTRADICTION_CLAUSE = { proof_verification: 'the verifier is named here (fixture)' };

/**
 * One boundary carrying the given declared scope, and its contract.
 *
 * `contractEdgesForPackage` derives a contract's clauses FROM the declared scope, so a
 * case that needs the scope to declare a clause while the contract omits it must delete
 * it here. Passing `extraClauses` alone would make that case vacuous: the clause under
 * test would be present, and nothing would ever be reported for it.
 */
// [::TICKET::] PX-218 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-218 --for-spec --no-implementation-order`.
function scopeFixture({ scope, connectionKind = 'value_only', extraClauses = {}, omitClauses = [] }) {
  const { manifest: base } = buildValidManifest();
  const boundaries = [{
    ...base.dependencies.boundaries[0],
    connection_kind: connectionKind,
    stage2_contract_scope: scope,
  }];
  const { manifest } = buildValidManifest({
    dependencies: { ...base.dependencies, boundaries, dag: base.dependencies.dag },
    stage2_handoff: { ...base.stage2_handoff, contract_boundaries: boundaries },
  });
  const edge = contractEdgesForPackage(manifest, 'pkg-b')[0];
  const clauses = { ...edge.clauses, ...extraClauses };
  for (const name of omitClauses) {
    delete clauses[name];
  }
  const contract = buildContractEdge({
    boundaryId: edge.boundary_id,
    sides: { consumer: { packageId: edge.consumer_package }, provider: { packageId: edge.provider_package } },
    relation: { direction: edge.direction, connectionKind: edge.connection_kind },
    content: { owners: edge.owners, clauses, sourceRefs: edge.source_refs },
  });
  const parsedByPackage = new Map([['pkg-b', { contractEdges: [contract] }]]);
  const graph = buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest });
  return { manifest, boundary: boundaries[0], graph };
}

test('C001 the real boundary-036 scope is the typed_protocol_input scope, and passes the WIG', () => {
  // Pinning the reported scope to the connection-kind table is what makes this fixture
  // the real shape; widening the typed_protocol_input row would break this line.
  assert.deepEqual(BOUNDARY_036_SCOPE, TYPED_PROTOCOL_SCOPE);

  const { manifest, graph } = scopeFixture({ scope: BOUNDARY_036_SCOPE, connectionKind: 'typed_protocol_input' });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});

test('C001 the WIG stops demanding the clause the validator refuses', () => {
  // Half one: the scope declares signature but not proof_verification, and the contract
  // omits the clause. Demanding it here is what no authored payload could satisfy.
  const omitted = scopeFixture({ scope: TYPED_PROTOCOL_SCOPE, connectionKind: 'typed_protocol_input' });
  assert.equal(
    runGraphViolations({ graph: omitted.graph, manifest: omitted.manifest })
      .violations.some((entry) => entry.class === 'proof_lifecycle_break'),
    false,
  );

  // Half two: the very clause the inference demanded is refused by the validator as out
  // of scope. The two halves together are the contradiction, not a strictness setting.
  const carried = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: CONTRADICTION_CLAUSE,
  });
  const verdict = validateContractEdge(carried.graph.edges[0].contract, carried.boundary);
  assert.deepEqual(verdict.outOfScopeClauses, ['proof_verification']);
  assert.equal(verdict.ok, false);
});

test('C001 every proof_lifecycle_break names a boundary whose scope declares proof_verification', () => {
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  const report = runGraphViolations({ graph, manifest });

  const breaks = report.violations.filter((entry) => entry.class === 'proof_lifecycle_break');
  assert.equal(breaks.length, 1);
  for (const entry of breaks) {
    const boundary = manifest.dependencies.boundaries.find((item) => `contract-${item.id}` === entry.contract_id);
    assert.ok(boundary, 'the violation names a declared boundary');
    assert.ok(boundary.stage2_contract_scope.includes('proof_verification'));
  }
});

test('C002 a scope naming proof_verification with the clause omitted still raises the obligation', () => {
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  const report = runGraphViolations({ graph, manifest });

  const entry = report.violations.find((item) => item.class === 'proof_lifecycle_break');
  assert.ok(entry);
  assert.equal(entry.contract_id, 'contract-boundary-001');
  assert.equal(entry.boundary_id, 'boundary-001');
  assert.equal(entry.detail, 'the contract requires proof semantics but names no verifier');
  assert.equal(report.ok, false);
});

test('C002 the same boundary with the clause present raises nothing', () => {
  const { manifest, graph } = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    extraClauses: CONTRADICTION_CLAUSE,
  });
  assert.equal(
    runGraphViolations({ graph, manifest }).violations.some((entry) => entry.class === 'proof_lifecycle_break'),
    false,
  );
});

test('C002 an empty tests clause raises missing_test_obligation and nothing else', () => {
  // canonicalizeClauses drops an empty list, so the contract reaches the WIG with no
  // tests key at all - the state hasClause reports as absent. The exact-list assertion
  // is the point: this boundary declares no proof obligation, so a second class here
  // means the WIG owes a clause its scope does not name.
  const { manifest, graph } = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: { tests: [] },
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations.map((entry) => entry.class), ['missing_test_obligation']);
  assert.equal(report.ok, false);
});

// ---------------------------------------------------------------------------
// The forbidden layer rules are declared pairs, not reachability claims.
//
// `forbidden_layer_rules` comes from the compiled `LAYER_FORBIDDEN_TARGETS`, whose own
// doc comment calls it "Layer pairs forbidden by 11.2 (target layer per source layer)",
// and stage 1 audits the same table edge by edge in `dag.mjs`. Reading the table as
// reachability instead rejects every composition that routes a higher layer through its
// mediator - which is the design's normal shape, not a violation.
const LAYER_PACKAGES = [
  { id: 'i', name: 'interfaces-pkg', path: 'crates/interfaces/i', layer: 'interfaces', kind: 'production-library', responsibilities: ['project the core operations'], seed_required: true, owns: {} },
  { id: 'c', name: 'core-pkg', path: 'crates/core/c', layer: 'core', kind: 'production-library', responsibilities: ['own the core records'], seed_required: true, owns: {} },
  { id: 'p', name: 'protocol-pkg', path: 'crates/protocol/p', layer: 'protocol', kind: 'production-library', responsibilities: ['own the protocol records'], seed_required: true, owns: {} },
  { id: 'a', name: 'adapter-pkg', path: 'crates/adapters/a', layer: 'adapters', kind: 'production-library', responsibilities: ['adapt the protocol records'], seed_required: true, owns: {} },
];
const INTERFACES_RULE = [{ from_layer: 'interfaces', forbidden_to: ['protocol', 'ports', 'adapters'] }];

/** A workspace of the four layer packages coupled by the given edges. */
// [::TICKET::] PX-218 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-218 --for-spec --no-implementation-order`.
function layerFixture({ edges, forbiddenLayerRules }) {
  const { manifest: base } = buildValidManifest();
  const boundaries = edges.map((edge, index) => ({
    id: `boundary-${String(index + 1).padStart(3, '0')}`,
    consumer_package: edge.from,
    provider_package: edge.to,
    dependency_reason_code: edge.reasonCode ?? 'canonical-object',
    connection_kind: 'value_only',
    stage2_contract_scope: buildBoundaryContractScope('value_only'),
  }));
  const { manifest } = buildValidManifest({
    workspace: { ...base.workspace, packages: LAYER_PACKAGES },
    dependencies: {
      ...base.dependencies,
      normal_edges: edges,
      boundaries,
      forbidden_layer_rules: forbiddenLayerRules,
      dag: runDagChecks({ packages: LAYER_PACKAGES, edges }),
    },
    stage2_handoff: { ...base.stage2_handoff, contract_boundaries: boundaries },
  });
  const parsedByPackage = new Map(LAYER_PACKAGES.map((pkg) => [pkg.id, {
    contractEdges: contractEdgesForPackage(manifest, pkg.id).map((edge) => buildContractEdge({
      boundaryId: edge.boundary_id,
      sides: { consumer: { packageId: edge.consumer_package }, provider: { packageId: edge.provider_package } },
      relation: { direction: edge.direction, connectionKind: edge.connection_kind },
      content: { owners: edge.owners, clauses: edge.clauses, sourceRefs: edge.source_refs },
    })),
  }]));
  return { manifest, graph: buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest }) };
}

test('C003 interfaces reaching protocol through core is the design composition, not a violation', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});

test('C003 the mediated path creates no report keyed to the source package', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const flows = runGraphViolations({ graph, manifest }).violations
    .filter((entry) => entry.class === 'forbidden_semantic_flow_path');
  assert.deepEqual(flows, []);
  // The hop the walk used to reach through is permitted on its own terms.
  assert.equal(INTERFACES_RULE[0].forbidden_to.includes('core'), false);
});

test('C003 no declared rules means no forbidden flow', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }],
    forbiddenLayerRules: [],
  });
  const report = runGraphViolations({ graph, manifest });
  assert.deepEqual(report.violations, []);
  assert.equal(report.ok, true);
});

test('C004 a direct interfaces -> protocol edge is reported', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'i', to: 'c' }, { from: 'c', to: 'p' }, { from: 'i', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  const report = runGraphViolations({ graph, manifest });
  assert.equal(report.ok, false);
  const entry = report.violations.find((item) => item.class === 'forbidden_semantic_flow_path');
  assert.ok(entry);
  assert.equal(entry.package_id, 'i');
  assert.equal(entry.detail, 'forbidden semantic flow: i -> p');
  assert.ok(report.violations.some((item) => item.class === 'layer_violation'));
});

test('C004 core -> adapters is reported by both sources of truth', () => {
  const { manifest, graph } = layerFixture({
    edges: [{ from: 'c', to: 'a' }],
    forbiddenLayerRules: [{ from_layer: 'core', forbidden_to: ['adapters'] }],
  });
  const report = runGraphViolations({ graph, manifest });
  assert.equal(report.ok, false);
  // layer_violation reads LAYER_FORBIDDEN_TARGETS; forbidden_semantic_flow_path reads
  // the manifest's declaration. Keeping both means a manifest whose rules were narrowed
  // is still caught by the compiled table.
  assert.ok(report.violations.some((entry) => entry.class === 'layer_violation'));
  assert.ok(report.violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
});

test('C004 the PX-194 protocol -> protocol rule still fires on the default edge', () => {
  // The shape of px194-branch-coverage.test.mjs:120-123, which must not be edited: its
  // edge pkg-b -> pkg-a has layer protocol at both ends, so it is itself a declared
  // forbidden pair under either reading of the rules.
  const { manifest, index } = fixture();
  const graph = buildIntegrationGraph({ contractIndex: index, manifest });
  const flowManifest = {
    ...manifest,
    dependencies: { ...manifest.dependencies, forbidden_layer_rules: [{ from_layer: 'protocol', forbidden_to: ['protocol'] }] },
  };
  const report = runGraphViolations({ graph, manifest: flowManifest });
  assert.ok(report.violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
  assert.equal(report.ok, false);
});

test('C004 the classes that share the repaired code paths all still fire', () => {
  const proof = scopeFixture({
    scope: [...TYPED_PROTOCOL_SCOPE, 'proof_verification'],
    omitClauses: ['proof_verification'],
  });
  assert.ok(runGraphViolations({ graph: proof.graph, manifest: proof.manifest })
    .violations.some((entry) => entry.class === 'proof_lifecycle_break'));

  const noTests = scopeFixture({
    scope: TYPED_PROTOCOL_SCOPE,
    connectionKind: 'typed_protocol_input',
    extraClauses: { tests: [] },
  });
  assert.ok(runGraphViolations({ graph: noTests.graph, manifest: noTests.manifest })
    .violations.some((entry) => entry.class === 'missing_test_obligation'));

  const direct = layerFixture({
    edges: [{ from: 'i', to: 'p' }],
    forbiddenLayerRules: INTERFACES_RULE,
  });
  assert.ok(runGraphViolations({ graph: direct.graph, manifest: direct.manifest })
    .violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
  assert.ok(runGraphViolations({ graph: direct.graph, manifest: direct.manifest })
    .violations.some((entry) => entry.class === 'layer_violation'));
});
