// PX-238 @verifies C004
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GRILL_INIT,
  GRILL_UPDATE_STATUS,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

/** What update-status.js recorded. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

/** A session directory in a fresh temporary tree. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
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

  const result = runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'DONE']);

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
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'DONE']).status, 0);
  const first = readStatus(rfcDir).completedAt;

  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'GRILLING']).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'DONE']).status, 0);

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
