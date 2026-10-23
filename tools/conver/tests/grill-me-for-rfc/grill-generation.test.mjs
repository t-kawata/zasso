// PX-309 @verifies C001
// PX-309 @verifies C002
// A grill execution opens one generation. The count moves on a new run, not on a review
// loop and not on a repeated DONE, so a re-entry is visible and a resume is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INIT = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/init.js');
const UPDATE_STATUS = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/update-status.js');

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function freshSession() {
  const root = mkdtempSync(join(tmpdir(), 'px309-grill-'));
  const rfcDir = join(root, 'rfc');
  const materialDir = join(root, 'material');
  mkdirSync(rfcDir);
  mkdirSync(materialDir);
  writeFileSync(join(materialDir, 'seed.md'), '# seed\n');
  execFileSync(process.execPath, [INIT, rfcDir, materialDir], { encoding: 'utf8' });
  return { root, rfcDir, statusPath: join(rfcDir, 'Status.json') };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function setState(rfcDir, state) {
  execFileSync(process.execPath, [UPDATE_STATUS, rfcDir, 'set-state', state], { encoding: 'utf8' });
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function beginRun(rfcDir) {
  execFileSync(process.execPath, [UPDATE_STATUS, rfcDir, 'begin-run'], { encoding: 'utf8' });
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  return JSON.parse(readFileSync(statusPath, 'utf8'));
}

test('C002 initialization alone records no generation; the first run opens one', () => {
  const session = freshSession();
  assert.equal(readStatus(session.statusPath).grillGeneration, undefined);
  beginRun(session.rfcDir);
  const status = readStatus(session.statusPath);
  assert.equal(status.state, 'GRILLING');
  assert.equal(status.grillGeneration, 1);
});

test('C001 every run increments the grill generation, whatever the state', () => {
  const session = freshSession();
  setState(session.rfcDir, 'DONE');
  beginRun(session.rfcDir);
  assert.equal(readStatus(session.statusPath).grillGeneration, 2);
  assert.equal(readStatus(session.statusPath).completedSessions, 1);
});

test('C001 a state transition alone never opens a generation', () => {
  const session = freshSession();
  beginRun(session.rfcDir);
  setState(session.rfcDir, 'REVIEWING');
  setState(session.rfcDir, 'GRILLING');
  setState(session.rfcDir, 'GRILLING');
  assert.equal(readStatus(session.statusPath).grillGeneration, 1);
});

test('C001 a record without the field starts from completedSessions', () => {
  const session = freshSession();
  const status = readStatus(session.statusPath);
  delete status.grillGeneration;
  status.state = 'DONE';
  status.completedSessions = 4;
  writeFileSync(session.statusPath, JSON.stringify(status, null, 2));
  beginRun(session.rfcDir);
  assert.equal(readStatus(session.statusPath).grillGeneration, 5);
});
