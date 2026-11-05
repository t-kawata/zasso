// PX-366 @verifies C007
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitRecordFlag } from '../../../.claude/scripts/explain-seed/run.mjs';

test('C007: --record is stripped from the operation arguments and reported', () => {
  assert.deepEqual(splitRecordFlag(['info', 'RFC-SEED.md', '--record']), {
    recordRun: true,
    argv: ['info', 'RFC-SEED.md'],
  });
  assert.deepEqual(splitRecordFlag(['info', 'RFC-SEED.md']), {
    recordRun: false,
    argv: ['info', 'RFC-SEED.md'],
  });
});
