// @verifies C006
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
'use strict';

/**
 * Excluded phases keep their live keys resolvable.
 *
 * A phase can be excluded from condensation. Its tickets still exist and other
 * tickets legitimately name them in contract text. Renumbering must map such a
 * key to itself instead of reporting it as unresolved history: the reference is
 * to a live ticket, not to an absorbed one.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const IDENTITY_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/lib/ticket-identity-renumber.js');

describe('excluded-phase live keys', () => {
  test('a reference to an excluded-phase ticket resolves to itself', () => {
    const { renumberDocument } = require(IDENTITY_MODULE);
    const document = {
      title: 't',
      identity: { generation: 0, excludedPhases: [-1] },
      phases: [
        {
          id: 0,
          name: 'P0',
          tickets: [
            {
              id: 1,
              phaseId: 0,
              status: 'todo',
              title: 'carrier',
              contracts: [{ id: 'C1', precondition: 'The reader reaches the PX-1 amendment first.' }],
            },
          ],
        },
        {
          id: -1,
          name: 'PX',
          tickets: [{ id: 1, phaseId: -1, status: 'reviewed', title: 'Amendment' }],
        },
      ],
    };

    const result = renumberDocument(document, { excludedPhases: [-1] });

    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(result.keyMap.get('PX-1'), 'PX-1');
    const precondition = result.document.phases
      .find((phase) => phase.id === 0)
      .tickets[0].contracts[0].precondition;
    assert.strictEqual(precondition, 'The reader reaches the PX-1 amendment first.');
  });

  test('an excluded-phase ticket keeps its id', () => {
    const { renumberDocument } = require(IDENTITY_MODULE);
    const document = {
      title: 't',
      identity: { generation: 0, excludedPhases: [-1] },
      phases: [
        {
          id: -1,
          name: 'PX',
          tickets: [
            { id: 1, phaseId: -1, status: 'reviewed', title: 'first' },
            { id: 2, phaseId: -1, status: 'reviewed', title: 'second' },
          ],
        },
      ],
    };

    const result = renumberDocument(document, { excludedPhases: [-1] });

    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(result.document.phases[0].tickets[1].id, 2);
  });
});
