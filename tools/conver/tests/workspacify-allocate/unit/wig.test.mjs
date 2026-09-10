// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C002
// The Workspace Integration Graph turns the extracted contracts into a workspace
// level proof: unknown packages, self loops, undeclared or forbidden edges, layer
// violations, cycles, owner collisions and missing test obligations are all zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIntegrationGraph, runGraphViolations } from '../../../.claude/scripts/workspacify-allocate/lib/wig.mjs';
import { buildContractIndex } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, makeDecisions } from '../helpers/build-valid-manifest.mjs';

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
