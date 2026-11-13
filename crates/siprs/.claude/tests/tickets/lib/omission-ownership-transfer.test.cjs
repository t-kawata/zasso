#!/usr/bin/env node
// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
'use strict';

// @verifies C004
// @verifies C005

/**
 * Tests for the ownership handover an omission ticket performs.
 *
 * The merge appends clones of reviewed tickets. A clone that re-implements its
 * source must take ownership of the source's graph nodes; the mutation gate
 * refuses a duplicate claim unless the manifest records the transfer and the
 * source stops claiming the moved nodes. These tests pin the behavior without
 * naming any workspace, repository or ticket family.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const PHASIFY_MODULE = path.join(CLAUDE_DIR, 'scripts/rfc-graph/phasify-omissions.js');
const MUTATION_GATE_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/ticket-mutation-gate.js');

describe('omission ownership handover', () => {
  test('mergePhasifyToTickets removes the transferred nodes from the source ticket', () => {
    const phasify = require(PHASIFY_MODULE);
    const tickets = {
      title: 't',
      phases: [
        { id: 0, name: 'P0', tickets: [
          { id: 1, phaseId: 0, status: 'reviewed', nodeIds: ['N0001', 'N0002'], default_files: ['src/a.js', 'src/b.js'] },
        ] },
      ],
    };
    const output = {
      phases: [
        { id: 1, name: 'P1', nodeIds: ['N0001'], tickets: [
          { id: 1, phaseId: 1, originalTicketKey: 'P0-1', nodeIds: ['N0001'], default_files: ['src/a.js'], foundOmissions: [] },
        ] },
      ],
      referenceTickets: [],
    };

    const merged = phasify.mergePhasifyToTickets(tickets, output).data;
    const source = merged.phases[0].tickets[0];
    const clone = merged.phases[1].tickets[0];

    assert.deepStrictEqual(source.nodeIds, ['N0002'], 'the source keeps only what it still owns');
    assert.deepStrictEqual(clone.nodeIds, ['N0001'], 'the clone keeps the transferred node');
    assert.deepStrictEqual(source.default_files, ['src/b.js'], 'the source releases the files the clone re-implements');
    assert.deepStrictEqual(clone.default_files, ['src/a.js'], 'the clone keeps its files');
  });

  test('buildOwnershipTransfers names every clone and the nodes it takes', () => {
    const phasify = require(PHASIFY_MODULE);
    const output = {
      phases: [
        { id: 1, tickets: [
          { id: 1, originalTicketKey: 'P0-1', nodeIds: ['N0001'] },
          { id: 2, originalTicketKey: 'P0-2', nodeIds: ['N0003', 'N0004'] },
        ] },
        { id: -1, tickets: [
          { id: 1, originalTicketKey: 'P0-3', nodeIds: ['N0005'] },
        ] },
      ],
    };

    const transfers = phasify.buildOwnershipTransfers(output);

    assert.deepStrictEqual(transfers, [
      { from: 'P0-1', to: 'P1-1', nodeIds: ['N0001'], filePaths: [] },
      { from: 'P0-2', to: 'P1-2', nodeIds: ['N0003', 'N0004'], filePaths: [] },
      { from: 'P0-3', to: 'PX-1', nodeIds: ['N0005'], filePaths: [] },
    ]);
  });

  test('a clone without ownership produces no transfer', () => {
    const phasify = require(PHASIFY_MODULE);
    const output = {
      phases: [
        { id: 1, tickets: [
          { id: 1, nodeIds: ['N0001'] },
          { id: 2, originalTicketKey: 'P0-2', nodeIds: [] },
          { id: 3, originalTicketKey: 'P0-3', nodeIds: ['N0004'], default_files: [] },
        ] },
      ],
    };

    assert.deepStrictEqual(phasify.buildOwnershipTransfers(output), [
      { from: 'P0-3', to: 'P1-3', nodeIds: ['N0004'], filePaths: [] },
    ]);
  });

  test('filterNodeIdsToGraph keeps only ids the graph owns and does not mutate input', () => {
    const phasify = require(PHASIFY_MODULE);
    const tickets = [
      { nodeIds: ['N0001', 'unit-boundary-999'] },
      { nodeIds: ['N0002'] },
      { nodeIds: ['unit-boundary-999'] },
      { nodeIds: undefined },
    ];
    const graphNodeIds = new Set(['N0001', 'N0002']);

    const filtered = phasify.filterNodeIdsToGraph(tickets, graphNodeIds);

    assert.deepStrictEqual(filtered[0].nodeIds, ['N0001']);
    assert.deepStrictEqual(filtered[1].nodeIds, ['N0002']);
    assert.deepStrictEqual(filtered[2].nodeIds, []);
    assert.strictEqual(filtered[3].nodeIds, undefined);
    assert.deepStrictEqual(tickets[0].nodeIds, ['N0001', 'unit-boundary-999'], 'the input is untouched');
  });

  test('the mutation gate accepts the emitted transfer with no duplicate claim', () => {
    const phasify = require(PHASIFY_MODULE);
    const { evaluateOwnership } = require(MUTATION_GATE_MODULE);
    const phasifiedOutput = {
      phases: [
        { id: 1, tickets: [{ id: 1, originalTicketKey: 'P0-1', nodeIds: ['N0001'] }] },
      ],
    };
    const before = {
      phases: [
        { id: 0, tickets: [{ id: 1, phaseId: 0, status: 'reviewed', nodeIds: ['N0001'] }] },
      ],
    };
    const after = {
      phases: [
        { id: 0, tickets: [{ id: 1, phaseId: 0, status: 'R1', nodeIds: [] }] },
        { id: 1, tickets: [{ id: 1, phaseId: 1, status: 'todo', origin: { kind: 'omission', sourceTicket: 'P0-1' }, nodeIds: ['N0001'] }] },
      ],
    };
    const manifest = {
      added: ['P1-1'],
      updated: ['P0-1'],
      ownershipTransfers: phasify.buildOwnershipTransfers(phasifiedOutput),
    };

    const verdict = evaluateOwnership({ before, after, manifest, graph: { nodes: [{ id: 'N0001' }] } });

    assert.deepStrictEqual(verdict.findings, []);
  });
});
