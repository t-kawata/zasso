// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C001 C002 C003 C004
// Branch hardening: the violation classes and the order/proof rejection paths that
// the behaviour suites reach only through one example each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { buildContractIndex, runBilateralSymmetry, findUnseededEndpoints } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildIntegrationGraph, runGraphViolations } from '../../../.claude/scripts/workspacify-allocate/lib/wig.mjs';
import { deriveImplementationOrder, verifyOrderAgainstStage1, describeOrderForPackage } from '../../../.claude/scripts/workspacify-allocate/lib/implementation-order.mjs';
import { walkSeedContracts, describeWalkTargets } from '../../../.claude/scripts/workspacify-allocate/walk-seed-contracts.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';

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
  return { manifest, parsedByPackage, graph: buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest }) };
}

test('C001 an unseeded endpoint and a missing counterpart side are reported', () => {
  const { manifest } = fixture();
  const unseeded = { ...manifest, workspace: { ...manifest.workspace, packages: manifest.workspace.packages.map((pkg) => (pkg.id === 'pkg-b' ? { ...pkg, seed_required: false } : pkg)) } };
  assert.deepEqual(findUnseededEndpoints(unseeded), ['pkg-b']);
  const report = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: new Map(), manifest: unseeded }), manifest: unseeded });
  assert.equal(report.ok, false);
  assert.deepEqual(report.unseeded_endpoints, ['pkg-b']);

  const neither = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: new Map(), manifest }), manifest });
  assert.deepEqual(neither.missing_counterpart, ['contract-boundary-001']);
  assert.ok(neither.details[0].reason.includes('neither side'));
});

test('C001 mirror comparison notices a differing connection kind or source refs', () => {
  const { manifest, parsedByPackage } = fixture();
  const mutated = new Map(parsedByPackage);
  mutated.set('pkg-a', {
    ...mutated.get('pkg-a'),
    contractEdges: mutated.get('pkg-a').contractEdges.map((edge) => ({ ...edge, connection_kind: 'port_contract', source_refs: ['s-000009'] })),
  });
  const report = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: mutated, manifest }), manifest });
  assert.equal(report.ok, false);
  assert.ok(report.content_mismatch[0].clauses.includes('connection_kind'));
  assert.ok(report.content_mismatch[0].clauses.includes('source_refs'));
});

test('C002 reverse edges, cycles, state conflicts, effect races and forbidden flows are detected', () => {
  const { manifest, graph } = fixture();

  const reversed = {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      normal_edges: [{ from: 'pkg-a', to: 'pkg-b', reasonCode: 'x', reason: 'y' }],
      boundaries: [{ ...manifest.dependencies.boundaries[0], consumer_package: 'pkg-a', provider_package: 'pkg-b' }],
    },
  };
  const reversedIndex = buildContractIndex({
    parsedByPackage: new Map([
      ['pkg-a', { contractEdges: [buildContractEdge({
      boundaryId: 'boundary-001',
      sides: {
        consumer: { packageId: 'pkg-b' },
        provider: { packageId: 'pkg-a' },
      },
      relation: { direction: 'consumer_to_provider', connectionKind: 'value_only' },
      content: { owners: {}, clauses: { input: 'i', output: 'o', preconditions: ['p'], postconditions: ['q'], invariants: ['r'], tests: ['t'] }, sourceRefs: [] },
    })] }],
    ]),
    manifest: reversed,
  });
  const reversedGraph = buildIntegrationGraph({ contractIndex: reversedIndex, manifest: reversed });
  assert.equal(reversedGraph.edges.length, 1);
  assert.ok(runGraphViolations({ graph: reversedGraph, manifest: reversed }).violations.some((entry) => entry.class === 'reverse_edge'));

  const cyclicGraph = {
    nodes: graph.nodes,
    edges: [...graph.edges, { ...graph.edges[0], contract_id: 'contract-boundary-002', boundary_id: 'boundary-002', consumer_package: 'pkg-a', provider_package: 'pkg-b' }],
  };
  assert.ok(runGraphViolations({ graph: cyclicGraph, manifest }).violations.some((entry) => entry.class === 'cycle'));

  const stateConflict = {
    nodes: graph.nodes,
    edges: [
      { ...graph.edges[0], contract: { ...graph.edges[0].contract, owners: { ...graph.edges[0].contract.owners, state: 'pkg-a' } } },
      { ...graph.edges[0], contract_id: 'contract-boundary-003', boundary_id: 'boundary-003', contract: { ...graph.edges[0].contract, owners: { ...graph.edges[0].contract.owners, state: 'pkg-b' } } },
    ],
  };
  const stateReport = runGraphViolations({ graph: stateConflict, manifest });
  assert.ok(stateReport.violations.some((entry) => entry.class === 'state_mutation_conflict'));
  assert.ok(stateReport.violations.some((entry) => entry.class === 'owner_collision'));

  const effectRace = {
    nodes: graph.nodes,
    edges: [
      { ...graph.edges[0], contract: { ...graph.edges[0].contract, owners: { ...graph.edges[0].contract.owners, side_effect: 'pkg-a' } } },
      { ...graph.edges[0], contract_id: 'contract-boundary-004', boundary_id: 'boundary-004', contract: { ...graph.edges[0].contract, owners: { ...graph.edges[0].contract.owners, side_effect: 'pkg-b' } } },
    ],
  };
  assert.ok(runGraphViolations({ graph: effectRace, manifest }).violations.some((entry) => entry.class === 'side_effect_race'));

  const flowManifest = {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      forbidden_layer_rules: [{ from_layer: 'protocol', forbidden_to: ['protocol'] }],
    },
  };
  assert.ok(runGraphViolations({ graph, manifest: flowManifest }).violations.some((entry) => entry.class === 'forbidden_semantic_flow_path'));
  assert.ok(Object.keys(runGraphViolations({ graph, manifest }).summary.by_layer).length > 0);
});

test('C003 malformed and mismatching stage-1 proofs are rejected', () => {
  const { manifest, graph } = fixture();
  const derived = deriveImplementationOrder({ graph, manifest });

  assert.equal(verifyOrderAgainstStage1({ derived, manifest: { dependencies: {} } }).ok, false);
  const shortened = { ...manifest, dependencies: { ...manifest.dependencies, dag: { ...manifest.dependencies.dag, implementation_order: { serial: ['pkg-a'], levels: [['pkg-a']] } } } };
  assert.ok(verifyOrderAgainstStage1({ derived, manifest: shortened }).reason.includes('length differs'));
  const sameLengthDifferentLevels = { ...manifest, dependencies: { ...manifest.dependencies, dag: { ...manifest.dependencies.dag, implementation_order: { serial: derived.serial, levels: [['pkg-a', 'pkg-b']] } } } };
  assert.ok(verifyOrderAgainstStage1({ derived, manifest: sameLengthDifferentLevels }).reason.includes('levels differ'));
  assert.equal(describeOrderForPackage({ derived: { serial: [], levels: [] }, packageId: 'pkg-a' }).wave, -1);
});

test('C004 the walker reports a workspace whose leaves are described but empty', () => {
  const fixture194 = materializeSeedFixture();
  try {
    const plan = { relativeDirs: ['crates', 'crates/protocol', 'crates/protocol/alpha'] };
    assert.deepEqual(describeWalkTargets({ plan }), ['crates/protocol/alpha']);
    const walk = walkSeedContracts({ root: fixture194.dir, plan });
    assert.deepEqual(walk.missingSeeds, ['crates/protocol/alpha']);
    assert.deepEqual(walk.missingReferences, []);
  } finally {
    rmSync(fixture194.dir, { recursive: true, force: true });
  }
});
