// PX-320 @verifies C003
// An empty package view is additive: smooth accepts it without a map, so graphify
// admission and the final verifier must accept it for the same reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyViewAgainstMap } from '../../.claude/scripts/rfc-graph/attach-unit-ids.js';
import { main as verifyChainMain, verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { mapDigest, viewDigest } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';

/** A view that distributes no unit. */
// [::TICKET::] PX-320 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-320 --for-spec --no-implementation-order`.
function emptyView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

test('C003 an empty view with no map passes admission and the final verifier', () => {
  const view = emptyView();
  assert.deepEqual(verifyViewAgainstMap({ view, map: null, artifact: null, registry: [] }), []);

  const packageDir = mkdtempSync(join(tmpdir(), 'px320-empty-view-'));
  try {
    writeFileSync(join(packageDir, 'SEQUENCES.json'), `${JSON.stringify(view, null, 2)}\n`);
    writeFileSync(join(packageDir, 'P-GRAPH.json'), `${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`);
    const code = verifyChainMain(['--stage=graphify', '--package', packageDir]);
    assert.equal(code, 0);
  } finally {
    rmSync(packageDir, { recursive: true, force: true });
  }
});

test('C003 an empty package split with no distribution record passes', () => {
  const view = emptyView();
  const graph = { nodes: [], edges: [] };
  const tickets = { phases: [] };
  const result = verifyChain({
    view,
    map: null,
    graph,
    dirsTree: null,
    tickets,
    artifact: null,
    registry: [],
    stage: 'split',
  });
  assert.deepEqual(result.findings, []);
});

test('C003 an empty view still owes its registry boundary units', () => {
  const view = emptyView();
  const registry = [{
    boundary_id: 'boundary-001',
    provider_package: 'pkg-1',
    consumer_package: 'pkg-2',
  }];
  const findings = verifyViewAgainstMap({ view, map: null, artifact: null, registry });
  assert.ok(findings.some((finding) =>
    finding.code === 'MISSING_BOUNDARY_CONTRACT' && finding.subject === 'ctr-boundary-001'));
});

test('C003 an empty view cannot accept a non empty map or graph', () => {
  const view = emptyView();
  const staleMap = {
    schemaVersion: 1,
    packageId: 'pkg-1',
    sourceViewDigest: viewDigest(view),
    units: [{ unitId: 'op-X', kind: 'operation', owners: ['pkg-1'], sections: ['1'], ground: 'stale' }],
    residuals: [],
  };
  staleMap.digest = mapDigest(staleMap);
  const mapFindings = verifyViewAgainstMap({ view, map: staleMap, artifact: null, registry: [] });
  assert.ok(mapFindings.some((finding) => finding.code === 'UNIT_SET_MISMATCH'));

  const graph = { nodes: [{ id: 'N0001', unitIds: ['op-X'] }], edges: [] };
  const result = verifyChain({
    view,
    map: null,
    graph,
    dirsTree: null,
    tickets: null,
    artifact: null,
    registry: [],
    stage: 'graphify',
  });
  assert.ok(result.findings.some((finding) => finding.code === 'UNIT_SET_MISMATCH'));
});
