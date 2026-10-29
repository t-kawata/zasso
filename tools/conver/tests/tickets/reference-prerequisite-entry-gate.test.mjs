// PX-329 @verifies C004
// The make entry gate re-derives prerequisites; a reference unit must therefore block
// the consumer until the implementation it names reaches done or reviewed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../.claude/scripts/tickets/check-ticket-prerequisites.js';

// [::TICKET::] PX-329 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-329 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value));
}

// [::TICKET::] PX-329 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-329 --for-spec --no-implementation-order`.
function materializeConsumerPackage({ providerStatus }) {
  const root = mkdtempSync(join(tmpdir(), 'px329-'));
  writeJson(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), {
    artifact_kind: 'workspacify-allocate-manifest',
    contract_registry: [],
  });
  writeJson(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), {
    workspace: { packages: [{ id: 'pkg-1', path: 'pkg-1' }] },
    dependencies: { dag: { canonical_edges: [] } },
  });
  writeJson(join(root, 'DESIGN-sequences.json'), { sequences: [], steps: [], operations: [] });
  mkdirSync(join(root, 'pkg-1'));
  writeJson(join(root, 'pkg-1', 'SEQUENCES.json'), {
    packageId: 'pkg-1',
    ownedOperationUnits: [{ unitId: 'op-X', operationId: 'X', roleCandidate: 'implementer' }],
    obligationUnits: [],
  });
  writeJson(join(root, 'pkg-1', 'DESIGN-GRAPH.json'), {
    nodes: [{ id: 'N1', unitIds: ['op-X'] }],
    edges: [],
  });
  writeJson(join(root, 'pkg-1', 'Tickets.json'), {
    phases: [{
      id: 0,
      tickets: [
        {
          id: 1,
          phaseId: 0,
          status: providerStatus,
          distribution: { units: [
            { unitId: 'op-X', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
          ] },
        },
        {
          id: 2,
          phaseId: 0,
          status: 'made',
          distribution: { units: [
            {
              unitId: 'op-X',
              kind: 'operation',
              role: 'consumer',
              obligation: {
                mode: 'reference',
                implementerTicketId: 1,
                implementerTicketKey: 'P0-1',
                providers: [],
              },
            },
          ] },
          prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'reference:op-X' }],
        },
      ],
    }],
  });
  return root;
}

test('C004 the entry gate blocks a consumer whose reference implementer is planned', () => {
  const root = materializeConsumerPackage({ providerStatus: 'planned' });
  try {
    const result = run([
      '--ticket-key=P0-2',
      `--tickets=${join(root, 'pkg-1', 'Tickets.json')}`,
      `--workspace=${root}`,
    ]);

    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_DONE' && entry.subject === 'P0-1'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 the entry gate passes after the reference implementer is done', () => {
  const root = materializeConsumerPackage({ providerStatus: 'done' });
  try {
    const result = run([
      '--ticket-key=P0-2',
      `--tickets=${join(root, 'pkg-1', 'Tickets.json')}`,
      `--workspace=${root}`,
    ]);

    assert.equal(result.code, 0);
    assert.equal(result.verdict.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
