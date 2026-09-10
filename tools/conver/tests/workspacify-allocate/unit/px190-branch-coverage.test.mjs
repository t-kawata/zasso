// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C001 C002 C003 C004 C005
// Branch-coverage hardening for the PX-190 lib modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveExpectedAllocation, buildInventoryIndex, lookupInventoryItem, SEMANTIC_OWNER } from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';
import { buildAuthoringPacket, resolveSourceExcerpt } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { SEED_REQUIRED_SECTIONS } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';

/** Machine sections a render needs under the coupling-first grammar. */
function machineArgs(manifest, pkg) {
  const boundaries = (manifest.dependencies?.boundaries ?? []).filter(
    (boundary) => boundary.consumer_package === pkg.id || boundary.provider_package === pkg.id,
  );
  const contractEdges = boundaries.map((boundary) => buildContractEdge({
    boundaryId: boundary.id,
    consumerPackage: boundary.consumer_package,
    providerPackage: boundary.provider_package,
    direction: boundary.consumer_package === pkg.id ? 'consumer_to_provider' : 'provider_to_consumer',
    connectionKind: boundary.connection_kind,
    owners: { semantic: boundary.provider_package },
    clauses: {},
    sourceRefs: [],
  }));
  return {
    referenceBlock: {
      package: { id: pkg.id, name: pkg.name, path: pkg.path, layer: pkg.layer, kind: pkg.kind, responsibilities: pkg.responsibilities ?? ['x'] },
      source_spec: { path: manifest.input?.spec_path ?? 'spec.md', sha256: manifest.input?.source_hash ?? 'h' },
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity?.manifest_hash ?? 'h' },
      stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
      implementation_order: { before: [], after: [], parallel_with: [], serial_index: 0, wave: 0 },
      contract_refs: contractEdges.map((edge) => edge.contract_id),
      source_segments: [],
    },
    contractEdges,
  };
}
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { runSeedLocalChecks } from '../../../.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs';
import { buildSeedFixture } from '../helpers/build-valid-manifest.mjs';

function sectionsFor() {
  return {
    4: 'body4', 5: 'body5', 6: 'body6', 7: 'body7', 8: 'body8', 9: 'body9', 10: 'body10', 11: 'body11', 12: 'body12', 13: 'body13',
  };
}

test('allocation-model: same-category tie, canonical-name fallback, empty inventory index', () => {
  const packages = [{ id: 'pkg-a' }];
  const entries = [
    { inventory_ref: 'obj-b', category: 'object', owner_package: 'pkg-a' }, // no canonical_name -> fallback
    { inventory_ref: 'obj-a', category: 'object', owner_package: 'pkg-a' },
  ];
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: entries, packages });
  const items = expectedByPackage.get('pkg-a');
  assert.deepEqual(items.map((item) => item.inventory_ref), ['obj-a', 'obj-b']);
  assert.equal(items[0].canonical_name, 'obj-a'); // canonical_name fallback to inventory_ref
  assert.equal(items[0].role, SEMANTIC_OWNER);

  // buildInventoryIndex tolerates missing category lists.
  const sparse = buildInventoryIndex({ inventory: { objects: [{ id: 'o1' }] } });
  assert.equal(sparse.get('object:o1').id, 'o1');
  assert.equal(sparse.get('claim:missing'), undefined);
  assert.equal(buildInventoryIndex({}).size, 0);
  assert.equal(lookupInventoryItem({ inventory: { objects: [{ id: 'o1' }] } }, 'claim', 'c1'), undefined);
});

test('seed-authoring-packet: unknown package throws', () => {
  const { manifest } = buildSeedFixture();
  assert.throws(() => buildAuthoringPacket({ manifest, sourceText: 'x', packageId: 'ghost' }), (e) => e.message.includes('not in the manifest catalog'));
});

