'use strict';
// PX-397 @verifies C003

/**
 * PX-397 — the five deterministic repair tools and their shared atomic writer.
 *
 * Every tool either writes the whole change or leaves the target byte-identical.
 * Append and insert are idempotent so the repair loop can rerun them safely.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTemporaryThenRename } = require('../../.claude/scripts/tickets/lib/atomic-write.js');
const { patchTicket } = require('../../.claude/scripts/tickets/patch-ticket.js');
const { insertVerifies } = require('../../.claude/scripts/tickets/insert-verifies.js');
const { scaffoldTest } = require('../../.claude/scripts/tickets/scaffold-test.js');
const { rewriteDeferralTicket } = require('../../.claude/scripts/tickets/rewrite-deferral-ticket.js');
const { recordReview } = require('../../.claude/scripts/tickets/record-review.js');

/** A minimal valid Tickets.json document with two tickets. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function fixtureDocument() {
  return {
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [
        {
          id: 1,
          phaseId: 0,
          status: 'planned',
          title: 'Fixture one',
          background: 'original background',
          scope: ['existing'],
          invariants: 'original invariants',
          testUnit: ['UT: original'],
          contracts: [{
            id: 'C001',
            sourceEdge: 'N0001->N0002',
            precondition: 'p',
            postcondition: 'q',
            invariant: 'r',
          }],
        },
        {
          id: 2,
          phaseId: 0,
          status: 'todo',
          title: 'Cloned source title',
          background: 'cloned source background',
          scope: ['cloned scope'],
          invariants: 'clone invariants',
          contracts: [{
            id: 'C001',
            sourceEdge: 'N0003->N0004',
            precondition: 'p',
            postcondition: 'q',
            invariant: 'r',
          }],
        },
      ],
    }],
  };
}

/** Write a fixture package and return its Tickets.json path. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function writeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-tools-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify(fixtureDocument(), null, 2) + '\n');
  return { directory, ticketsPath };
}

/** Read one ticket from a Tickets.json path. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function readTicket(ticketsPath, ticketId) {
  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  return document.phases[0].tickets.find((ticket) => ticket.id === ticketId);
}

/** A fresh file with an existing test in it. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function writeTestFile(directory) {
  const testFile = path.join(directory, 'sample.test.cjs');
  fs.writeFileSync(testFile, "'use strict';\n\ntest('existing', () => {});\n");
  return testFile;
}

test('C003: atomic write replaces the target and leaves no temporary file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
  const target = path.join(directory, 'target.txt');

  writeTemporaryThenRename(target, 'first\n');
  writeTemporaryThenRename(target, 'second\n');

  assert.equal(fs.readFileSync(target, 'utf8'), 'second\n');
  assert.deepEqual(fs.readdirSync(directory), ['target.txt']);
});

test('C003: patch-ticket rejects a wrong field type and leaves the file byte-identical', () => {
  const { ticketsPath } = writeFixture();
  const before = fs.readFileSync(ticketsPath, 'utf8');

  assert.throws(
    () => patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'scope', value: 'not-an-array' }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);

  assert.throws(
    () => patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'bad field', value: 'x' }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);
});

test('C003: patch-ticket appends idempotently and overwrites a scalar', () => {
  const { ticketsPath } = writeFixture();

  patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'scope', value: ['alpha'], mode: 'append' });
  patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'scope', value: ['alpha'], mode: 'append' });
  patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'title', value: 'Renamed fixture' });

  const ticket = readTicket(ticketsPath, 1);
  assert.deepEqual(ticket.scope, ['existing', 'alpha']);
  assert.equal(ticket.title, 'Renamed fixture');
});

test('C003: patch-ticket appends to a field that is not present yet', () => {
  const { ticketsPath } = writeFixture();

  patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'rfcDiscrepancies', value: ['new discrepancy'], mode: 'append' });
  patchTicket({ ticketsPath, ticketKey: 'P0-1', field: 'instrumentation', value: 'new evidence', mode: 'append' });

  const ticket = readTicket(ticketsPath, 1);
  assert.deepEqual(ticket.rfcDiscrepancies, ['new discrepancy']);
  assert.equal(ticket.instrumentation, 'new evidence');
});

test('C003: patch-ticket refuses a missing target without writing', () => {
  const { ticketsPath } = writeFixture();
  const before = fs.readFileSync(ticketsPath, 'utf8');

  assert.throws(
    () => patchTicket({ ticketsPath, ticketKey: 'P0-9', field: 'title', value: 'x' }),
    (error) => error.code === 'REPAIR_TARGET_MISSING',
  );
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);
});

test('C003: insert-verifies inserts @verifies and provenance once', () => {
  const { directory } = writeFixture();
  const testFile = writeTestFile(directory);

  const inserted = insertVerifies({ file: testFile, line: 1, ticketKey: 'PX-397', contractId: 'C001' });
  assert.equal(inserted.inserted, true);

  const lines = fs.readFileSync(testFile, 'utf8').split('\n');
  assert.equal(lines[0], '// @verifies C001');
  assert.match(lines[1], /\[::TICKET::\] PX-397/);
  assert.equal(lines[2], "'use strict';");

  const after = fs.readFileSync(testFile, 'utf8');
  const duplicate = insertVerifies({ file: testFile, line: 1, ticketKey: 'PX-397', contractId: 'C001' });
  assert.equal(duplicate.inserted, false);
  assert.equal(duplicate.reason, 'DUPLICATE');
  assert.equal(fs.readFileSync(testFile, 'utf8'), after);
});

test('C003: insert-verifies refuses a missing file', () => {
  assert.throws(
    () => insertVerifies({ file: '/tmp/does-not-exist-px397.cjs', line: 1, ticketKey: 'PX-397', contractId: 'C001' }),
    (error) => error.code === 'REPAIR_TARGET_MISSING',
  );
});

test('C003: scaffold-test refuses an empty or assertion-free body', () => {
  const { directory } = writeFixture();
  const testFile = path.join(directory, 'scaffold.test.cjs');

  assert.throws(
    () => scaffoldTest({ file: testFile, ticketKey: 'PX-397', contractId: 'C001', testName: 'fails', body: '   ' }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.throws(
    () => scaffoldTest({ file: testFile, ticketKey: 'PX-397', contractId: 'C001', testName: 'fails', body: 'const value = 1;' }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.equal(fs.existsSync(testFile), false);
});

test('C003: scaffold-test generates a failing test with @verifies and a STUB marker', () => {
  const { directory } = writeFixture();
  const testFile = path.join(directory, 'scaffold.test.cjs');

  scaffoldTest({
    file: testFile,
    ticketKey: 'PX-397',
    contractId: 'C001',
    testName: 'fails',
    body: 'assert.equal(1 + 1, 2);',
  });

  const generated = fs.readFileSync(testFile, 'utf8');
  assert.match(generated, /require\('node:test'\)/);
  assert.match(generated, /require\('node:assert\/strict'\)/);
  assert.match(generated, /@verifies C001/);
  assert.match(generated, /\[::STUB::\] PX-397: scaffolded failing test for C001/);
  assert.match(generated, /assert\.fail\(/);

  const after = fs.readFileSync(testFile, 'utf8');
  const duplicate = scaffoldTest({
    file: testFile,
    ticketKey: 'PX-397',
    contractId: 'C001',
    testName: 'fails again',
    body: 'assert.equal(2 + 2, 4);',
  });
  assert.equal(duplicate.inserted, false);
  assert.equal(duplicate.reason, 'DUPLICATE');
  assert.equal(fs.readFileSync(testFile, 'utf8'), after);
});

test('C003: rewrite-deferral-ticket replaces three fields and keeps the rest', () => {
  const { ticketsPath } = writeFixture();
  const before = readTicket(ticketsPath, 2);

  rewriteDeferralTicket({
    ticketsPath,
    ticketKey: 'P0-2',
    seed: { title: 'Rewrite the clone', background: 'A real background', scope: ['Do the work'] },
  });

  const after = readTicket(ticketsPath, 2);
  assert.equal(after.title, 'Rewrite the clone');
  assert.equal(after.background, 'A real background');
  assert.deepEqual(after.scope, ['Do the work']);
  assert.equal(after.invariants, before.invariants);
  assert.deepEqual(after.contracts, before.contracts);
});

test('C003: rewrite-deferral-ticket rejects a bad seed without writing', () => {
  const { ticketsPath } = writeFixture();
  const before = fs.readFileSync(ticketsPath, 'utf8');

  assert.throws(
    () => rewriteDeferralTicket({ ticketsPath, ticketKey: 'P0-2', seed: { title: 'ok', background: 'ok', scope: 'not-an-array' } }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);
});

test('C003: record-review appends the three fields and rejects a wrong shape', () => {
  const { ticketsPath } = writeFixture();

  recordReview({
    ticketsPath,
    ticketKey: 'P0-1',
    instrumentation: 'All 12 tests pass.',
    rfcDiscrepancies: ['RFC section 2 names the wrong file.'],
    notes: 'Reviewed after repair.',
  });

  const reviewed = readTicket(ticketsPath, 1);
  assert.match(reviewed.instrumentation, /All 12 tests pass/);
  assert.deepEqual(reviewed.rfcDiscrepancies, ['RFC section 2 names the wrong file.']);
  assert.match(reviewed.notes, /Reviewed after repair/);

  const before = fs.readFileSync(ticketsPath, 'utf8');
  assert.throws(
    () => recordReview({
      ticketsPath,
      ticketKey: 'P0-1',
      instrumentation: 'x',
      rfcDiscrepancies: 'not-an-array',
      notes: 'y',
    }),
    (error) => error.code === 'REPAIR_TOOL_INVALID_INPUT',
  );
  assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before);
});

test('C003: record-review append is idempotent', () => {
  const { ticketsPath } = writeFixture();
  const review = {
    ticketsPath,
    ticketKey: 'P0-1',
    instrumentation: 'All 12 tests pass.',
    rfcDiscrepancies: ['One discrepancy.'],
    notes: 'Reviewed after repair.',
  };

  recordReview(review);
  recordReview(review);

  const reviewed = readTicket(ticketsPath, 1);
  assert.equal(reviewed.instrumentation.split('All 12 tests pass.').length - 1, 1);
  assert.deepEqual(reviewed.rfcDiscrepancies, ['One discrepancy.']);
  assert.equal(reviewed.notes.split('Reviewed after repair.').length - 1, 1);
});
