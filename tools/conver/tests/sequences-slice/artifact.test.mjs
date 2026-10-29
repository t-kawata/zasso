// PX-255 @verifies C001
// The input gate exists because the ticket that grows into PX-257 will be calibrated
// against, and a calibration that ran on a truncated artifact would report a smaller
// world as a complete one. Every rejection names the source, so the operator can act.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSequencesArtifact } from '../../.claude/scripts/sequences-slice/lib/artifact.mjs';

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 a well formed artifact parses to the document it names', () => {
  const artifact = parseSequencesArtifact(
    JSON.stringify({ schema_version: 2, sequences: [], steps: [], operations: [] }),
    '/tmp/artifact.json',
  );
  assert.equal(artifact.schema_version, 2);
  assert.deepEqual(artifact.sequences, []);
  assert.deepEqual(artifact.steps, []);
  assert.deepEqual(artifact.operations, []);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 a document that is not JSON is rejected with the source named', () => {
  assert.throws(
    () => parseSequencesArtifact('{ "schema_version": 2, ', '/tmp/malformed.json'),
    /\/tmp\/malformed\.json/,
  );
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 a document whose three arrays are not arrays is rejected with the field named', () => {
  assert.throws(
    () => parseSequencesArtifact(JSON.stringify({ schema_version: 2, sequences: [], steps: [], operations: {} }), '/tmp/a.json'),
    /operations/,
  );
  assert.throws(
    () => parseSequencesArtifact(JSON.stringify({ schema_version: 2, sequences: {}, steps: [], operations: [] }), '/tmp/a.json'),
    /sequences/,
  );
  assert.throws(
    () => parseSequencesArtifact(JSON.stringify({ schema_version: 2, sequences: [], steps: null, operations: [] }), '/tmp/a.json'),
    /steps/,
  );
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 a document with no numeric schema_version is rejected as not being this artifact', () => {
  assert.throws(
    () => parseSequencesArtifact(JSON.stringify({ sequences: [], steps: [], operations: [] }), '/tmp/a.json'),
    /schema_version/,
  );
  assert.throws(
    () => parseSequencesArtifact(JSON.stringify(['not', 'an', 'object']), '/tmp/a.json'),
    /\/tmp\/a\.json/,
  );
});
