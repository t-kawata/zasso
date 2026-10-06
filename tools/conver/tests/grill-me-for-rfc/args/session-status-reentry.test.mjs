// PX-238 @verifies C004
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * What the mechanical status says once a run has completed and then moved on.
 *
 * session-status.js exists so a reader can learn where a session stands without
 * thinking about it. For a completed session whose material has since grown, the
 * honest answer is not "Complete" with no action: the run has something new to
 * read, and the command's own re-entry rule says so. The two cases below are the
 * pair that makes the answer trustworthy — the action appears only after material
 * actually arrived, and a session that merely completed is left as it was.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GRILL_INIT,
  GRILL_SESSION_STATUS,
  GRILL_UPDATE_STATUS,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

const NO_ACTION = 'Next Action: —';

/** What init.js recorded about the run. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function readStatus(rfcDir) {
  return JSON.parse(readFileSync(join(rfcDir, 'Status.json'), 'utf8'));
}

/** A completed session in a fresh temporary tree, with a scratch area beside it. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function makeCompletedSession() {
  const base = mkdtempSync(join(tmpdir(), 'px238-reentry-'));
  const rfcDir = join(base, 'pkg');
  mkdirSync(rfcDir, { recursive: true });
  const material = join(base, 'material.md');
  writeFileSync(material, '# material\n', 'utf8');
  assert.equal(runCommand(GRILL_INIT, [rfcDir, material]).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [rfcDir, 'set-state', 'DONE']).status, 0);
  return { base, rfcDir, materialPath: (name) => join(base, name) };
}

test('a completed session with nothing new offers no action', () => {
  const session = makeCompletedSession();

  const output = runCommand(GRILL_SESSION_STATUS, [session.rfcDir]).stdout;

  assert.equal(output.includes(NO_ACTION), true, 'the silent case is unchanged');
});

test('material recorded before the completion does not re-open the run', () => {
  const session = makeCompletedSession();
  const statusPath = join(session.rfcDir, 'Status.json');
  const status = readStatus(session.rfcDir);
  status.materialsAddedAt = '2000-01-01T00:00:00.000Z';
  writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');

  const output = runCommand(GRILL_SESSION_STATUS, [session.rfcDir]).stdout;

  assert.equal(output.includes(NO_ACTION), true, 'an older material timestamp is not a reason to re-open');
});

test('material that arrives after the completion offers the re-entry', () => {
  const session = makeCompletedSession();
  const added = session.materialPath('added.md');
  writeFileSync(added, '# added\n', 'utf8');
  assert.equal(runCommand(GRILL_INIT, [session.rfcDir, added]).status, 0);

  const output = runCommand(GRILL_SESSION_STATUS, [session.rfcDir]).stdout;

  assert.equal(output.includes(NO_ACTION), false, 'the completed session has something new to read');
  assert.match(output, /re-?entry/i, 'and the action says what it is');
  assert.match(output, /Next Action: \S/, 'the action line carries words, not a dash');
});

test('a second completion with no new material is silent again', () => {
  const session = makeCompletedSession();
  const added = session.materialPath('added.md');
  writeFileSync(added, '# added\n', 'utf8');
  assert.equal(runCommand(GRILL_INIT, [session.rfcDir, added]).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [session.rfcDir, 'set-state', 'GRILLING']).status, 0);
  assert.equal(runCommand(GRILL_UPDATE_STATUS, [session.rfcDir, 'set-state', 'DONE']).status, 0);

  const output = runCommand(GRILL_SESSION_STATUS, [session.rfcDir]).stdout;

  assert.equal(output.includes(NO_ACTION), true, 'the material was read before this completion');
});
