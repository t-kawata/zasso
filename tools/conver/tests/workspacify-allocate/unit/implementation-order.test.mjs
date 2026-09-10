// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C003
// The implementation order is derived and then verified against the stage-1 proof:
// stage 2 never invents an order, it proves the same one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveImplementationOrder, verifyOrderAgainstStage1, describeOrderForPackage } from '../../../.claude/scripts/workspacify-allocate/lib/implementation-order.mjs';
import { buildIntegrationGraph } from '../../../.claude/scripts/workspacify-allocate/lib/wig.mjs';
import { buildContractIndex } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, makeDecisions } from '../helpers/build-valid-manifest.mjs';

function fixture() {
  const { manifest } = buildValidManifest();
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
  return { manifest, graph: buildIntegrationGraph({ contractIndex: buildContractIndex({ parsedByPackage, manifest }), manifest }) };
}

test('C003 the derived order equals the stage-1 proof', () => {
  const { manifest, graph } = fixture();
  const derived = deriveImplementationOrder({ graph, manifest });
  assert.deepEqual(derived.serial, manifest.dependencies.dag.implementation_order.serial);
  assert.deepEqual(derived.levels, manifest.dependencies.dag.implementation_order.levels);
  assert.deepEqual(verifyOrderAgainstStage1({ derived, manifest }), { ok: true });
  assert.deepEqual(deriveImplementationOrder({ graph, manifest }), derived, 'deriving twice is identical');
});

test('C003 a divergent stage-1 proof is located, not overwritten', () => {
  const { manifest, graph } = fixture();
  const derived = deriveImplementationOrder({ graph, manifest });
  const perturbed = {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      dag: { ...manifest.dependencies.dag, implementation_order: { serial: ['pkg-b', 'pkg-a'], levels: [['pkg-b'], ['pkg-a']] } },
    },
  };
  const verdict = verifyOrderAgainstStage1({ derived, manifest: perturbed });
  assert.equal(verdict.ok, false);
  assert.equal(typeof verdict.index, 'number');
  assert.ok(verdict.reason.includes('implementation_order'));
});

test('C003 the per-package order entry describes waves, before and after', () => {
  const { manifest, graph } = fixture();
  const derived = deriveImplementationOrder({ graph, manifest });
  const provider = describeOrderForPackage({ derived, packageId: 'pkg-a' });
  const consumer = describeOrderForPackage({ derived, packageId: 'pkg-b' });
  assert.equal(provider.serial_index, 0);
  assert.equal(provider.wave, 0);
  assert.deepEqual(provider.after, ['pkg-b']);
  assert.equal(consumer.serial_index, 1);
  assert.equal(consumer.wave, 1);
  assert.deepEqual(consumer.before, ['pkg-a']);
  assert.deepEqual(consumer.parallel_with, []);
});

test('C003 an unknown package and a cyclic graph are handled explicitly', () => {
  const { manifest, graph } = fixture();
  const derived = deriveImplementationOrder({ graph, manifest });
  const unknown = describeOrderForPackage({ derived, packageId: 'pkg-ghost' });
  assert.equal(unknown.serial_index, -1);
  assert.equal(unknown.wave, -1);

  const cyclicGraph = { ...graph, cycles: [['pkg-a', 'pkg-b', 'pkg-a']] };
  const cyclic = deriveImplementationOrder({ graph: cyclicGraph, manifest });
  assert.deepEqual(cyclic, { serial: [], levels: [] });
});
