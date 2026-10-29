// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
// PX-309 @verifies C004
// The display counters are read beside the record that owns them. A record written before
// the generation fields existed still answers a documented lower bound rather than zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  readBoundifyGeneration,
  readDistributionGeneration,
  readGraphGeneration,
  readGrillGeneration,
  readSplitGeneration,
} from '../../../.claude/scripts/workspacify-order/lib/counters.mjs';
import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
function packageDirectory(t) {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'] });
  t.after(() => workspace.remove());
  return workspace.directoryOf('pkg-0001');
}

test('C004 a recorded grill generation is read as written', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'DONE', grillGeneration: 3 }));
  assert.equal(readGrillGeneration(directory), 3);
});

test('C004 a record without the field falls back to completed sessions', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'DONE', completedSessions: 4 }));
  assert.equal(readGrillGeneration(directory), 4);
});

test('C004 a zero session count is unknown rather than generation zero', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'DONE', completedSessions: 0 }));
  assert.equal(readGrillGeneration(directory), null);
});

test('C004 an absent or unreadable record is unknown', (t) => {
  const directory = packageDirectory(t);
  assert.equal(readGrillGeneration(directory), null);
  writeFileSync(join(directory, 'Status.json'), '{not json');
  assert.equal(readGrillGeneration(directory), null);
  assert.equal(readDistributionGeneration(directory), null);
});

test('C004 a recorded distribution generation is read as written', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'GRILLING', distributionGeneration: 2 }));
  assert.equal(readDistributionGeneration(directory), 2);
});

test('C004 a record without the field falls back to one when the RFC carries a map', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'Status.json'), JSON.stringify({ state: 'GRILLING' }));
  assert.equal(readDistributionGeneration(directory), null);

  writeFileSync(join(directory, 'RFC.md'), '```json distribution-map\n{}\n```\n');
  assert.equal(readDistributionGeneration(directory), 1);
});

test('C005 a recorded downstream generation is read as written', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({ generation: 3 }));
  writeFileSync(join(directory, 'RFC-BOUNDIFY-Status.json'), JSON.stringify({ generation: 2 }));
  writeFileSync(join(directory, 'RFC-SPLIT-Status.json'), JSON.stringify({ generation: 1 }));
  assert.equal(readGraphGeneration(directory, 'RFC'), 3);
  assert.equal(readBoundifyGeneration(directory, 'RFC'), 2);
  assert.equal(readSplitGeneration(directory, 'RFC'), 1);
});

test('C005 a downstream status without a generation is unknown', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'RFC-GRAPHIFY-Status.json'), JSON.stringify({ runs: 4 }));
  writeFileSync(join(directory, 'RFC-BOUNDIFY-Status.json'), '{not json');
  assert.equal(readGraphGeneration(directory, 'RFC'), null);
  assert.equal(readBoundifyGeneration(directory, 'RFC'), null);
  assert.equal(readSplitGeneration(directory, 'RFC'), null);
});

test('C005 a zero or absent stem is unknown, never generation zero', (t) => {
  const directory = packageDirectory(t);
  writeFileSync(join(directory, 'RFC-SPLIT-Status.json'), JSON.stringify({ generation: 0 }));
  assert.equal(readSplitGeneration(directory, 'RFC'), null);
  assert.equal(readSplitGeneration(directory, null), null);
});
