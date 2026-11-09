// PX-393 @verifies C001
// PX-393 @verifies C002
// PX-393 @verifies C003
// PX-393 @verifies C006
// The ticket ledger is read once by the model and rendered without touching the filesystem
// from the renderer. These tests pin the flat ledger shape before the renderer exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadTicketsDocument,
  readTicketLedger,
  ticketTokenOf,
} from '../../../.claude/scripts/workspacify-order/lib/tickets.mjs';

// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
test('C002 base statuses render the list-phases-and-tickets inner character, with todo as a dot', () => {
  const document = {
    phases: [{
      id: 0,
      tickets: [
        { id: 1, status: 'todo' },
        { id: 2, status: 'made' },
        { id: 3, status: 'planned' },
        { id: 4, status: 'done' },
        { id: 5, status: 'reviewed' },
        { id: 6, status: 'remanded' },
      ],
    }],
  };

  assert.deepEqual(readTicketLedger(document).tokens, ['.', '_', '|', '/', 'x', '!']);
});

test('C002 a round-aware status keeps its round and forNextRound wins over the status', () => {
  const document = {
    phases: [{
      id: 0,
      tickets: [
        { id: 7, status: 'R2' },
        { id: 8, status: 'todo', forNextRound: true },
      ],
    }],
  };

  assert.deepEqual(readTicketLedger(document).tokens, ['R2', '→']);
  assert.equal(ticketTokenOf({ status: 'unknown' }), '.');
});

test('C001 the token order is the Tickets.json phase and ticket order, not a PX-first reorder', () => {
  const document = {
    phases: [
      { id: 0, tickets: [{ id: 1, status: 'made' }] },
      { id: -1, tickets: [{ id: 2, status: 'reviewed' }] },
    ],
  };

  assert.deepEqual(readTicketLedger(document).tokens, ['_', 'x']);
});

test('C003 reviewed count is the numerator and the flattened ticket count is the denominator', () => {
  const document = {
    phases: [{
      id: 0,
      tickets: Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        status: index < 3 ? 'reviewed' : 'made',
      })),
    }],
  };

  const ledger = readTicketLedger(document);

  assert.equal(ledger.reviewed, 3);
  assert.equal(ledger.total, 12);
  assert.equal(ledger.tokens.length, ledger.total);
  assert.ok(ledger.reviewed <= ledger.total);
});

test('C003 R<n> counts as reviewed, done and forNextRound do not', () => {
  const document = {
    phases: [{
      id: 0,
      tickets: [
        { id: 1, status: 'R1' },
        { id: 2, status: 'done' },
        { id: 3, status: 'todo', forNextRound: true },
      ],
    }],
  };

  const ledger = readTicketLedger(document);

  assert.equal(ledger.reviewed, 1);
  assert.equal(ledger.total, 3);
});

test('C001 a document with no phases or no tickets is an empty ledger, not an absent one', () => {
  assert.deepEqual(readTicketLedger({}), { tokens: [], reviewed: 0, total: 0 });
  assert.deepEqual(readTicketLedger({ phases: [] }), { tokens: [], reviewed: 0, total: 0 });
  assert.equal(readTicketLedger(null), null);
});

test('C006 the loader returns the parsed document, and null for an absent or malformed file', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ticket-ledger-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'readable'), { recursive: true });
  mkdirSync(join(root, 'malformed'), { recursive: true });
  writeFileSync(join(root, 'readable', 'Tickets.json'), JSON.stringify({ phases: [] }));
  writeFileSync(join(root, 'malformed', 'Tickets.json'), '{not json');

  assert.deepEqual(loadTicketsDocument({ root, packagePath: 'readable' }), { phases: [] });
  assert.equal(loadTicketsDocument({ root, packagePath: 'missing' }), null);
  assert.equal(loadTicketsDocument({ root, packagePath: 'malformed' }), null);
});
