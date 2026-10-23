// PX-308 @verifies C009
// The guarantee is only inspectable if a person can read it. The viewer prints the unit,
// its role, where it landed, the sequence steps it owes and the spec line behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectTicketDistribution,
  renderTicketDistribution,
} from '../../.claude/scripts/tickets/show-ticket-distribution.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIEWER = path.join(PROJECT_ROOT, '.claude/scripts/tickets/show-ticket-distribution.js');

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureTickets() {
  return {
    phases: [{
      id: -1,
      name: 'PX',
      nodeIds: [],
      tickets: [{
        id: 1,
        phaseId: -1,
        title: 'produce',
        distribution: {
          sourceMapDigest: 'a',
          sourceViewDigest: 'b',
          digest: 'c',
          units: [{
            unitId: 'op-A',
            kind: 'operation',
            role: 'implementer',
            surface: 'rest',
            placement: { nodeIds: ['N0001'], paths: ['src/a.rs'] },
            obligation: { mode: 'implement' },
            obligationDigest: 'd',
            specRefs: [{ path: 'RFC.md', line: 12, quote: 'produce' }],
          }],
        },
      }],
    }],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function withPackage(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px308-viewer-'));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('C009 the viewer prints the unit, its placement, its steps and its spec line', () => {
  const markdown = renderTicketDistribution(collectTicketDistribution(fixtureTickets()));
  assert.match(markdown, /## PX-1: produce/);
  assert.match(markdown, /op-A/);
  assert.match(markdown, /src\/a\.rs/);
  assert.match(markdown, /RFC\.md:12/);
});

test('C009 the viewer exits 1 when a unit-bearing graph meets a ticket without distribution', () => {
  withPackage((root) => {
    const ticketsPath = path.join(root, 'Tickets.json');
    fs.writeFileSync(ticketsPath, JSON.stringify({
      phases: [{ id: -1, name: 'PX', nodeIds: ['N0001'], tickets: [{ id: 1, phaseId: -1, title: 'bare', nodeIds: ['N0001'] }] }],
    }));
    fs.writeFileSync(path.join(root, 'P-GRAPH.json'), JSON.stringify({
      nodes: [{ id: 'N0001', unitIds: ['op-A'] }],
      edges: [],
    }));

    const result = spawnSync(process.execPath, [VIEWER, ticketsPath], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_UNIT_AT_LAYER/);
  });
});

test('C009 an empty package exits 0', () => {
  withPackage((root) => {
    const ticketsPath = path.join(root, 'Tickets.json');
    fs.writeFileSync(ticketsPath, JSON.stringify({
      phases: [{ id: -1, name: 'PX', nodeIds: [], tickets: [] }],
    }));
    fs.writeFileSync(path.join(root, 'P-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));

    const result = spawnSync(process.execPath, [VIEWER, ticketsPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});
