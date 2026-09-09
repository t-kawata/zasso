// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C001 C002 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deriveExpectedAllocation, SEMANTIC_OWNER } from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';
import { resolveSourceExcerpt, buildAuthoringPacket } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { SEED_REQUIRED_SECTIONS, SEED_FILE_NAME, ALLOCATION_INDEX_HEADERS, assertSeedBodyValid } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { validateAgainstSchema } from '../../../.claude/scripts/workspacify-tree/lib/manifest-schema.mjs';
import { buildSeedFixture } from '../helpers/build-valid-manifest.mjs';

function loadDecisionsSchema() {
  const schemaPath = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/schemas/workspacify-allocate-decisions.schema.json', import.meta.url));
  return JSON.parse(readFileSync(schemaPath, 'utf8'));
}

test('C001 expected allocation bijection over ownership entries', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage, ok, duplicateRefs, unknownRefs } = deriveExpectedAllocation({
    ownershipEntries: manifest.workspace.ownership.entries,
    packages,
  });
  assert.ok(ok, JSON.stringify({ duplicateRefs, unknownRefs }));
  assert.deepEqual(duplicateRefs, []);
  assert.deepEqual(unknownRefs, []);

  const alphaItems = expectedByPackage.get('pkg-a').map((item) => item.inventory_ref).sort();
  assert.deepEqual(alphaItems, ['inv-1', 'obj-000001', 'tst-1']);
  for (const item of expectedByPackage.get('pkg-a')) {
    assert.equal(item.role, SEMANTIC_OWNER);
  }
  assert.deepEqual(expectedByPackage.get('pkg-b').map((item) => item.inventory_ref), ['c-1']);
});

test('C001 duplicate and unknown ownership are reported', () => {
  const packages = [{ id: 'pkg-a' }, { id: 'pkg-b' }];
  const entries = [
    { inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'pkg-a' },
    { inventory_ref: 'obj-1', canonical_name: 'obj-1', category: 'object', owner_package: 'pkg-a' },
    { inventory_ref: 'obj-2', canonical_name: 'obj-2', category: 'object', owner_package: 'ghost' },
  ];
  const { expectedByPackage, ok, duplicateRefs, unknownRefs } = deriveExpectedAllocation({ ownershipEntries: entries, packages });
  assert.equal(ok, false);
  assert.ok(duplicateRefs.includes('object:obj-1'));
  assert.ok(unknownRefs.includes('ghost'));
  // The duplicate does not multiply the expected allocation.
  assert.equal(expectedByPackage.get('pkg-a').filter((i) => i.inventory_ref === 'obj-1').length, 1);
});

test('C001 empty ownership yields empty expected allocation', () => {
  const { expectedByPackage, ok } = deriveExpectedAllocation({ ownershipEntries: [], packages: [] });
  assert.equal(ok, true);
  assert.equal(expectedByPackage.size, 0);
});

test('C002 resolveSourceExcerpt slices real spec lines; unresolvable yields null', () => {
  const sourceText = 'line1\nline2 obj-000001 here\nline3\nline4\n';
  const excerpt = resolveSourceExcerpt({ sourceText, sourceRefs: [{ section_id: 'h-2', line_start: 2, line_end: 2, byte_start: 0, byte_end: 20 }], canonicalName: 'obj-000001' });
  assert.ok(excerpt.includes('obj-000001'));
  assert.equal(resolveSourceExcerpt({ sourceText, sourceRefs: [], canonicalName: 'does-not-exist' }), null);
  // First-occurrence window fallback is deterministic.
  const repeated = 'nothing\nobj-000001 first\nobj-000001 second\n';
  const windowed = resolveSourceExcerpt({ sourceText: repeated, sourceRefs: [], canonicalName: 'obj-000001', windowLines: 1 });
  assert.ok(windowed.includes('first'));
});

test('C002 buildAuthoringPacket returns owned items, excerpts, edges, and reviewRequired', () => {
  const { manifest } = buildSeedFixture();
  const sourceText = '# Spec\n\n## Chapter\n\ntable with obj-000001\n\nBeta Claim here\n';
  const packet = buildAuthoringPacket({ manifest, sourceText, packageId: 'pkg-a' });
  assert.equal(packet.package.id, 'pkg-a');
  assert.deepEqual(packet.ownedItems.map((item) => item.inventory_ref).sort(), ['inv-1', 'obj-000001', 'tst-1']);
  const objectItem = packet.ownedItems.find((item) => item.inventory_ref === 'obj-000001');
  assert.equal(objectItem.source_refs.length, 1);
  // outgoing pkg-a -> pkg-b, forbidden pkg-b -> pkg-a
  assert.deepEqual(packet.dependencyContext.outgoing.map((edge) => edge.to), ['pkg-b']);
  assert.equal(packet.dependencyContext.forbidden.length, 1);
  // The resolvable object is never review-required; items with no source text are.
  assert.equal(packet.reviewRequired.some((item) => item.inventory_ref === 'obj-000001'), false);
});

test('C002 unresolvable excerpt lands in reviewRequired', () => {
  const { manifest } = buildSeedFixture();
  const packet = buildAuthoringPacket({ manifest, sourceText: 'no matching text at all\n', packageId: 'pkg-b' });
  // pkg-b owns c-1 whose canonical name never appears in this sourceText
  assert.ok(packet.reviewRequired.some((item) => item.inventory_ref === 'c-1'));
});

test('C005 seed-model constants and body validation', () => {
  assert.equal(SEED_REQUIRED_SECTIONS.length, 15);
  assert.equal(SEED_REQUIRED_SECTIONS[0].index, 1);
  assert.equal(SEED_REQUIRED_SECTIONS[6].index, 7);
  assert.ok(SEED_REQUIRED_SECTIONS[6].title.includes('Integration Context'));
  assert.equal(SEED_FILE_NAME, 'RFC-SEED.md');
  assert.deepEqual(ALLOCATION_INDEX_HEADERS, ['Category', 'Inventory ID', 'Canonical Name']);
  assert.equal(assertSeedBodyValid('real content'), null);
  assert.ok(assertSeedBodyValid('') !== null);
  assert.ok(assertSeedBodyValid('not_applicable') !== null, 'not_applicable needs a reason');
  assert.equal(assertSeedBodyValid('not_applicable — no persistence'), null);
});

test('C005 decisions schema validates the decisions payload shape', () => {
  const schema = loadDecisionsSchema();
  const okPayload = { seeds: [{ packageId: 'pkg-a', aiSections: { 4: 'body', 5: 'body' } }], semantic_review: { status: 'APPROVED', statement: 'reviewed', approver: 'ai-session' } };
  const reviewPayload = { seeds: [], semantic_review: { status: 'REVIEW_REQUIRED' } };
  assert.ok(validateAgainstSchema(okPayload, schema).valid);
  assert.ok(validateAgainstSchema(reviewPayload, schema).valid);
  const missing = { seeds: [] };
  assert.equal(validateAgainstSchema(missing, schema).valid, false);
  const badStatus = { seeds: [], semantic_review: { status: 'NOPE' } };
  assert.equal(validateAgainstSchema(badStatus, schema).valid, false);
});
