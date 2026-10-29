// [::TICKET::] PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-293 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectStaleAnchor,
  recordIdOf,
  supersedeRecord,
} from '../../.claude/scripts/smooth-sequences/lib/provenance.mjs';

// @verifies C002
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('re-anchoring creates a superseding record and leaves the original reader intact', () => {
  const original = {
    subject: '@object:AssetScore',
    line: 1,
    quote: 'old quote',
    reader: 'educe-sequences/generation-1',
    recordId: 'r1',
  };
  const next = supersedeRecord(
    original,
    { line: 2, quote: 'AssetScore is recomputed' },
    { reader: 'educe-sequences/generation-2' },
  );
  assert.equal(next.supersedes, 'r1');
  assert.equal(original.reader, 'educe-sequences/generation-1');
  assert.equal(original.line, 1);
  assert.notEqual(next.recordId, 'r1');
  assert.equal(next.reader, 'educe-sequences/generation-2');
});

// @verifies C002
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a stale anchor is reported without changing the record', () => {
  const record = {
    subject: '@object:AssetScore',
    line: 1,
    quote: 'old quote',
    reader: 'educe-sequences/generation-1',
  };
  const report = detectStaleAnchor(record, ['nothing here', 'AssetScore is recomputed']);
  assert.equal(report.stale, true);
  assert.equal(report.reason, 'ANCHOR_DOES_NOT_NAME_OBJECT');
  assert.equal(record.line, 1);
  const current = detectStaleAnchor(record, ['AssetScore is recomputed', 'nothing here']);
  assert.equal(current.stale, false);
});

// @verifies C002
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the record id is a pure function of the record body', () => {
  const record = { subject: 's1', line: 1, quote: 'q', reader: 'educe-sequences/generation-1' };
  assert.equal(recordIdOf(record), recordIdOf({ ...record }));
  assert.notEqual(recordIdOf(record), recordIdOf({ ...record, line: 2 }));
  assert.equal(recordIdOf({ ...record, recordId: 'ignored' }), recordIdOf(record));
});
