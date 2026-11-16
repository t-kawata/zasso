// PX-433 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';
import { run } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { listSnapshots, readSnapshot } from '../../.claude/scripts/conver/progress-gif/snapshot.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C006: a successful render writes timelineHealth to the snapshot', async () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: { 'pkg-1/Tickets.json': { phases: [] } },
  });
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let result;
  try {
    result = await run(root, { sourceScan: false, open: false, now: Date.now(), frames: 20, maxBytes: 10_000_000 });
  } finally {
    process.stdout.write = originalWrite;
  }
  const snapshots = listSnapshots(path.join(root, 'progress-gif', 'snapshots'), Number.POSITIVE_INFINITY);
  const snapshot = readSnapshot(snapshots[0].path);

  assert.equal(Boolean(result.output), true);
  assert.equal(snapshot.timelineHealth.mode, 'estimated');
  assert.deepEqual(snapshot.timelineHealth.violations, []);
  assert.equal(fs.existsSync(result.output.html), true);
});


