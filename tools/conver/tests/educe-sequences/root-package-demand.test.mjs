// PX-355 @verifies C004
// The rail's demand record is a reading of the workspace beside the specification. A root
// package's view is part of that workspace only when the tree manifest names path ".", so
// this test holds both the inclusion and the stray-file boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { demandSummaryBeside } from '../../.claude/scripts/educe-sequences/rail/demand.mjs';

const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';

/** A workspace with one root view and one nested view, and an artifact naming one operation. */
// [::TICKET::] PX-355 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-355 --for-spec --no-implementation-order`.
function workspace({ rootInManifest = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px355-demand-'));
  const packages = [
    ...(rootInManifest ? [{ id: 'pkg-root', path: '.' }] : []),
    { id: 'pkg-a', path: 'crates/pkg-a' },
  ];
  fs.mkdirSync(path.join(root, 'crates', 'pkg-a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ workspace: { packages }, inventory: { objects: [] } }));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: [] }));
  fs.writeFileSync(path.join(root, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-root',
    ownedOperationUnits: [{ unitId: 'op-R-0001', operationId: 'R-0001' }],
    ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], adjudicatedColumns: [],
    obligationSource: 'undeclared',
  }));
  fs.writeFileSync(path.join(root, 'crates', 'pkg-a', 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-a',
    ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [], adjudicatedColumns: [],
    obligationSource: 'undeclared',
  }));

  const artifact = {
    spec: { lines: 10 },
    pins: { sourceEnumerations: [{ role: 'operations', name: 'census-operations', members: ['R-0001'] }] },
    operations: [{ id: 'R-0001', result_object_classes: ['Alpha'] }],
    sequences: [], steps: [], exemptions: [],
  };
  const artifactPath = path.join(root, ARTIFACT_FILENAME);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact));
  return { root, artifactPath, artifact };
}

test('C004 demandSummaryBeside counts the root view owned operation as placed', () => {
  const { root, artifactPath, artifact } = workspace();
  try {
    const summary = demandSummaryBeside(artifactPath, artifact);

    assert.equal(
      summary.coverage.unassigned.some((demand) => demand.axis === 'operations' && demand.id === 'R-0001'),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 demandSummaryBeside leaves the operation unassigned when no manifest names the root', () => {
  const { root, artifactPath, artifact } = workspace({ rootInManifest: false });
  try {
    const summary = demandSummaryBeside(artifactPath, artifact);

    assert.equal(
      summary.coverage.unassigned.some((demand) => demand.axis === 'operations' && demand.id === 'R-0001'),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
