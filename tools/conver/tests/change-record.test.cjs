// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
// @verifies C002
/**
 * change-record — a ticket that reached `done` or `reviewed` carries the record of
 * what it changed, and the set of tickets that do not is a written finding rather
 * than a silence.
 *
 * The rule keys on the status and not on the field. Measured 2026-09-15: of the
 * 295 tickets at status `reviewed`, 280 carry a non-empty `changes` array, 14
 * carry the key absent and 1 carries it empty. `add-ticket.js` does not create the
 * key at all, so a rule phrased as "present and empty" fires on every ticket that
 * has not been implemented yet and misses fourteen that have.
 *
 * The rule reports; it is not part of `validateTickets`. `update-ticket.js`
 * (lines 144-161) and `add-ticket.js` (line 66) reject the whole write when
 * `validateTickets` returns invalid, so wiring completeness into the structural
 * gate would make every later write fail against the fifteen tickets above —
 * including the writes this very ticket needs. The assertion that holds that
 * decision in place is the last one in this file.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  reportEmptyChangeSets,
  validateTickets,
} = require('../.claude/scripts/lib/validate-tickets.js');

const REPOSITORY_TICKETS = path.resolve(__dirname, '..', 'Tickets.json');

/**
 * The tickets this rule names in this repository today, recorded rather than
 * summarised. P24-8 is absent because this ticket wrote its record; the other
 * fourteen are the finding the audit did not examine, and they belong here by
 * name so that a fifteenth cannot join them unnoticed.
 */
const FROZEN_FINDING = Object.freeze([
  'P-1-19', 'P-1-20', 'P-1-30', 'P-1-66', 'P-1-67', 'P-1-68', 'P-1-69', 'P-1-70',
  'P-1-71', 'P-1-94', 'P-1-95', 'P-1-163', 'P-1-198', 'P2-1',
]);

/** A document carrying one ticket, so a status can be varied without a repository. */
const documentWith = (ticket) => ({
  title: 'subject',
  round: 1,
  metadata: { source: 'unit fixture', generatedAt: '2026-09-15' },
  phases: [{ id: 1, name: 'phase', tickets: [{ phaseId: 1, id: 1, title: 'subject', ...ticket }] }],
});

const CHANGE = Object.freeze({ file: 'a.mjs', before: 'old', after: 'new' });

// ---------------------------------------------------------------------------
// C002 precondition — a status, and a changes array that is absent, empty, or populated
// ---------------------------------------------------------------------------

test('C002 precondition: the three states of the record are distinguishable', () => {
  const absent = documentWith({ status: 'reviewed' });
  const empty = documentWith({ status: 'reviewed', changes: [] });
  const filled = documentWith({ status: 'reviewed', changes: [CHANGE] });

  assert.strictEqual(Object.prototype.hasOwnProperty.call(absent.phases[0].tickets[0], 'changes'), false);
  assert.deepStrictEqual(empty.phases[0].tickets[0].changes, []);
  assert.strictEqual(filled.phases[0].tickets[0].changes.length, 1);
});

// ---------------------------------------------------------------------------
// C002 postcondition — the violation names the key, the status and the field
// ---------------------------------------------------------------------------

test('C002 postcondition: the violation names the ticket key, its status and the field', () => {
  const reported = reportEmptyChangeSets(documentWith({ status: 'reviewed' }));

  assert.deepStrictEqual(reported, ['P1-1 (reviewed): changes must be a non-empty array']);
  assert.ok(reported[0].includes('P1-1'), 'a reader must be able to act without searching');
  assert.ok(reported[0].includes('reviewed'), 'the status is what made it a violation');
  assert.ok(reported[0].includes('changes'), 'the field is named');
});

test('C002 postcondition: an absent key and an empty array are one violation at a status that requires the record', () => {
  const absent = reportEmptyChangeSets(documentWith({ status: 'reviewed' }));
  const empty = reportEmptyChangeSets(documentWith({ status: 'reviewed', changes: [] }));

  assert.deepStrictEqual(empty, absent, 'at that status they are the same defect, not two');
  assert.deepStrictEqual(reportEmptyChangeSets(documentWith({ status: 'reviewed', changes: [CHANGE] })), []);
});

test('C002 postcondition: this repository reports the fourteen recorded tickets and nothing below the statuses that require the record', () => {
  const repository = JSON.parse(fs.readFileSync(REPOSITORY_TICKETS, 'utf8'));
  const reported = reportEmptyChangeSets(repository);
  const keys = reported.map((line) => line.slice(0, line.indexOf(' (')));

  assert.deepStrictEqual(keys, [...FROZEN_FINDING], 'the reported set is a record, not a summary');
  for (const line of reported) {
    assert.match(line, /^P-?\d+-\d+ \((?:done|reviewed)\): changes must be a non-empty array$/);
  }
  assert.ok(!keys.includes('P24-8'), 'a written record is what this ticket was for');
  for (const notReported of ['P25-1', 'P25-2', 'P25-3', 'P25-4']) {
    // P25-1 reaches `done` when this ticket closes, and `done` is a status that
    // owes the record. It is absent from the finding because it carries one, not
    // because it is exempt — the same reason the fourteen above are present.
    assert.ok(!keys.includes(notReported), notReported + ' must not be reported: not held at its status, or holding a written record');
  }
});

// ---------------------------------------------------------------------------
// C002 invariant — the status decides, and the structural gate the write path uses is untouched
// ---------------------------------------------------------------------------

test('C002 invariant: the boundary is the status, and one entry satisfies the record at every status', () => {
  for (const status of ['todo', 'made', 'planned']) {
    assert.deepStrictEqual(reportEmptyChangeSets(documentWith({ status })), [], status + ' is not held to the change record');
    assert.deepStrictEqual(
      reportEmptyChangeSets(documentWith({ status, changes: [] })),
      [],
      status + ' with an empty array is not held either',
    );
    assert.deepStrictEqual(reportEmptyChangeSets(documentWith({ status, changes: [CHANGE] })), []);
  }

  for (const status of ['done', 'reviewed']) {
    assert.strictEqual(reportEmptyChangeSets(documentWith({ status })).length, 1, status + ' is held');
    assert.strictEqual(reportEmptyChangeSets(documentWith({ status, changes: [] })).length, 1, status + ' with an empty array is held');
    assert.deepStrictEqual(
      reportEmptyChangeSets(documentWith({ status, changes: [CHANGE] })),
      [],
      'exactly one entry passes at ' + status,
    );
  }
});

test('C002 invariant: the completeness rule is a reporter, so the structural gate keeps its meaning', () => {
  const absent = documentWith({ status: 'reviewed' });

  // This assertion is the design decision, made executable. `update-ticket.js:144`
  // and `add-ticket.js:66` abort the whole write when `validateTickets` is invalid,
  // and this repository holds tickets the completeness rule names. Wiring the two
  // together would block every later write, so the two are kept apart here by name.
  assert.strictEqual(
    validateTickets(absent).valid,
    true,
    'the completeness rule must not be wired into the structural gate, or every write fails',
  );
  assert.strictEqual(validateTickets(documentWith({ status: 'reviewed', changes: 'not-an-array' })).valid, false, 'the shape gate still reports a shape defect');
});
