// @verifies C001
// @verifies C002
// @verifies C004
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// Pattern definition must be the single source shared by detect and verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACE_LAYERS,
  TRACE_PATTERNS,
  L1_PATTERNS,
  L2_PATTERNS,
  IETF_REFERENCE,
  isCommentLine,
} from '../../../.claude/scripts/workspacify-reverse/lib/trace-patterns.mjs';

test('layer model declares L4 — and only L4 — as the structure that must survive', () => {
  assert.equal(TRACE_LAYERS.L1.removable, true);
  assert.equal(TRACE_LAYERS.L2.removable, true);
  assert.equal(TRACE_LAYERS.L3.removable, true);
  assert.equal(TRACE_LAYERS.L4.removable, false);
});

test('every L1 and L2 pattern only matches comment lines', () => {
  const samples = [
    '// [::TICKET::] P1-1 changes.',
    '// @verifies C001',
    '/// C026 invariant: RegistrationState is independent.',
    '// Initial Design Artifact — RFC-driven Implementation',
    '//   - NODE_ID=N0007: §5 Functional Requirements',
    '// Graph:        ../RFC-ROOT-GRAPH.json',
    '// Each module is stub-gated behind its responsible ticket.',
  ];
  for (const line of samples) {
    assert.ok(isCommentLine(line), `expected a comment line: ${line}`);
  }
});

test('IETF standard references are never matched as provenance', () => {
  const ietfLines = [
    '/// RFC 4733 defines the RTP payload format for DTMF digits.',
    'pub const DTMF_STANDARD: &str = "RFC 4733";',
    'pub const DTMF_LEGACY_STANDARD: &str = "RFC 2833";',
    'pub const SIP_INFO_STANDARD: &str = "RFC 2976";',
  ];
  for (const line of ietfLines) {
    if (!isCommentLine(line)) continue;
    for (const pattern of [...L1_PATTERNS, ...L2_PATTERNS]) {
      assert.equal(
        pattern.test(line),
        false,
        `IETF reference must not match ${pattern}: ${line}`,
      );
    }
  }
  assert.ok(IETF_REFERENCE.test(ietfLines[0]));
});

test('every @verifies annotation is provenance, whatever id family it names', () => {
  // Contract ids are not all C###: the TS-### family exists too, and a pattern
  // that only knows C### silently leaves those annotations in the tree.
  const annotations = ['/// @verifies TS-003', '// @verifies C001', '# @verifies C012'];
  for (const line of annotations) {
    assert.ok(
      L2_PATTERNS.some((pattern) => pattern.test(line)),
      `@verifies annotation must be detected: ${line}`,
    );
  }
});

test('TRACE_PATTERNS is the frozen single source for all layers', () => {
  assert.equal(Object.isFrozen(TRACE_PATTERNS), true);
  assert.equal(TRACE_PATTERNS.L1_PATTERNS, L1_PATTERNS);
  assert.equal(TRACE_PATTERNS.L2_PATTERNS, L2_PATTERNS);
  assert.ok(TRACE_PATTERNS.HEADER_MARKER instanceof RegExp);
  assert.ok(TRACE_PATTERNS.FENCE instanceof RegExp);
  assert.ok(TRACE_PATTERNS.IETF_REFERENCE instanceof RegExp);
});
