// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C003 C004 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveExpectedAllocation } from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { runSeedParity } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parity.mjs';
import { runSeedLocalChecks } from '../../../.claude/scripts/workspacify-allocate/lib/seed-local-checks.mjs';
import { buildSeedFixture } from '../helpers/build-valid-manifest.mjs';

function aiSectionsFor() {
  return {
    3: 'Note: allocation table above is authoritative.',
    4: 'The alpha record object and its validity invariant.',
    5: 'Consumer obligations from pkg-b.',
    6: 'Provider obligations to consumers.',
    7: 'Integration Context (Stage-1 Manifest Edges): depends on pkg-b for claims.',
    8: 'not_applicable — alpha keeps no mutable state.',
    9: 'not_applicable — no external I/O.',
    10: 'Canonicalized as canonical JSON with SHA-256.',
    11: 'Failure rules per stage-1 error codes.',
    12: 'Unit, integration, exception and malfeasance tests listed in stage-1.',
    13: 'Grill question: confirm claim verification ownership.',
    15: 'Forbidden: must not depend on foundation internals.',
  };
}

test('C003 renderSeed then parseSeed round-trips the Allocation Index', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const pkg = packages[0];
  const expectedAllocation = expectedByPackage.get(pkg.id);
  const first = renderSeed({ package: pkg, manifest, expectedAllocation, aiSections: aiSectionsFor() });
  const second = renderSeed({ package: pkg, manifest, expectedAllocation, aiSections: aiSectionsFor() });
  assert.equal(first.seedText, second.seedText); // determinism
  const parsed = parseSeed(first.seedText);
  assert.equal(parsed.packageName, 'alpha');
  assert.equal(parsed.headings.length, 15);
  const keys = parsed.allocationIndexRows.map((row) => `${row.category}:${row.inventory_ref}`).sort();
  assert.deepEqual(keys, ['invariant:inv-1', 'object:obj-000001', 'required_test:tst-1'].sort());
});

test('C003 renderSeed rejects a payload missing an AI-authored section', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const pkg = packages[0];
  const sections = aiSectionsFor();
  delete sections[13];
  assert.throws(() => renderSeed({ package: pkg, manifest, expectedAllocation: expectedByPackage.get(pkg.id), aiSections: sections }), (e) => e.gateId !== undefined);
});

test('C003 parseSeed rejects out-of-order headings and empty bodies', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const pkg = packages[0];
  const good = renderSeed({ package: pkg, manifest, expectedAllocation: expectedByPackage.get(pkg.id), aiSections: aiSectionsFor() }).seedText;

  const reordered = good.replace('## 2. Stage 1 Ownership', '## 3. Allocated Specification Material\n## 2. Stage 1 Ownership');
  assert.throws(() => parseSeed(reordered), (e) => e.gateId !== undefined);

  const emptyBody = good.replace('## 15. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals\n\nForbidden: must not depend on foundation internals.', '## 15. Forbidden Dependencies, Non-Interference Boundaries and Non-Goals\n\n');
  assert.throws(() => parseSeed(emptyBody), (e) => e.gateId !== undefined);
});

test('C004 runSeedParity ok for the fixture and detects each violation class', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const parsedByPackage = new Map();
  for (const pkg of packages) {
    const { seedText } = renderSeed({ package: pkg, manifest, expectedAllocation: expectedByPackage.get(pkg.id), aiSections: aiSectionsFor() });
    parsedByPackage.set(pkg.id, parseSeed(seedText).allocationIndexRows);
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

  // duplicate within a seed
  const dupRows = new Map(parsedByPackage);
  dupRows.set('pkg-b', [...parsedByPackage.get('pkg-b'), ...parsedByPackage.get('pkg-b')]);
  assert.ok(runSeedParity({ expectedByPackage, parsedByPackage: dupRows }).duplicate.length > 0);
});

test('C005 runSeedLocalChecks passes for a correct seed and flags structural defects', () => {
  const { manifest, packages } = buildSeedFixture();
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace.ownership.entries, packages });
  const pkg = packages[0];
  const expectedAllocation = expectedByPackage.get(pkg.id);
  const seedText = renderSeed({ package: pkg, manifest, expectedAllocation, aiSections: aiSectionsFor() }).seedText;
  const parsed = parseSeed(seedText);
  const good = runSeedLocalChecks({ parsedSeed: parsed, package: pkg, expectedAllocation });
  assert.equal(good.ok, true, JSON.stringify(good.errors));

  // An extra neighbor-owned item in the index fails the local check.
  const tampered = { ...parsed, allocationIndexRows: [...parsed.allocationIndexRows, { category: 'claim', inventory_ref: 'c-1', canonical_name: 'Beta Claim' }] };
  const bad = runSeedLocalChecks({ parsedSeed: tampered, package: pkg, expectedAllocation });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((err) => err.includes('c-1')));
});
