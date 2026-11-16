// @verifies C003
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
'use strict';

/**
 * The unit a moved graph node carries moves with the node.
 *
 * A clone that takes ownership of a source ticket's nodes must also take the
 * distribution unit record those nodes carry. Otherwise the source keeps a unit
 * its phase graph no longer carries and the clone owns a node whose unit it does
 * not declare. The digests cover the unit set and the phase covers the node set,
 * so both must be refreshed after the handover.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CLAUDE_DIR = path.resolve(__dirname, '../../..');
const PHASIFY_MODULE = path.join(CLAUDE_DIR, 'scripts/rfc-graph/phasify-omissions.js');

describe('omission distribution-unit handover', () => {
  test('mergePhasifyToTickets moves the unit with the transferred node', () => {
    const { mergePhasifyToTickets } = require(PHASIFY_MODULE);
    const unit = {
      unitId: 'ctr-boundary-001',
      kind: 'contract',
      placement: { nodeIds: ['N0001'], paths: ['src/api'] },
      obligation: { mode: 'obligation' },
    };
    const tickets = {
      title: 't',
      phases: [
        {
          id: 0,
          name: 'P0',
          nodeIds: ['N0001'],
          tickets: [
            {
              id: 1,
              phaseId: 0,
              status: 'reviewed',
              nodeIds: ['N0001'],
              default_files: ['src/api/a.rs'],
              distribution: { sourceMapDigest: 'm', sourceViewDigest: 'v', units: [unit] },
            },
          ],
        },
      ],
    };
    const output = {
      phases: [
        {
          id: 1,
          name: 'P1',
          nodeIds: ['N0001'],
          tickets: [
            {
              id: 1,
              phaseId: 1,
              status: 'todo',
              originalTicketKey: 'P0-1',
              nodeIds: ['N0001'],
              default_files: ['src/api/a.rs'],
              foundOmissions: [],
            },
          ],
        },
      ],
    };

    const merged = mergePhasifyToTickets(tickets, output);
    const document = merged.data ?? merged;
    const source = document.phases.find((phase) => phase.id === 0);
    const target = document.phases.find((phase) => phase.id === 1);

    assert.strictEqual((source.tickets[0].distribution?.units ?? []).length, 0);
    assert.strictEqual((target.tickets[0].distribution?.units ?? []).length, 1);
    assert.strictEqual(target.tickets[0].distribution.units[0].unitId, 'ctr-boundary-001');
    assert.strictEqual(target.tickets[0].distribution.sourceMapDigest, 'm');
    assert.match(target.tickets[0].distribution.units[0].obligationDigest, /^[0-9a-f]{64}$/);
    assert.deepStrictEqual(source.nodeIds, []);
    assert.deepStrictEqual(target.nodeIds, ['N0001']);
    assert.match(document.distribution.digest, /^[0-9a-f]{64}$/);
  });
});
