// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C002: the seed packet must carry the connection kind stage 1 declared.
//
// The packet used to default a boundary with no kind to value_only, which made
// 56 of 84 contracts state a kind their tree edge never carried. The packet now
// refuses the boundary instead of inventing a kind, and the kind and the clause
// scope are read from the same boundary record.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthoringPacket } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { buildBoundaryContractScope } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';
import { buildValidManifest } from '../helpers/build-valid-manifest.mjs';

// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
function manifestWithBoundary(connectionKind, scope = buildBoundaryContractScope('value_only')) {
  const { manifest } = buildValidManifest();
  const boundary = { ...manifest.dependencies.boundaries[0], stage2_contract_scope: scope };
  delete boundary.connection_kind;
  if (connectionKind !== undefined) boundary.connection_kind = connectionKind;
  return {
    ...manifest,
    dependencies: { ...manifest.dependencies, boundaries: [boundary] },
  };
}

test('C002 the packet refuses a boundary that carries no connection kind', () => {
  const manifest = manifestWithBoundary(undefined);
  const boundary = manifest.dependencies.boundaries[0];

  assert.throws(
    () => buildAuthoringPacket({ manifest, sourceText: 'spec', packageId: boundary.consumer_package }),
    /connection_kind/,
  );
});

test('C002 the packet carries the boundary kind instead of a value_only default', () => {
  const scope = buildBoundaryContractScope('state_transition');
  const manifest = manifestWithBoundary('state_transition', scope);
  const boundary = manifest.dependencies.boundaries[0];

  const packet = buildAuthoringPacket({
    manifest,
    sourceText: 'spec',
    packageId: boundary.consumer_package,
  });
  const context = packet.contract_context.find((entry) => entry.boundary_id === boundary.id);

  assert.equal(context.connection_kind, 'state_transition');
  assert.deepEqual(context.required_clauses, scope);
});

test('C002 the packet refuses an unregistered kind rather than scoping it as core-only', () => {
  const manifest = manifestWithBoundary('not-a-connection-kind');
  const boundary = manifest.dependencies.boundaries[0];

  assert.throws(
    () => buildAuthoringPacket({ manifest, sourceText: 'spec', packageId: boundary.consumer_package }),
    /not-a-connection-kind/,
  );
});