test('seed-local-checks: each structural defect is reported', () => {
  const { manifest } = buildSeedFixture();
  const packages = manifest.workspace.packages;
  const expected = manifest.workspace.ownership.entries.filter((entry) => entry.owner_package === 'pkg-a').map((entry) => ({ category: entry.category, inventory_ref: entry.inventory_ref, canonical_name: entry.canonical_name, role: SEMANTIC_OWNER }));
  const validHeadings = SEED_REQUIRED_SECTIONS.map((section) => ({ index: section.index, title: section.title, body: 'x' }));
  const base = { package: packages[0], expectedAllocation: expected };

  // wrong heading count
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: validHeadings.slice(0, 14), allocationIndexRows: [] }, ...base }).ok, false);
  // missing heading (shorter array triggers missing + count errors)
  assert.ok(runSeedLocalChecks({ parsedSeed: { headings: validHeadings.slice(0, 14), allocationIndexRows: [] }, ...base }).errors.length > 0);
  // mistitled heading
  const mistitled = validHeadings.map((h, i) => (i === 0 ? { ...h, title: 'Wrong' } : h));
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: mistitled, allocationIndexRows: expected }, ...base }).ok, false);
  // empty body
  const emptyBody = validHeadings.map((h, i) => (i === 3 ? { ...h, body: '' } : h));
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: emptyBody, allocationIndexRows: expected }, ...base }).ok, false);
  // unknown category row
  const unknownCategory = [{ category: 'gizmo', inventory_ref: 'g1', canonical_name: 'g1' }];
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: validHeadings, allocationIndexRows: unknownCategory }, ...base }).ok, false);
  // duplicate row
  const dupRow = [...expected, expected[0]];
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: validHeadings, allocationIndexRows: dupRow }, ...base }).ok, false);
  // missing owned item (drop one expected row)
  const dropped = expected.slice(1);
  assert.equal(runSeedLocalChecks({ parsedSeed: { headings: validHeadings, allocationIndexRows: dropped }, ...base }).ok, false);
  assert.ok(runSeedLocalChecks({ parsedSeed: { headings: validHeadings, allocationIndexRows: dropped }, ...base }).errors.some((err) => err.includes('missing owned')));
});

test('seed-parse: title/index/title-mismatch and table edge cases', () => {
  const { manifest } = buildSeedFixture();
  const packages = manifest.workspace.packages;
  const expected = manifest.workspace.ownership.entries.filter((entry) => entry.owner_package === 'pkg-a').map((entry) => ({ category: entry.category, inventory_ref: entry.inventory_ref, canonical_name: entry.canonical_name, role: SEMANTIC_OWNER }));
  const good = renderSeed({ ...machineArgs(manifest, packages[0]), package: packages[0], manifest, expectedAllocation: expected, aiSections: sectionsFor() }).seedText;

  assert.throws(() => parseSeed('no title here\n' + good), (e) => e.gateId !== undefined);
  const wrongIndex = good.replace('## 2. Coupling Contracts (I/O Boundary)', '## 9. Coupling Contracts (I/O Boundary)');
  assert.throws(() => parseSeed(wrongIndex), (e) => e.gateId !== undefined);
  const wrongTitle = good.replace('## 2. Coupling Contracts (I/O Boundary)', '## 2. Coupling Contracts (I/O Boundary) X');
  assert.throws(() => parseSeed(wrongTitle), (e) => e.gateId !== undefined);

  // A section-3 body with a table but no Category header yields zero rows.
  const noHeader = good.replace('| Category | Inventory ID | Canonical Name |', '| x | y | z |');
  assert.deepEqual(parseSeed(noHeader).allocationIndexRows, []);

  // A row with the wrong cell count is a hard parse error.
  const badCells = good.replace('| object | obj-000001 | Alpha Record |', '| object | obj-000001 |');
  assert.throws(() => parseSeed(badCells), (e) => e.gateId !== undefined);
});

test('seed-render: empty-allocation scaffolding and invalid AI body', () => {
  const { manifest } = buildSeedFixture();
  const packages = manifest.workspace.packages;
  // A package owning nothing renders not_applicable ownership + trace bodies.
  const emptyPkg = { ...packages[1], owns: {} };
  const emptyAllocation = [];
  const rendered = renderSeed({ ...machineArgs(manifest, emptyPkg), package: emptyPkg, manifest, expectedAllocation: emptyAllocation, aiSections: sectionsFor() });
  assert.ok(rendered.seedText.includes('not_applicable'));

  // An AI body that is an empty string is invalid and blocks the render.
  const sections = sectionsFor();
  sections[4] = '';
  assert.throws(() => renderSeed({ ...machineArgs(manifest, packages[0]), package: packages[0], manifest, expectedAllocation: [], aiSections: sections }), (e) => e.gateId !== undefined);
});

