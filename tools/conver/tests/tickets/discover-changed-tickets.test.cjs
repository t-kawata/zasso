'use strict';
// PX-399 @verifies C002 @verifies C003

/**
 * PX-399 — changed files become ticket keys without an argument.
 *
 * Annotation lines name the ticket that changed a file; a targetStub names the
 * ticket that owns a file. Resolve needs both paths when it has no $ARGUMENTS.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseAnnotationTicketKeys,
  discoverChangedTickets,
} = require('../../.claude/scripts/tickets/discover-changed-tickets.js');
const {
  cleanTicket,
  documentWith,
  writeSourceFile,
} = require('./fixtures/reverify-fixtures.cjs');

const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const DISCOVER = path.join(CLAUDE_DIR, 'scripts/tickets/discover-changed-tickets.js');

/** A fresh directory with a Tickets.json placeholder path. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function freshDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'discover-'));
}

test('C002: a multi-ticket annotation maps to every listed ticket key', () => {
  assert.deepEqual(
    parseAnnotationTicketKeys('// [::TICKET::] PX-61, PX-63 changes. Details: node ...'),
    ['PX-61', 'PX-63'],
  );
  assert.deepEqual(parseAnnotationTicketKeys('const value = 1;'), []);
  assert.deepEqual(
    parseAnnotationTicketKeys('// [::TICKET::] P0-1 changes. Details: node ...'),
    ['P0-1'],
  );
});

test('C002: an annotated changed file maps to its ticket key', () => {
  const directory = freshDirectory();
  writeSourceFile(directory, 'a.js', '// [::TICKET::] PX-1 changes. Details: node ...\nconst a = 1;\n');

  const result = discoverChangedTickets({
    cwd: directory,
    ticketsPath: path.join(directory, 'Tickets.json'),
    ticketsDocument: documentWith(cleanTicket()),
    files: ['a.js'],
  });

  assert.deepEqual(result.ticketKeys, ['PX-1']);
  assert.deepEqual(result.byTicket['PX-1'].annotations, ['a.js']);
});

test('C002: a targetStub file maps to its owning ticket', () => {
  const directory = freshDirectory();
  writeSourceFile(directory, 'src/a.js', 'const a = 1;\n');
  const ticket = cleanTicket({
    targetStubs: [{
      id: 'S1',
      file: 'src/a.js',
      contracts: ['C001'],
      status: 'pending',
      deferredTo: null,
    }],
  });

  const result = discoverChangedTickets({
    cwd: directory,
    ticketsPath: path.join(directory, 'Tickets.json'),
    ticketsDocument: documentWith(ticket),
    files: ['src/a.js'],
  });

  assert.deepEqual(result.ticketKeys, ['PX-1']);
  assert.deepEqual(result.byTicket['PX-1'].targets, ['src/a.js']);
});

test('C003: resolve with no argument still discovers changed tickets from files', () => {
  const directory = freshDirectory();
  writeSourceFile(directory, 'a.js', '// [::TICKET::] P0-1 changes. Details: node ...\n');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify(documentWith(cleanTicket({ id: 1, phaseId: 0 })), null, 2) + '\n');

  const stdout = execFileSync(process.execPath, [
    DISCOVER,
    '--tickets=' + ticketsPath,
    '--files=a.js',
  ], { encoding: 'utf8', cwd: directory });

  const report = JSON.parse(stdout);
  assert.ok(report.ticketKeys.includes('P0-1'));
  assert.deepEqual(report.files, ['a.js']);
});
