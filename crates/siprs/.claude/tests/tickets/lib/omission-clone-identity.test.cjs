// @verifies C004
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
'use strict';

/**
 * An omission clone does not inherit the source's condensation ledger.
 *
 * The source ticket stays live and keeps claiming the keys it absorbed. A clone
 * that copied condensedFrom would leave one absorbed key claimed by two tickets,
 * which the identity gate refuses as a duplicate. The clone's obligation is its
 * foundOmissions list, not the source's distribution or formula projection.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const OMISSION_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/add-omission-ticket.js');

describe('omission clone identity', () => {
  test('the clone keeps node ownership but clears source-only ledgers', () => {
    const { buildOmissionClone } = require(OMISSION_MODULE);
    const source = {
      id: 1,
      phaseId: 0,
      status: 'reviewed',
      title: 'source',
      nodeIds: ['N0001'],
      default_files: ['src/a.rs'],
      contracts: [{ id: 'C001' }],
      condensedFrom: { tickets: [{ key: 'PX-1', id: 1 }] },
      distribution: { sourceMapDigest: 'm', units: [] },
      formulaObligations: [{ formulaId: 'F1' }],
    };

    const clone = buildOmissionClone(source, 'P0-1', [{ code: 'A1' }]);
    const serialized = JSON.parse(JSON.stringify(clone));

    assert.deepStrictEqual(serialized.nodeIds, ['N0001']);
    assert.deepStrictEqual(serialized.default_files, ['src/a.rs']);
    assert.strictEqual(Object.hasOwn(serialized, 'condensedFrom'), false);
    assert.strictEqual(Object.hasOwn(serialized, 'distribution'), false);
    assert.strictEqual(Object.hasOwn(serialized, 'formulaObligations'), false);
    assert.strictEqual(serialized.phaseId, -1);
    assert.strictEqual(serialized.status, 'todo');
    assert.strictEqual(serialized.originalTicketKey, 'P0-1');
    assert.deepStrictEqual(serialized.foundOmissions, [{ code: 'A1' }]);
  });
});
