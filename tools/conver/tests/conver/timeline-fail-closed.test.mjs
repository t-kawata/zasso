// PX-433 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';
import { run } from '../../.claude/scripts/conver/draw-progress-gif.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C006: a previous-progress mismatch blocks HTML publication', async () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': { phases: [] },
      'pkg-1/.conver-history.jsonl': JSON.stringify({
        v: 1, runId: 'run-1', event: 'finish', command: 'make-ticket', stage: 'make',
        packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [],
      }) + '\n',
    },
  });
  const snapshotDir = path.join(root, 'progress-gif', 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, '20261101000000.json'), JSON.stringify({
    schema: 'conver-progress-snapshot-v1',
    overallProgress: 0.99,
    timelineHealth: { mode: 'history' },
  }));

  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let result;
  try {
    result = await run(root, { sourceScan: false, open: false, now: Date.parse('2026-11-03T00:00:00.000Z'), frames: 20, maxBytes: 10_000_000 });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(result.output, null);
  assert.equal(result.violations.some((violation) => violation.code === 'PREVIOUS_PROGRESS_MISMATCH'), true);
});
