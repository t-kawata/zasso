// PX-321 @verifies C002
// The artifact is the denominator in both directions: the view may not add a step or a
// sequence the artifact never declared. A missing artifact entry is the existing
// MISSING_* direction and stays unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { mapDigest, viewDigest } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { buildConsumerChainFixture } from './helpers/consumer-chain-fixture.mjs';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function rebuildChain(chain, view) {
  const map = { ...chain.map, sourceViewDigest: viewDigest(view) };
  const existing = new Set((map.units ?? []).map((unit) => unit.unitId));
  for (const unit of [
    ...(view.ownedOperationUnits ?? []),
    ...(view.ownedSequenceUnits ?? []),
    ...(view.crossBoundarySequenceUnits ?? []),
    ...(view.obligationUnits ?? []),
  ]) {
    if (existing.has(unit.unitId)) continue;
    map.units.push({ unitId: unit.unitId, kind: unit.unitId.startsWith('xdir-') ? 'cross-boundary-sequence' : 'sequence', sections: ['1'], ground: 'fixture' });
    existing.add(unit.unitId);
  }
  map.digest = mapDigest(map);
  const graph = { ...chain.graph, distributionDigest: map.digest };
  return { ...chain, view, map, graph };
}

test('C002 a view step absent from the artifact is INVENTED_SEQUENCE_STEP', () => {
  const chain = buildConsumerChainFixture({ role: 'implementer' });
  const view = structuredClone(chain.view);
  const sequence = view.crossBoundarySequenceUnits[0] ?? view.ownedSequenceUnits[0];
  sequence.steps.push({ stepId: 's-foreign', operationId: 'Foreign', order: 99, line: 99, quote: 'invented', contract: null, contractProse: 'invented' });
  const result = verifyChain({ ...rebuildChain(chain, view), stage: 'graphify' });
  assert.ok(result.findings.some((finding) => finding.code === 'INVENTED_SEQUENCE_STEP' && finding.subject === 's-foreign'));
});

test('C002 a view sequence absent from the artifact is INVENTED_SEQUENCE', () => {
  const chain = buildConsumerChainFixture({ role: 'implementer' });
  const view = structuredClone(chain.view);
  view.crossBoundarySequenceUnits.push({ unitId: 'xdir-FAKE', sequenceId: 'FAKE', ownerPackageIds: ['pkg-1'], steps: [] });
  const result = verifyChain({ ...rebuildChain(chain, view), stage: 'graphify' });
  assert.ok(result.findings.some((finding) => finding.code === 'INVENTED_SEQUENCE' && finding.subject === 'xdir-FAKE'));
});

test('C002 a legacy artifact without a sequences array skips the invented checks', () => {
  const chain = buildConsumerChainFixture({ role: 'implementer' });
  const view = structuredClone(chain.view);
  const sequence = view.crossBoundarySequenceUnits[0] ?? view.ownedSequenceUnits[0];
  sequence.steps.push({ stepId: 's-legacy', operationId: 'Foreign', order: 99, line: 99, quote: 'legacy', contract: null, contractProse: 'legacy' });
  const artifact = { ...chain.artifact, sequences: undefined };
  const result = verifyChain({ ...rebuildChain(chain, view), artifact, stage: 'graphify' });
  assert.ok(!result.findings.some((finding) => finding.code === 'INVENTED_SEQUENCE_STEP'));
  assert.ok(!result.findings.some((finding) => finding.code === 'INVENTED_SEQUENCE'));
});
