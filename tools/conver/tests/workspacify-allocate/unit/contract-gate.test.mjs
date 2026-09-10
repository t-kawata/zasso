// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C001
// A coupling contract only holds when both sides carry it: the consumer seed and
// the provider seed must state the same contract with mirrored content.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContractIndex, runBilateralSymmetry } from '../../../.claude/scripts/workspacify-allocate/lib/contract-gate.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { buildValidManifest, makeDecisions } from '../helpers/build-valid-manifest.mjs';

function parsedFromDecisions(manifest) {
  const packages = manifest.workspace.packages;
  const parsedByPackage = new Map();
  for (const seed of makeDecisions(manifest).seeds) {
    const pkg = packages.find((candidate) => candidate.id === seed.packageId);
    parsedByPackage.set(seed.packageId, {
      packageName: pkg.name,
      contractEdges: seed.contractEdges.map((edge) => buildContractEdge({
        boundaryId: edge.boundary_id,
        consumerPackage: edge.consumer_package,
        providerPackage: edge.provider_package,
        direction: edge.direction,
        connectionKind: edge.connection_kind,
        owners: edge.owners,
        clauses: edge.clauses,
        sourceRefs: edge.source_refs,
      })),
    });
  }
  return parsedByPackage;
}

test('C001 a symmetric pair reports nothing broken', () => {
  const { manifest } = buildValidManifest();
  const index = buildContractIndex({ parsedByPackage: parsedFromDecisions(manifest), manifest });
  assert.equal(index.size, 1);
  const report = runBilateralSymmetry({ index, manifest });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.missing_in_consumer, []);
  assert.deepEqual(report.missing_in_provider, []);
  assert.deepEqual(report.content_mismatch, []);
});

test('C001 a missing side, a flipped direction and a changed clause are located', () => {
  const { manifest } = buildValidManifest();
  const parsed = parsedFromDecisions(manifest);

  const withoutProvider = new Map(parsed);
  withoutProvider.set('pkg-a', { ...withoutProvider.get('pkg-a'), contractEdges: [] });
  const missing = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: withoutProvider, manifest }), manifest });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing_in_provider, ['contract-boundary-001']);
  assert.equal(missing.details[0].boundary_id, 'boundary-001');

  const withoutConsumer = new Map(parsed);
  withoutConsumer.set('pkg-b', { ...withoutConsumer.get('pkg-b'), contractEdges: [] });
  assert.deepEqual(runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: withoutConsumer, manifest }), manifest }).missing_in_consumer, ['contract-boundary-001']);

  const flipped = new Map(parsed);
  flipped.set('pkg-a', {
    ...flipped.get('pkg-a'),
    contractEdges: flipped.get('pkg-a').contractEdges.map((edge) => ({ ...edge, direction: 'consumer_to_provider' })),
  });
  assert.ok(runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: flipped, manifest }), manifest }).direction_errors.length > 0);

  const weakened = new Map(parsed);
  weakened.set('pkg-a', {
    ...weakened.get('pkg-a'),
    contractEdges: weakened.get('pkg-a').contractEdges.map((edge) => ({ ...edge, clauses: { ...edge.clauses, postconditions: ['weaker'] } })),
  });
  const mismatch = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: weakened, manifest }), manifest });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.content_mismatch[0].contract_id, 'contract-boundary-001');
  assert.ok(mismatch.content_mismatch[0].clauses.includes('postconditions'));
});

test('C001 a duplicate contract id is reported once per pair', () => {
  const { manifest } = buildValidManifest();
  const parsed = parsedFromDecisions(manifest);
  parsed.set('pkg-b', { ...parsed.get('pkg-b'), contractEdges: [...parsed.get('pkg-b').contractEdges, ...parsed.get('pkg-b').contractEdges] });
  const report = runBilateralSymmetry({ index: buildContractIndex({ parsedByPackage: parsed, manifest }), manifest });
  assert.equal(report.ok, false);
  assert.deepEqual(report.duplicate_contract_ids, ['contract-boundary-001']);
});
