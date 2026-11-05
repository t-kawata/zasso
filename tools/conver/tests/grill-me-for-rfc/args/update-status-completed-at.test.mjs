// PX-238 @verifies C004
// [::TICKET::] PX-238 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * The moment a run completes, written down.
 *
 * update-status.js moves updatedAt on every transition, so once a later write has
 * happened the record no longer says when the run completed. A session that is
 * resumed afterwards needs exactly that moment: it is the only thing that tells
 * "material arrived after this run finished" apart from "this run finished, and
 * something else was written since". The field is written by the one transition
 * that means completion and by no other, and it is optional so that a Status.json
 * written before this ticket still validates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GRILL_INIT,
  GRILL_UPDATE_STATUS,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';
import { REQUIRED_GATE_NAMES } from '../../../.claude/scripts/grill-me-for-rfc/complete-run.js';

const COMPLETION_RECEIPT_FILENAME = '.conver-completion.json';
const DONE_STATE = 'DONE';

/** What update-status.js recorded. */
// [::TICKET::] PX-238 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-238 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

/**
 * Write the completion receipt complete-run.js would write.
 *
 * The receipt is the gate evidence the DONE transition now requires. The helper
 * writes the shape the writer reads, so a test about completedAt does not depend on
 * the completion command itself.
 */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function writeCompletionReceipt(rfcDir, gates = REQUIRED_GATE_NAMES.map((name) => ({ name, exitCode: 0 }))) {
  const receiptPath = join(rfcDir, COMPLETION_RECEIPT_FILENAME);
  writeFileSync(receiptPath, JSON.stringify({
    format: 1,
    gateNames: gates.map((gate) => gate.name),
    gates,
    writtenAt: '2026-01-01T00:00:00.000Z',
  }, null, 2), 'utf8');
  return receiptPath;
}

/** Transition to DONE with the evidence the transition now requires. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function complete(rfcDir) {
  writeCompletionReceipt(rfcDir);
  return runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);
}

/** A session directory in a fresh temporary tree. */
// [::TICKET::] PX-238 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-238 --for-spec --no-implementation-order`.
function makeSession() {
  const base = mkdtempSync(join(tmpdir(), 'px238-completed-'));
  const rfcDir = join(base, 'pkg');
  mkdirSync(rfcDir, { recursive: true });
  const material = join(base, 'material.md');
  writeFileSync(material, '# material\n', 'utf8');
  assert.equal(runCommand(GRILL_INIT, [rfcDir, material]).status, 0);
  return rfcDir;
}

test('a completion is recorded as a time, not merely as a state', () => {
  const rfcDir = makeSession();

  const result = complete(rfcDir);

  assert.equal(result.status, 0, result.stderr);
  const { completedAt } = readStatus(rfcDir);
  assert.equal(typeof completedAt, 'string');
  assert.equal(Number.isNaN(Date.parse(completedAt)), false, 'the value is an ISO 8601 date');
});

test('a transition that is not a completion does not claim to be one', () => {
  const rfcDir = makeSession();

  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']).status, 0);

  assert.equal(readStatus(rfcDir).completedAt, undefined);
});

test('two completions are two distinct moments', () => {
  const rfcDir = makeSession();
  assert.equal(complete(rfcDir).status, 0);
  const first = readStatus(rfcDir).completedAt;

  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']).status, 0);
  assert.equal(complete(rfcDir).status, 0);

  const second = readStatus(rfcDir).completedAt;
  assert.equal(Number.isNaN(Date.parse(second)), false);
  assert.ok(Date.parse(second) >= Date.parse(first), 'the later completion is not older');
});

test('a record written before this ticket still validates', () => {
  const rfcDir = makeSession();
  const statusPath = join(rfcDir, 'Status.json');
  const legacy = readStatus(rfcDir);
  delete legacy.completedAt;
  delete legacy.materialsAddedAt;
  writeFileSync(statusPath, JSON.stringify(legacy, null, 2), 'utf8');

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']);

  assert.equal(result.status, 0, 'absent optional fields are valid: ' + result.stderr);
});

// PX-282 — the completed-session counter.
//
// A session is counted when it transitions into DONE, not when it is resumed or when a
// review loop is spent. The counter is prospective: a Status.json written before this
// ticket starts at zero and its first completion records one.

// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
test('C002 postcondition: a transition into DONE records one completed session', () => {
  const rfcDir = makeSession();

  const result = complete(rfcDir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readStatus(rfcDir).completedSessions, 1);
});

test('C002 invariant: a repeated DONE without a transition does not count a second session', () => {
  const rfcDir = makeSession();
  assert.equal(complete(rfcDir).status, 0);
  assert.equal(complete(rfcDir).status, 0);

  assert.equal(readStatus(rfcDir).completedSessions, 1);
});

test('C002 invariant: inc-loop and a resume do not count a session', () => {
  const rfcDir = makeSession();
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'inc-loop']).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']).status, 0);
  assert.equal(readStatus(rfcDir).completedSessions, undefined);

  assert.equal(complete(rfcDir).status, 0);
  assert.equal(readStatus(rfcDir).completedSessions, 1);
});

test('C002 postcondition: a second GRILLING to DONE round records a second session', () => {
  const rfcDir = makeSession();
  assert.equal(complete(rfcDir).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']).status, 0);
  assert.equal(complete(rfcDir).status, 0);

  assert.equal(readStatus(rfcDir).completedSessions, 2);
});

test('C002 boundary: an existing count is carried forward and a legacy record starts at one', () => {
  const rfcDir = makeSession();
  const statusPath = join(rfcDir, 'Status.json');
  const status = readStatus(rfcDir);
  status.completedSessions = 3;
  status.state = 'GRILLING';
  writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');

  assert.equal(complete(rfcDir).status, 0);
  assert.equal(readStatus(rfcDir).completedSessions, 4);

  const legacy = readStatus(rfcDir);
  delete legacy.completedSessions;
  legacy.state = 'GRILLING';
  writeFileSync(statusPath, JSON.stringify(legacy, null, 2), 'utf8');
  assert.equal(complete(rfcDir).status, 0);
  assert.equal(readStatus(rfcDir).completedSessions, 1);
});

// PX-371 @verifies C001
// DONE is evidence, not a state a caller can write. The receipt is written by the
// completion command after the gates pass and consumed by this transition, so a
// second DONE cannot replay the same evidence.

test('C001 precondition: DONE without a completion receipt is refused', () => {
  const rfcDir = makeSession();
  const before = readFileSync(join(rfcDir, 'Status.json'), 'utf8');

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COMPLETION_RECEIPT_MISSING/);
  assert.equal(readFileSync(join(rfcDir, 'Status.json'), 'utf8'), before);
});

test('C001 postcondition: a receipt naming every required gate at exit zero writes DONE once', () => {
  const rfcDir = makeSession();
  const receiptPath = writeCompletionReceipt(rfcDir);

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);

  assert.equal(result.status, 0, result.stderr);
  const status = readStatus(rfcDir);
  assert.equal(status.state, 'DONE');
  assert.equal(typeof status.completedAt, 'string');
  assert.equal(status.completedSessions, 1);
  assert.equal(existsSync(receiptPath), false, 'the receipt is consumed');
});

test('C001 invariant: a receipt with a non-zero gate is refused', () => {
  const rfcDir = makeSession();
  writeCompletionReceipt(rfcDir, REQUIRED_GATE_NAMES.map((name, index) => ({ name, exitCode: index === 0 ? 1 : 0 })));

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COMPLETION_GATE_FAILED/);
  assert.notEqual(readStatus(rfcDir).state, DONE_STATE);
});

test('C001 invariant: a receipt missing a required gate name is refused', () => {
  const rfcDir = makeSession();
  writeCompletionReceipt(rfcDir, REQUIRED_GATE_NAMES.slice(1).map((name) => ({ name, exitCode: 0 })));

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COMPLETION_RECEIPT_INVALID/);
  assert.notEqual(readStatus(rfcDir).state, DONE_STATE);
});

test('C001 invariant: a consumed receipt cannot be replayed to write a second DONE', () => {
  const rfcDir = makeSession();
  writeCompletionReceipt(rfcDir);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]).status, 0);

  const replay = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', DONE_STATE]);

  assert.notEqual(replay.status, 0);
  assert.match(replay.stderr, /COMPLETION_RECEIPT_MISSING/);
});