test('seed-parse: resolveSourceExcerpt out-of-range ref falls back to occurrence', () => {
  const sourceText = 'alpha\nobj-000001 target\n';
  const excerpt = resolveSourceExcerpt({ sourceText, sourceRefs: [{ line_start: 99, line_end: 99 }], canonicalName: 'obj-000001' });
  assert.ok(excerpt.includes('obj-000001'));
});

test('seed-authoring-packet: partial refs, sparse manifests, and conformance obligations', () => {
  const sourceText = 'line1\npkg-x target here\n';
  // A ref that lacks line_end is skipped in favour of the name-occurrence window.
  const partial = resolveSourceExcerpt({ sourceText, sourceRefs: [{ line_start: 1 }], canonicalName: 'pkg-x' });
  assert.ok(partial.includes('pkg-x'));
  // An inverted line range is unusable and also falls back to the occurrence.
  const inverted = resolveSourceExcerpt({ sourceText, sourceRefs: [{ line_start: 2, line_end: 1 }], canonicalName: 'pkg-x' });
  assert.ok(inverted.includes('pkg-x'));
  // No canonical name and no usable ref yields null (never a fabricated string).
  assert.equal(resolveSourceExcerpt({ sourceText: 'a\nb\n', sourceRefs: [], canonicalName: '' }), null);

  // Sparse manifest: no inventory, no dependencies, no conformance.
  const sparse = {
    workspace: {
      packages: [{ id: 'pkg-x', name: 'x', path: 'x', layer: 'protocol', kind: 'production-library', seed_required: true, owns: {} }],
      ownership: { entries: [] },
    },
  };
  const packet = buildAuthoringPacket({ manifest: sparse, sourceText, packageId: 'pkg-x' });
  assert.equal(packet.package.id, 'pkg-x');
  assert.deepEqual(packet.owned_items, []);
  assert.deepEqual(packet.forbidden_edges, []);
  assert.deepEqual(packet.contract_context, []);
  assert.equal(packet.conformance_obligation, null);

  // Conformance obligation present + unrelated forbidden edge exercises filters.
  const rich = {
    workspace: {
      packages: [
        { id: 'pkg-x', name: 'x', path: 'x', layer: 'protocol', kind: 'conformance', seed_required: true, owns: {} },
        { id: 'pkg-y', name: 'y', path: 'y', layer: 'protocol', kind: 'production-library', seed_required: true, owns: {} },
      ],
      ownership: { entries: [] },
    },
    dependencies: {
      orientation: 'consumer_to_direct_dependency',
      normal_edges: [{ from: 'pkg-x', to: 'pkg-y', reasonCode: 'dep' }],
      forbidden_edges: [
        { from: 'pkg-x', to: 'ghost', reasonCode: 'f' },
        { from: 'pkg-y', to: 'ghost2', reasonCode: 'unrelated' }, // exercises the false branch of the forbidden filter
      ],
      forbidden_layer_rules: [],
      dev_dependency_policy: [],
      boundaries: [{ id: 'b1', consumer_package: 'pkg-x', provider_package: 'pkg-y', dependency_reason_code: 'dep', stage2_contract_scope: [] }],
    },
    conformance: { test_obligations: [{ package: 'pkg-x', obligation: 'sink' }], ci_rules: [] },
  };
  const richPacket = buildAuthoringPacket({ manifest: rich, sourceText, packageId: 'pkg-x' });
  assert.equal(richPacket.conformance_obligation, 'this package is the test sink: it owns verification obligations, never production dependencies');
  assert.equal(richPacket.contract_context[0].counterpart_package.id, 'pkg-y');
  assert.equal(richPacket.forbidden_edges.length, 1);
  assert.equal(richPacket.contract_context[0].required_clauses.length >= 0, true);
});
