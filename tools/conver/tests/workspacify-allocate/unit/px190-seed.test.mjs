// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C003 C004 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveExpectedAllocation } from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { runSeedParity } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parity.mjs';
import { runSeedLocalChecks } from '../../../.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs';
import { buildContractEdge } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { baseAiSections, buildValidManifest, contractEdgesForPackage } from '../helpers/build-valid-manifest.mjs';

function aiSectionsFor() {
  return {
    ...baseAiSections(),
    4: 'The alpha record object and its validity invariant.',
    5: 'Consumer obligations from pkg-b.',
    6: 'Provider obligations to consumers.',
  };
}

/** Machine inputs a render needs under the coupling-first grammar. */
function machineInputsFor(manifest, pkg) {
  const referenceBlock = {
    package: { id: pkg.id, name: pkg.name, path: pkg.path, layer: pkg.layer, kind: pkg.kind, responsibilities: pkg.responsibilities },
    source_spec: { path: manifest.input.spec_path, sha256: manifest.input.source_hash },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
    stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
    implementation_order: { before: [], after: [], parallel_with: [], serial_index: 0, wave: 0 },
    contract_refs: contractEdgesForPackage(manifest, pkg.id).map((edge) => edge.contract_id),
    source_segments: [],
  };
  const contractEdges = contractEdgesForPackage(manifest, pkg.id).map((edge) => buildContractEdge({
    boundaryId: edge.boundary_id,
    consumerPackage: edge.consumer_package,
    providerPackage: edge.provider_package,
    direction: edge.direction,
    connectionKind: edge.connection_kind,
    owners: edge.owners,
    clauses: edge.clauses,
    sourceRefs: edge.source_refs,
  }));
  return { referenceBlock, contractEdges };
}

function renderFor(manifest, pkg, aiSections) {
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages: manifest.workspace.packages });
  return renderSeed({
    package: pkg,
    manifest,
    expectedAllocation: expectedByPackage.get(pkg.id),
    ...machineInputsFor(manifest, pkg),
    aiSections,
  });
}

test('C003 renderSeed then parseSeed round-trips the Allocation Index', () => {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const first = renderFor(manifest, pkg, aiSectionsFor());
  const second = renderFor(manifest, pkg, aiSectionsFor());
  assert.equal(first.seedText, second.seedText); // determinism
  const parsed = parseSeed(first.seedText);
  assert.equal(parsed.packageName, 'alpha');
  assert.equal(parsed.headings.length, 14);
  const keys = parsed.allocationIndexRows.map((row) => `${row.category}:${row.inventory_ref}`).sort();
  assert.deepEqual(keys, ['object:obj-000001', 'object:obj-000002']);
});

test('C003 renderSeed rejects a payload missing an AI-authored section', () => {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const sections = aiSectionsFor();
  delete sections[13];
  assert.throws(() => renderFor(manifest, pkg, sections), (e) => e.gateId !== undefined);
});

test('C003 parseSeed rejects out-of-order headings and empty bodies', () => {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const good = renderFor(manifest, pkg, aiSectionsFor()).seedText;

  const reordered = good.replace('## 2. Coupling Contracts (I/O Boundary)', '## 3. Source Coverage and Allocation Index\n## 2. Coupling Contracts (I/O Boundary)');
  assert.throws(() => parseSeed(reordered), (e) => e.gateId !== undefined);

  const emptyBody = good.replace('## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals\n\nForbidden dependencies, non-interference boundaries and non-goals from the manifest.', '## 13. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals\n\n');
  assert.throws(() => parseSeed(emptyBody), (e) => e.gateId !== undefined);
});

test('C004 runSeedParity ok for the fixture and detects each violation class', () => {
  const { manifest } = buildValidManifest();
  const packages = manifest.workspace.packages;
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const parsedByPackage = new Map();
  for (const pkg of packages) {
    parsedByPackage.set(pkg.id, parseSeed(renderFor(manifest, pkg, aiSectionsFor()).seedText).allocationIndexRows);
  }
  const report = runSeedParity({ expectedByPackage, parsedByPackage });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.crossPackage, []);

  // missing
  const missingRows = new Map(parsedByPackage);
  missingRows.set('pkg-a', parsedByPackage.get('pkg-a').filter((row) => row.inventory_ref !== 'obj-000001'));
  assert.ok(runSeedParity({ expectedByPackage, parsedByPackage: missingRows }).missing.includes('object:obj-000001'));

  // crossPackage: pkg-b claims pkg-a's object
  const crossRows = new Map(parsedByPackage);
  crossRows.set('pkg-b', [...parsedByPackage.get('pkg-b'), { category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' }]);
  assert.ok(runSeedParity({ expectedByPackage, parsedByPackage: crossRows }).crossPackage.includes('object:obj-000001'));

  // unknown
  const ghostRows = new Map(parsedByPackage);
  ghostRows.set('pkg-b', [...parsedByPackage.get('pkg-b'), { category: 'object', inventory_ref: 'ghost-1', canonical_name: 'ghost' }]);
  assert.ok(runSeedParity({ expectedByPackage, parsedByPackage: ghostRows }).unknown.includes('object:ghost-1'));

  // duplicate within a seed: pkg-a claims its own object twice
  const dupRows = new Map(parsedByPackage);
  dupRows.set('pkg-a', [...parsedByPackage.get('pkg-a'), ...parsedByPackage.get('pkg-a')]);
  assert.ok(runSeedParity({ expectedByPackage, parsedByPackage: dupRows }).duplicate.length > 0);
});

test('C005 runSeedLocalChecks passes for a correct seed and flags structural defects', () => {
  const { manifest } = buildValidManifest();
  const packages = manifest.workspace.packages;
  const pkg = packages[0];
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const expectedAllocation = expectedByPackage.get(pkg.id);
  const seedText = renderFor(manifest, pkg, aiSectionsFor()).seedText;
  const parsed = parseSeed(seedText);
  const good = runSeedLocalChecks({ parsedSeed: parsed, package: pkg, expectedAllocation });
  assert.equal(good.ok, true, JSON.stringify(good.errors));

  // An extra neighbor-owned item in the index fails the local check.
  const tampered = { ...parsed, allocationIndexRows: [...parsed.allocationIndexRows, { category: 'claim', inventory_ref: 'c-1', canonical_name: 'Beta Claim' }] };
  const bad = runSeedLocalChecks({ parsedSeed: tampered, package: pkg, expectedAllocation });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((err) => err.includes('c-1')));
});
