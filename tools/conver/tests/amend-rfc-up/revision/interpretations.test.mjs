// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C004
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDocumentMap } from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import {
  assertInterpretationConflicts,
  validateInterpretations,
} from '../../../.claude/scripts/amend-rfc-up/revision/interpretations.mjs';

const text = '# Revision\n\nA reference-only note.\n';
const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
const lineHash = map.lineHashes[2];

test('C004: a valid interpretation names its line hash and disposition', () => {
  assert.doesNotThrow(() => validateInterpretations({
    interpretations: [{ line: 3, line_sha256: lineHash, disposition: 'no-op', rationale: 'restatement' }],
    documentMap: map,
  }));
});

test('C004: a missing line hash fails with INTERPRETATION_MISSING', () => {
  assert.throws(
    () => validateInterpretations({ interpretations: [{ line: 3, disposition: 'no-op' }], documentMap: map }),
    (error) => error.code === 'INTERPRETATION_MISSING',
  );
});

test('C004: conflicting interpretations on one line fail closed', () => {
  assert.throws(
    () => assertInterpretationConflicts([
      { line: 3, target: 'A', operation: 'update-rule', disposition: 'operation' },
      { line: 3, target: 'B', operation: 'update-rule', disposition: 'operation' },
    ]),
    (error) => error.code === 'INTERPRETATION_CONFLICT',
  );
});

test('C004: a destructive interpretation requires evidence', () => {
  assert.throws(
    () => validateInterpretations({
      interpretations: [{ line: 3, line_sha256: lineHash, disposition: 'destructive', target: 'REST-01' }],
      documentMap: map,
    }),
    (error) => error.code === 'INTERPRETATION_UNRESOLVED',
  );
});
