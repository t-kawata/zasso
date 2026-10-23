// PX-308 @verifies C008
// The graph stage already knows how to prove a boundary reaches a contract edge; the check
// only ran when the operator remembered a flag. Discovery makes it part of the stage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveRegistryPath,
  verifyGraphContracts,
} from '../../.claude/scripts/tickets/verify-graph-contracts.js';

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function withWorkspace(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px308-registry-'));
  try {
    fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), '{}');
    fs.writeFileSync(
      path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
      JSON.stringify({ contract_registry: [{ boundary_id: 'boundary-001' }] }),
    );
    fs.mkdirSync(path.join(root, 'pkg'));
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function withIsolatedDirectory(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px308-no-workspace-'));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('C008 the allocate manifest is discovered from the graph directory', () => {
  withWorkspace((root) => {
    const graphPath = path.join(root, 'pkg', 'P-GRAPH.json');
    fs.writeFileSync(graphPath, '{}');
    assert.equal(
      resolveRegistryPath(graphPath, null),
      path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
    );
  });
});

test('C008 an explicit registry path wins over discovery', () => {
  withWorkspace((root) => {
    const graphPath = path.join(root, 'pkg', 'P-GRAPH.json');
    const explicit = path.join(root, 'EXPLICIT.json');
    fs.writeFileSync(graphPath, '{}');
    assert.equal(resolveRegistryPath(graphPath, explicit), explicit);
  });
});

test('C008 outside a workspacify workspace nothing is discovered', () => {
  withIsolatedDirectory((root) => {
    const graphPath = path.join(root, 'P-GRAPH.json');
    fs.writeFileSync(graphPath, '{}');
    assert.equal(resolveRegistryPath(graphPath, null), null);
  });
});

test('C008 a boundary with no contract edge fails, and a contracted one passes', () => {
  const graph = {
    nodes: [{ id: 'N0001', unitIds: ['ctr-boundary-001'] }],
    edges: [],
  };
  assert.ok(verifyGraphContracts(graph, { registryBoundaryIds: ['boundary-001'] })
    .some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT'));

  const contracted = {
    nodes: [{ id: 'N0001', unitIds: ['ctr-boundary-001'] }, { id: 'N0002', unitIds: [] }],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      contracts: [{ id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' }],
    }],
  };
  assert.deepEqual(verifyGraphContracts(contracted, { registryBoundaryIds: ['boundary-001'] }), []);
});
