// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C005
// The AI cannot write a complete coupling contract from its own package alone:
// the packet must hand over the counterpart package, the required clause list
// and segment-bounded excerpts for the counterpart's material.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthoringPacket } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { buildValidManifest, DEFAULT_SPEC_TEXT } from '../helpers/build-valid-manifest.mjs';
import { CORE_CONTRACT_CLAUSES } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

test('C005 the packet carries the counterpart package and the required clauses per owned edge', () => {
  const { manifest } = buildValidManifest();
  const packet = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-b' });

  assert.equal(packet.package.id, 'pkg-b');
  const edgeContext = packet.contract_context.find((entry) => entry.boundary_id === 'boundary-001');
  assert.ok(edgeContext, 'the consumer must see its outgoing contract');
  assert.equal(edgeContext.counterpart_package.id, 'pkg-a');
  assert.ok(edgeContext.counterpart_package.responsibilities.length > 0);
  assert.equal(edgeContext.direction, 'consumer_to_provider');

  for (const clause of CORE_CONTRACT_CLAUSES) {
    assert.ok(edgeContext.required_clauses.includes(clause), `required_clauses must include ${clause}`);
    assert.ok(edgeContext.mandatory_clauses.includes(clause), `mandatory_clauses must include ${clause}`);
  }
  assert.ok(edgeContext.required_clauses.includes('tests'), 'the declared scope clauses are handed over');
});

test('C005 the provider sees the same contract from the other side', () => {
  const { manifest } = buildValidManifest();
  const packet = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  const edgeContext = packet.contract_context.find((entry) => entry.boundary_id === 'boundary-001');
  assert.equal(edgeContext.counterpart_package.id, 'pkg-b');
  assert.equal(edgeContext.direction, 'provider_to_consumer');
});

test('C005 the packet hands over segment-bounded excerpts of the counterpart material', () => {
  const { manifest } = buildValidManifest();
  const packet = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-b' });
  const edgeContext = packet.contract_context.find((entry) => entry.boundary_id === 'boundary-001');

  assert.ok(edgeContext.counterpart_excerpts.length > 0);
  for (const excerpt of edgeContext.counterpart_excerpts) {
    assert.match(excerpt.segment_id, /^s-\d{6}$/);
    assert.ok(excerpt.text.length > 0);
    assert.ok(excerpt.line_start >= 1);
  }
});

test('C005 forced separation still reports the forbidden edges and an empty context', () => {
  const { manifest } = buildValidManifest({
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [],
      forbidden_edges: [{ from: 'pkg-b', to: 'pkg-a', reasonCode: 'forbidden', reason: 'must not couple directly' }],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [],
    },
  });
  const packet = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-b' });
  assert.deepEqual(packet.contract_context, []);
  assert.equal(packet.forbidden_edges.length, 1);
  assert.equal(packet.forbidden_edges[0].counterpart_package.id, 'pkg-a');
});

test('C005 a package that owns nothing still yields a packet with its identity and contracts', () => {
  const { manifest } = buildValidManifest();
  const owner = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  assert.ok(owner.owned_items.some((item) => item.inventory_ref === 'obj-000001'));
  assert.equal(owner.conformance_obligation, null);

  const empty = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-b' });
  assert.deepEqual(empty.owned_items, []);
  assert.ok(empty.package.responsibilities.length > 0);
  assert.equal(empty.review_required, false);
  assert.equal(empty.contract_context.length, 1, 'the empty package still sees its declared boundary');
});
