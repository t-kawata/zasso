// PX-323 @verifies C004 C008
// Split attaches prerequisites only when the distribution data exists; a package without a
// view keeps the old ticket shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { attachPrerequisites } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function workspaceFixture() {
  const root = mkdtempSync(join(tmpdir(), 'px323-split-'));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ artifact_kind: 'workspacify-allocate-manifest', contract_registry: [] }));
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-1', path: 'crates/pkg-1' }] },
  }));
  writeFileSync(join(root, 'DESIGN-sequences.json'), JSON.stringify({
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      { id: 'S__s1', stepId: 'S__s1', sequence: 'S', operation: 'Op1', order: 1, contract: { produces: ['object:X'] } },
      { id: 'S__s2', stepId: 'S__s2', sequence: 'S', operation: 'Op2', order: 2, contract: { consumes: ['object:X'] } },
    ],
  }));
  mkdirSync(join(root, 'crates/pkg-1'), { recursive: true });
  return root;
}

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function view() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-Op1', operationId: 'Op1', ownerPackageIds: ['pkg-1'], roleCandidate: 'implementer' },
      { unitId: 'op-Op2', operationId: 'Op2', ownerPackageIds: ['pkg-1'], roleCandidate: 'implementer' },
    ],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ticketDocument() {
  return {
    title: 't',
    metadata: {},
    phases: [{
      id: 0,
      tickets: [
        { id: 1, phaseId: 0, status: 'todo', contracts: [], nodeIds: ['N0001'], distribution: { units: [{ unitId: 'op-Op1', kind: 'operation', obligation: { mode: 'implement' } }] } },
        { id: 2, phaseId: 0, status: 'todo', contracts: [], nodeIds: ['N0002'], distribution: { units: [{ unitId: 'op-Op2', kind: 'operation', obligation: { mode: 'implement' } }] } },
      ],
    }],
  };
}

test('C004 split attaches a same-package sequence prerequisite', async () => {
  const root = workspaceFixture();
  const document = ticketDocument();
  await attachPrerequisites({
    ticketsDocument: document,
    graphData: { edges: [] },
    view: view(),
    packageDirectory: join(root, 'crates/pkg-1'),
  });
  const consumer = document.phases[0].tickets[1];
  assert.equal(consumer.prerequisites.length, 1);
  assert.equal(consumer.prerequisites[0].ticket, 'P0-1');
  assert.equal(consumer.prerequisites[0].kind, 'implementation');
  assert.match(consumer.prerequisites[0].source, /^sequence:S:/);
  rmSync(root, { recursive: true, force: true });
});

test('C004 split attaches a same-package graph prerequisite', async () => {
  const root = workspaceFixture();
  const document = ticketDocument();
  await attachPrerequisites({
    ticketsDocument: document,
    graphData: { edges: [{ from: 'N0002', to: 'N0001', type: 'depends_on', attributes: { strength: 'hard' } }] },
    view: view(),
    packageDirectory: join(root, 'crates/pkg-1'),
  });
  const consumer = document.phases[0].tickets[1];
  assert.ok(consumer.prerequisites.some((entry) => entry.ticket === 'P0-1' && entry.source === 'graph:depends_on:N0002->N0001'));
  rmSync(root, { recursive: true, force: true });
});

test('C008 no view produces no prerequisites field', async () => {
  const root = workspaceFixture();
  const document = ticketDocument();
  await attachPrerequisites({
    ticketsDocument: document,
    graphData: { edges: [{ from: 'N0002', to: 'N0001', type: 'depends_on' }] },
    view: null,
    packageDirectory: join(root, 'crates/pkg-1'),
  });
  assert.equal(document.phases[0].tickets[0].prerequisites, undefined);
  assert.equal(document.phases[0].tickets[1].prerequisites, undefined);
  rmSync(root, { recursive: true, force: true });
});
