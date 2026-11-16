// @verifies C001 C010
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
'use strict';

/**
 * A ticket with no derived contract carries no contracts field.
 *
 * The tickets validator rejects an empty contracts array but accepts an absent
 * field. A rehydration runs over historical tickets whose node ownership was
 * handed to a resolving ticket, so it must remove the field rather than write [].
 * The same pass must keep a contract the graph does not derive, because that
 * contract was authored on the ticket and has no other source.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const MERGE_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/merge-contracts-to-tickets.js');

describe('mergeContracts contract ownership', () => {
  test('deletes the field instead of writing an empty array', () => {
    const { mergeContracts } = require(MERGE_MODULE);
    const ticket = { id: 1, phaseId: 0, nodeIds: [], contracts: [] };
    mergeContracts([ticket], { nodes: [], edges: [] }, [], null);
    assert.strictEqual(Object.hasOwn(ticket, 'contracts'), false);
  });

  test('keeps an authored contract the graph does not derive', () => {
    const { mergeContracts } = require(MERGE_MODULE);
    const ticket = {
      id: 1,
      phaseId: 0,
      nodeIds: ['N0001'],
      contracts: [
        { id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'old' },
        { id: 'contract-authored-1', sourceEdge: 'N0058→N0001 (inbound)', precondition: 'kept' },
      ],
    };
    const graph = {
      nodes: [{ id: 'N0001' }, { id: 'N0002' }],
      edges: [{ from: 'N0001', to: 'N0002', contracts: [{ id: 'C001', precondition: 'new' }] }],
    };
    mergeContracts([ticket], graph, [], null);
    const byId = new Map(ticket.contracts.map((contract) => [contract.id, contract]));
    assert.strictEqual(byId.size, 2);
    assert.strictEqual(byId.get('C001').precondition, 'new');
    assert.strictEqual(byId.get('contract-authored-1').precondition, 'kept');
  });

  test('keeps the carried projection of a registry contract', () => {
    const { mergeContracts } = require(MERGE_MODULE);
    const ticket = {
      id: 1,
      phaseId: 0,
      nodeIds: ['ctr-boundary-007'],
      contracts: [
        { id: 'contract-boundary-007', sourceEdge: 'boundary:boundary-007', precondition: 'kept' },
      ],
    };
    const registry = [
      {
        boundary_id: 'boundary-007',
        clauses: { preconditions: ['derived'], postconditions: [], invariants: [] },
      },
    ];
    mergeContracts([ticket], { nodes: [], edges: [] }, registry, null);
    const byId = new Map(ticket.contracts.map((contract) => [contract.id, contract]));
    assert.strictEqual(byId.size, 1);
    assert.strictEqual(byId.get('contract-boundary-007').precondition, 'kept');
  });
});

describe('atomic ticket serialization', () => {
  test('writes exactly one trailing newline', () => {
    const { atomicWrite } = require(MERGE_MODULE);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-contracts-atomic-'));
    const target = path.join(directory, 'Tickets.json');
    try {
      atomicWrite(target, '{"phases":[]}');
      assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"phases":[]}\n');
      atomicWrite(target, '{"phases":[]}\n\n');
      assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"phases":[]}\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
