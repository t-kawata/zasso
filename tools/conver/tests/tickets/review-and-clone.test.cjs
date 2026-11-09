'use strict';
// PX-398 @verifies C004 @verifies C005

/**
 * PX-398 — the review record and the stale deferral clone.
 *
 * A reviewed ticket owes its evidence. A deferral clone that still carries the
 * source's title, background and scope has not been rewritten.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findReviewRecordGaps } = require('../../.claude/scripts/tickets/verify-review-record.js');
const { checkStaleCloneContent } = require('../../.claude/scripts/tickets/validate-ticket-targets.js');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const VALIDATE_TARGETS = path.join(CLAUDE_DIR, 'scripts/tickets/validate-ticket-targets.js');

/** A source ticket that defers one target to P0-2. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function sourceTicket(overrides = {}) {
  return {
    id: 1,
    phaseId: 0,
    status: 'done',
    title: 'Source work',
    background: 'source background',
    scope: ['source scope'],
    contracts: [],
    targetStubs: [{ id: 'S1', deferredTo: 'P0-2', status: 'pending' }],
    ...overrides,
  };
}

/** The clone that still equals its source. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function cloneTicket(overrides = {}) {
  return {
    id: 2,
    phaseId: 0,
    status: 'todo',
    title: 'Source work',
    background: 'source background',
    scope: ['source scope'],
    contracts: [],
    ...overrides,
  };
}

/** A package document with the source and the clone. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function documentFor(source, clone) {
  return { phases: [{ id: 0, name: 'P0', tickets: [source, clone] }] };
}

test('C004: a complete review record produces no finding', () => {
  assert.deepEqual(findReviewRecordGaps({
    status: 'reviewed',
    instrumentation: 'tests pass',
    rfcDiscrepancies: [],
    notes: 'reviewed',
  }, 'PX-1', 'Tickets.json'), []);
});

test('C004: a missing review field is reported with its name', () => {
  const findings = findReviewRecordGaps({
    status: 'reviewed',
    instrumentation: 'tests pass',
    rfcDiscrepancies: [],
    notes: '',
  }, 'PX-1', 'Tickets.json');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'REVIEW_RECORD_MISSING');
  assert.match(findings[0].asset, /notes/);
  assert.ok(findings[0].fixes.length > 0);
});

test('C004: a ticket that has not been reviewed is not checked', () => {
  assert.deepEqual(findReviewRecordGaps({ status: 'done' }, 'PX-1', 'Tickets.json'), []);
});

test('C004: an unchanged deferral clone is reported as stale', () => {
  const source = sourceTicket();
  const clone = cloneTicket();
  const findings = checkStaleCloneContent(source, documentFor(source, clone));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'STALE_CLONE_CONTENT');
  assert.equal(findings[0].cloneKey, 'P0-2');
});

test('C004: a rewritten deferral clone produces no finding', () => {
  const source = sourceTicket();
  const clone = cloneTicket({ title: 'Rewritten work', background: 'new background', scope: ['new scope'] });

  assert.deepEqual(checkStaleCloneContent(source, documentFor(source, clone)), []);
});

test('C005: validate-ticket-targets --report exits zero with the stale clone finding', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-clone-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  const source = sourceTicket();
  fs.writeFileSync(ticketsPath, JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: 0, name: 'P0', tickets: [source, cloneTicket()] }],
  }, null, 2) + '\n');

  const stdout = execFileSync(process.execPath, [
    VALIDATE_TARGETS,
    '--ticket-key=P0-1',
    '--tickets=' + ticketsPath,
    '--report',
  ], { encoding: 'utf8' });

  const report = JSON.parse(stdout);
  assert.equal(report.gate, 'validate-ticket-targets');
  assert.equal(report.ticketKey, 'P0-1');
  assert.ok(report.findings.some((entry) => entry.code === 'STALE_CLONE_CONTENT'));
});

test('C005: this ticket modifies no existing test file', () => {
  const status = execFileSync('git', [
    'status', '--porcelain', '--', 'tools/conver/tests', '.claude/tests',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  const existingTestEdits = status
    .split('\n')
    .filter((line) => /^(M | M|D | D)/.test(line));

  assert.deepEqual(existingTestEdits, []);
});
