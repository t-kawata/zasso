// @verifies C008
import { describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const verifyModule = await import(new URL(
  '../../../scripts/sequences-slice/verify-implementation-order.mjs',
  import.meta.url,
).href);
const { verifyPackage } = verifyModule;

/** Write one JSON document, creating the parent directory. */
// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * A package shaped like a round transition: a finished consumer records the
 * provider it waited for, and the current round owns that provider's node.
 *
 * The provider node is owned only by the current ticket, so the derivation
 * reaches the current provider for the finished consumer. That is the state the
 * gate rejected before the past-round guard existed.
 */
// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function buildPackage({ withStaleActiveTicket = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prereq-round-'));
  const packageDir = path.join(root, 'pkg-a');

  const historyPhase = {
    id: 0,
    name: 'round one',
    tickets: [
      { id: 1, phaseId: 0, status: 'R1', title: 'finished provider', nodeIds: [] },
      {
        id: 2,
        phaseId: 0,
        status: 'R1',
        title: 'finished consumer',
        nodeIds: ['N0002'],
        prerequisites: [{
          ticket: 'P0-1',
          kind: 'implementation',
          source: 'graph:depends_on:N0002->N0001',
        }],
      },
    ],
  };

  const currentPhase = {
    id: 1,
    name: 'round two',
    tickets: [
      {
        id: 1,
        phaseId: 1,
        status: 'todo',
        title: 'current provider',
        nodeIds: ['N0001'],
        distribution: {
          units: [{ unitId: 'ctr-999', kind: 'ctr', obligation: { mode: 'implement' } }],
        },
      },
      {
        id: 2,
        phaseId: 1,
        status: 'todo',
        title: 'current consumer',
        nodeIds: ['N0003'],
        prerequisites: [{
          ticket: 'P1-1',
          kind: 'implementation',
          source: 'graph:depends_on:N0003->N0001',
        }],
      },
    ],
  };

  if (withStaleActiveTicket) {
    currentPhase.tickets.push({
      id: 3,
      phaseId: 1,
      status: 'todo',
      title: 'stale active ticket',
      nodeIds: [],
      prerequisites: [{
        ticket: 'P1-1',
        kind: 'implementation',
        source: 'graph:depends_on:N0099->N0001',
      }],
    });
  }

  writeJson(path.join(packageDir, 'Tickets.json'), { title: 'fixture', phases: [historyPhase, currentPhase] });
  writeJson(path.join(packageDir, 'SEQUENCES.json'), { packageId: 'pkg-a' });
  writeJson(path.join(packageDir, 'RFC-GRAPH.json'), {
    nodes: [{ id: 'N0001' }, { id: 'N0002' }, { id: 'N0003' }],
    edges: [
      { type: 'depends_on', from: 'N0002', to: 'N0001' },
      { type: 'depends_on', from: 'N0003', to: 'N0001' },
    ],
  });
  return { root, packageDir };
}

const removeTree = (root) => fs.rmSync(root, { recursive: true, force: true });

describe('prerequisite gate and past-round records', () => {
  test('verifyPackage accepts a document whose only stale set belongs to a past round', () => {
    const { root, packageDir } = buildPackage();
    try {
      const result = verifyPackage({ packageDir, write: false });

      assert.deepStrictEqual(result.findings, []);
      assert.strictEqual(result.code, 0);
    } finally {
      removeTree(root);
    }
  });

  test('verifyPackage still reports a stale set on an active ticket', () => {
    const { root, packageDir } = buildPackage({ withStaleActiveTicket: true });
    try {
      const result = verifyPackage({ packageDir, write: false });

      assert.strictEqual(result.code, 1);
      const mismatch = result.findings.find((entry) => entry.code === 'PREREQUISITE_SET_MISMATCH');
      assert.ok(mismatch, 'the stale active ticket is named');
      assert.strictEqual(mismatch.subject, 'P1-3');
      assert.strictEqual(
        result.findings.some((entry) => entry.subject === 'P0-2'),
        false,
        'the finished consumer is never named',
      );
    } finally {
      removeTree(root);
    }
  });
});
