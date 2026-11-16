// @verifies C002
'use strict';

/**
 * Step-contract ids never collide with graph edge-contract ids.
 *
 * The step projection reserves the C5xx range, but an authored graph edge may use
 * an id in the same range. A position-only step id therefore duplicates an edge
 * contract id inside one ticket, and the boundary verifier rejects the ticket set.
 * The projection takes a free id instead while every other row keeps its stable
 * positional id.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const MERGE_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/merge-contracts-to-tickets.js');
const STEP_MODULE = path.join(CLAUDE_DIR, 'scripts/rfc-graph/lib/step-contracts.mjs');

/** Build `count` step rows in sidecar order. */
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function stepRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    stepId: `S${index}`,
    sequenceId: 'SEQ1',
    operationId: `op.step${index}`,
    contract: { pre: [{ text: `pre ${index}` }], post: [{ text: `post ${index}` }] },
    digest: `digest-${index}`,
  }));
}

/** A ticket that owns every sidecar step, so the reverse chain check can pass. */
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function ticketOwningEveryStep(rows) {
  return {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001', 'N0002'],
    distribution: {
      units: [{
        obligation: { steps: rows.map((row) => ({ stepId: row.stepId })) },
      }],
    },
    contracts: [],
  };
}

describe('assignStepContractIds', () => {
  test('keeps positional ids when the graph claims nothing', async () => {
    const { assignStepContractIds } = await import(STEP_MODULE);
    const ids = assignStepContractIds([{ stepId: 'A' }, { stepId: 'B' }], new Set());
    assert.deepStrictEqual(ids, ['C500', 'C501']);
  });

  test('moves a colliding row to the highest free reserved id', async () => {
    const { assignStepContractIds } = await import(STEP_MODULE);
    const rows = [{ stepId: 'A' }, { stepId: 'B' }];
    const ids = assignStepContractIds(rows, new Set(['C501']));
    assert.deepStrictEqual(ids, ['C500', 'C999']);
  });

  test('never returns a reserved id or repeats one', async () => {
    const { assignStepContractIds } = await import(STEP_MODULE);
    const rows = stepRows(402);
    const reserved = new Set(['C901']);
    const ids = assignStepContractIds(rows, reserved);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.strictEqual(ids.some((id) => reserved.has(id)), false);
    assert.strictEqual(ids[401], 'C999');
  });

  test('refuses a collision count larger than the free range', async () => {
    const { assignStepContractIds } = await import(STEP_MODULE);
    const rows = stepRows(2);
    const everyId = new Set(Array.from({ length: 500 }, (_, index) => `C${500 + index}`));
    assert.throws(() => assignStepContractIds(rows, everyId), /STEP_CONTRACT_ID_EXHAUSTED/);
  });
});

describe('mergeContracts step id collision', () => {
  test('a step contract keeps its own id beside a graph contract of the same position', () => {
    const { mergeContracts } = require(MERGE_MODULE);
    const rows = stepRows(402);
    const ticket = ticketOwningEveryStep(rows);
    ticket.contracts = [{
      id: 'C901',
      sourceEdge: 'step:S401',
      stepId: 'S401',
      precondition: 'stale',
    }];
    const graph = {
      nodes: [{ id: 'N0001' }, { id: 'N0002' }],
      edges: [{
        from: 'N0001',
        to: 'N0002',
        contracts: [{
          id: 'C901',
          precondition: 'edge pre',
          postcondition: 'edge post',
          invariant: 'edge inv',
        }],
      }],
    };
    mergeContracts([ticket], graph, [], { steps: rows });

    const ids = ticket.contracts.map((contract) => contract.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    const stepIds = ticket.contracts.filter((contract) => contract.stepId).map((contract) => contract.stepId);
    assert.strictEqual(new Set(stepIds).size, stepIds.length);
    const edgeContract = ticket.contracts.find((contract) => contract.id === 'C901');
    assert.strictEqual(edgeContract.sourceEdge, 'N0001→N0002 (internal)');
    const stepContract = ticket.contracts.find((contract) => contract.stepId === 'S401');
    assert.strictEqual(stepContract.id, 'C999');
    assert.strictEqual(stepContract.precondition, 'pre 401');
  });

  test('a carried step contract whose step is no longer in the sidecar is dropped', () => {
    const { mergeContracts } = require(MERGE_MODULE);
    const rows = stepRows(2);
    const ticket = ticketOwningEveryStep(rows);
    ticket.contracts = [{
      id: 'C700',
      sourceEdge: 'step:S999',
      stepId: 'S999',
      precondition: 'orphaned',
    }];
    mergeContracts([ticket], { nodes: [], edges: [] }, [], { steps: rows });
    assert.strictEqual(ticket.contracts.some((contract) => contract.stepId === 'S999'), false);
  });

  test('the boundary verifier accepts the ticket with no duplicate id', () => {
    const { mergeContracts, verifyMergedBoundaryContracts } = require(MERGE_MODULE);
    const rows = stepRows(402);
    const ticket = ticketOwningEveryStep(rows);
    const graph = {
      nodes: [{ id: 'N0001' }, { id: 'N0002' }],
      edges: [{
        from: 'N0001',
        to: 'N0002',
        contracts: [{
          id: 'C901',
          precondition: 'edge pre',
          postcondition: 'edge post',
          invariant: 'edge inv',
        }],
      }],
    };
    mergeContracts([ticket], graph, [], { steps: rows });
    const findings = verifyMergedBoundaryContracts([ticket], graph, [], { steps: rows });
    assert.deepStrictEqual(findings, []);
  });
});
