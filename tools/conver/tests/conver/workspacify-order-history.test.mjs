// PX-366 @verifies C007
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';

const SCRIPT = new URL('../../.claude/scripts/workspacify-order/run.mjs', import.meta.url).pathname;

test('C007: workspacify-order records its own run in the fitness layer', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: { 'pkg-1/.keep': '' },
  });

  const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
  const historyPath = path.join(root, '.conver-history.jsonl');

  assert.equal(fs.existsSync(historyPath), true, 'history file must exist');
  const records = fs.readFileSync(historyPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const starts = records.filter((record) => record.event === 'start');
  const finishes = records.filter((record) => record.event === 'finish');

  assert.equal(result.status, 1, 'the fixture is refused');
  assert.equal(starts.length, 1);
  assert.equal(finishes.length, 1);
  assert.equal(starts[0].command, 'workspacify-order');
  assert.equal(starts[0].stage, 'educe');
  assert.equal(finishes[0].runId, starts[0].runId);
  assert.equal(finishes[0].status, 'BLOCKED_PREREQUISITE');
});
