// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
'use strict';
// PX-399 @verifies C003 @verifies C004

/**
 * PX-399 — post-review invalidation.
 *
 * reviewed status is not a certificate. A resolve edit that leaves a gate
 * finding, or that changes the evidence a certificate recorded, is detected and
 * repaired in the same run; the status itself is never rewritten.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runReverify } = require('../../.claude/scripts/tickets/reverify-ticket.js');
const { patchTicket } = require('../../.claude/scripts/tickets/patch-ticket.js');
const {
  cleanTicket,
  reviewedTicket,
  documentWith,
  writeFixture,
  writeSourceFile,
} = require('./fixtures/reverify-fixtures.cjs');

test('C003: reverify aggregates contract, operation and annotation gaps', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reverify-gaps-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  writeSourceFile(directory, 'src-a.js', 'const a = 1;\n');
  const ticket = cleanTicket({
    testUnit: [],
    default_files: ['src-a.js'],
    distribution: {
      units: [{
        unitId: 'op-A',
        kind: 'operation',
        obligation: { mode: 'implement', rest: 'POST /a' },
      }],
    },
  });

  const result = runReverify({
    ticketKey: 'PX-1',
    ticketsPath,
    ticketsDocument: documentWith(ticket),
    changedFiles: ['src-a.js'],
    cwd: directory,
  });

  const codes = result.plan.findings.map((entry) => entry.code);
  assert.ok(codes.includes('CONTRACT_TEST_MISSING'));
  assert.ok(codes.includes('OPERATION_OBLIGATION_UNTESTED'));
  assert.ok(codes.includes('ANNOTATION_MISSING'));
  assert.ok(result.plan.findings.every((entry) => entry.fixes.length > 0));
});

test('C003: a missing annotation names the annotator repair route', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reverify-annotation-'));
  writeSourceFile(directory, 'src-a.js', 'const a = 1;\n');
  const ticket = cleanTicket({ default_files: ['src-a.js'] });

  const result = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: path.join(directory, 'Tickets.json'),
    ticketsDocument: documentWith(ticket),
    changedFiles: ['src-a.js'],
    cwd: directory,
  });

  const finding = result.plan.findings.find((entry) => entry.code === 'ANNOTATION_MISSING');
  assert.ok(finding);
  assert.equal(finding.fixes[0].tool, 'annotate-ticket-context');
});

test('C004: a reviewed ticket whose code changed produces REVIEWED_TICKET_STALE', () => {
  const fixture = writeFixture(reviewedTicket());

  const first = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
    writeCertificate: true,
    runCount: 2,
  });
  assert.equal(first.staleReviewed, false);

  patchTicket({
    ticketsPath: fixture.ticketsPath,
    ticketKey: 'PX-1',
    field: 'testUnit',
    value: ['UT: unrelated'],
    mode: 'overwrite',
  });

  const stale = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
  });
  assert.equal(stale.staleReviewed, true);
  assert.ok(stale.plan.findings.some((entry) => entry.code === 'REVIEWED_TICKET_STALE'));
  assert.equal(stale.status, 'reviewed');
});

test('C004: the stale reviewed ticket becomes clean after the repair loop reruns all gates', () => {
  const fixture = writeFixture(reviewedTicket());
  runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
    writeCertificate: true,
    runCount: 2,
  });

  patchTicket({
    ticketsPath: fixture.ticketsPath,
    ticketKey: 'PX-1',
    field: 'testUnit',
    value: [],
    mode: 'overwrite',
  });
  const stale = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
  });
  assert.ok(stale.plan.count > 0);

  patchTicket({
    ticketsPath: fixture.ticketsPath,
    ticketKey: 'PX-1',
    field: 'testUnit',
    value: ['UT: C001 order exists order saved order stable'],
    mode: 'append',
  });
  const repaired = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: fixture.ticketsPath,
    changedFiles: [],
    writeCertificate: true,
    runCount: 2,
  });

  assert.equal(repaired.plan.count, 0);
  assert.equal(repaired.staleReviewed, false);
  assert.equal(repaired.certificateWritten, true);
  assert.equal(repaired.status, 'reviewed');
});
