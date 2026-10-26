// PX-310 @verifies C005
// A transaction that reprojects views must also refresh the RFC distribution
// map and anchors. The staged package must pass the same check the detector
// runs on the live workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkDistributionMap } from '../../.claude/scripts/smooth-sequences/lib/checks-distribution-map.mjs';
import { renderDistributionRefresh } from '../../.claude/scripts/regeneration/lib/transaction.mjs';

// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function fixtureView(packageId = 'pkg-1') {
  return {
    packageId,
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: [packageId],
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function fixtureRfc() {
  return [
    '# Package RFC',
    '',
    '## 3.1 Produce',
    '',
    '### 3.1.1 Detail',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '',
  ].join('\n');
}

test('C005 the staged RFC carries the rendered anchor and the map resolves', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-distribution-'));
  try {
    mkdirSync(join(root, 'pkg'), { recursive: true });
    writeFileSync(join(root, 'pkg/RFC.md'), fixtureRfc());
    writeFileSync(join(root, 'pkg/SEQUENCES.json'), JSON.stringify(fixtureView()));
    const treeManifest = { workspace: { packages: [{ id: 'pkg-1', path: 'pkg' }] } };

    const result = renderDistributionRefresh({ stagingRoot: root, treeManifest });
    assert.equal(result.ok, true, result.stderr);

    const rfc = readFileSync(join(root, 'pkg/RFC.md'), 'utf8');
    assert.match(rfc, /<!-- unit: op-Produce -->/);
    assert.deepEqual(checkDistributionMap({ view: fixtureView(), rfc }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C005 a stale map is re-rendered from the changed view', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-distribution-stale-'));
  try {
    mkdirSync(join(root, 'pkg'), { recursive: true });
    writeFileSync(join(root, 'pkg/RFC.md'), fixtureRfc());
    writeFileSync(join(root, 'pkg/SEQUENCES.json'), JSON.stringify(fixtureView()));
    const treeManifest = { workspace: { packages: [{ id: 'pkg-1', path: 'pkg' }] } };

    const first = renderDistributionRefresh({ stagingRoot: root, treeManifest });
    assert.equal(first.ok, true, first.stderr);

    const changed = fixtureView();
    changed.ownedOperationUnits[0].obligation.purpose = 'produce, changed';
    writeFileSync(join(root, 'pkg/SEQUENCES.json'), JSON.stringify(changed));

    const second = renderDistributionRefresh({ stagingRoot: root, treeManifest, onlyExistingMaps: true });
    assert.equal(second.ok, true, second.stderr);
    const rfc = readFileSync(join(root, 'pkg/RFC.md'), 'utf8');
    assert.deepEqual(checkDistributionMap({ view: changed, rfc }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C005 a package without an RFC is skipped, not failed', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-distribution-skip-'));
  try {
    mkdirSync(join(root, 'pkg'), { recursive: true });
    writeFileSync(join(root, 'pkg/SEQUENCES.json'), JSON.stringify(fixtureView()));
    const treeManifest = { workspace: { packages: [{ id: 'pkg-1', path: 'pkg' }] } };
    const result = renderDistributionRefresh({ stagingRoot: root, treeManifest });
    assert.equal(result.ok, true);
    assert.equal(result.rendered, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
