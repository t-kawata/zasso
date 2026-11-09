'use strict';
// PX-396 @verifies C002 @verifies C004

/**
 * PX-396 — a condensed ticket must present its provenance and absorbed records
 * in a fixed order, while a ticket without a ledger renders exactly as before.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildTicketMarkdown,
  renderCondensationBanner,
  renderCondensedFrom,
} = require('../../.claude/scripts/tickets/show-ticket-context.js');

/** A ticket with two absorbed records. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function condensedTicket() {
  return {
    id: 1,
    phaseId: 0,
    status: 'todo',
    title: 'Survivor',
    background: 'survivor background',
    scope: ['survivor scope'],
    invariants: 'survivor invariants',
    notes: 'survivor notes',
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'p1', postcondition: 'q1', invariant: 'r1' }],
    condensedFrom: {
      originKey: 'P0-1',
      planDigest: 'digest',
      condensedAt: '2026-11-09',
      tickets: [
        {
          key: 'P0-2',
          id: 2,
          status: 'todo',
          title: 'Absorbed two',
          originKey: 'P0-1',
          record: {
            background: 'absorbed two background',
            scope: ['absorbed two scope'],
            invariants: 'absorbed two invariants',
            notes: 'absorbed two notes\n\n## Implementation\nnested body',
            investigation: 'absorbed two investigation',
            boyScoutPlan: 'absorbed two boy scout',
            instrumentation: 'absorbed two instrumentation',
            default_files: ['src/absorbed.js'],
            customFutureField: { atoms: ['x'] },
            referenceSection: 'RFC (§2)',
            testUnit: ['UT: absorbed two'],
            testIntegration: ['IT: absorbed two'],
            testExceptions: [],
            acceptanceCriteria: ['AC absorbed two'],
            contracts: [{ id: 'C002', sourceEdge: 'N0002->N0003', precondition: 'p2', postcondition: 'q2', invariant: 'r2' }],
            changes: [{ before: 'a', after: 'b', description: 'absorbed two change' }],
          },
        },
        {
          key: 'P0-3',
          id: 3,
          status: 'todo',
          title: 'Absorbed three',
          originKey: 'P0-1',
          record: { background: 'absorbed three background', scope: ['absorbed three scope'] },
        },
      ],
    },
  };
}

/** A document that contains the ticket. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function documentFor(ticket) {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: ticket.phaseId, name: 'P0', summary: '', nodeIds: ticket.nodeIds ?? [], tickets: [ticket] }],
  };
}

/** A temporary directory used as the package directory. */
// [::TICKET::] PX-396 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-396 --for-spec --no-implementation-order`.
function freshDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('C002: the banner follows the title and Condensed From precedes Pipeline Context', () => {
  const ticket = condensedTicket();
  const directory = freshDirectory('condense-presentation');
  const text = buildTicketMarkdown('P0-1', ticket, documentFor(ticket), directory, false, true);

  const title = text.indexOf('# Target ticket is P0-1');
  const banner = text.indexOf('Condensed from:');
  const from = text.indexOf('## Condensed From');
  const pipeline = text.indexOf('## Pipeline Context');

  assert.ok(title >= 0);
  assert.ok(banner > title);
  assert.ok(from > banner);
  assert.ok(pipeline > from);
});

test('C002: absorbed records keep the standard internal order and provenance', () => {
  const ticket = condensedTicket();
  const text = renderCondensedFrom(ticket);

  assert.ok(text.startsWith('## Condensed From'));
  assert.match(text, /##### Implementation\nnested body/);
  assert.doesNotMatch(text, /\n## Implementation\n/);
  assert.match(text, /#### Instrumentation\n\nabsorbed two instrumentation/);
  assert.match(text, /#### Custom Future Field/);
  assert.match(text, /"atoms"/);
  assert.match(text, /#### Default Files\n\n- src\/absorbed\.js/);
  const headings = [
    '### P0-2: Absorbed two [todo]',
    '#### Background',
    '#### Scope',
    '#### Invariants',
    '#### Notes',
    '#### Investigation',
    '#### Boy Scout Rule',
    '#### RFC Reference',
    '#### Test Plan',
    '#### Contracts',
    '#### Acceptance Criteria',
    '#### Changes',
    '### P0-3: Absorbed three [todo]',
  ];
  let previous = -1;
  for (const heading of headings) {
    const index = text.indexOf(heading);
    assert.ok(index > previous, `${heading} must follow the previous heading`);
    previous = index;
  }
});

test('C002: a clone renders the inherited-ledger label', () => {
  const ticket = condensedTicket();
  ticket.condensedFrom.originKey = 'P0-8';
  const text = buildTicketMarkdown('P1-5', ticket, documentFor(ticket), freshDirectory('condense-clone'), false, true);

  assert.match(text, /Inherited condensation ledger from P0-8/);
  assert.doesNotMatch(text, /^Condensed from:/m);
});

test('C004: a ticket without condensedFrom renders exactly as the baseline', () => {
  const plain = { id: 1, phaseId: -1, status: 'todo', title: 'Case B' };
  const document = { title: 'fixture', metadata: {}, phases: [{ id: -1, tickets: [plain] }] };
  const expected = '# Target ticket is PX-1: Case B\n\n**Ticket Key**: PX-1 · **Phase**: -1\n\n---\n\n## Test Plan\n';

  assert.equal(renderCondensationBanner(plain, 'PX-1'), null);
  assert.equal(renderCondensedFrom(plain), null);
  assert.equal(buildTicketMarkdown('PX-1', plain, document, '/tmp', true, true), expected);
});
