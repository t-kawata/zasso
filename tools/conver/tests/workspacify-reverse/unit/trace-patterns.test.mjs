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
  L3_PATTERN,
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

test('the design document is matched in both spellings, and a numbered IETF document is not', () => {
  // `RFC.md` is the canonical name the tools write (PX-235); `RFC-ROOT.md` is what a
  // project driven before that carries, and its derived graph and dirs-tree likewise. A
  // scrub that knew only the older spelling would leave the newer one in the tree, which
  // is the whole failure this layer exists to prevent.
  const commentLines = ['// Graph: ../RFC-GRAPH.json', '// See RFC.md for the design.'];
  for (const line of commentLines) {
    assert.ok(
      L1_PATTERNS.some((pattern) => pattern.test(line)),
      `a comment naming the design document is provenance: ${line}`,
    );
  }

  const codeLines = ['const canonical = "RFC.md";', 'let tree = "RFC-Dirs-Tree.json";'];
  for (const line of codeLines) {
    assert.ok(L3_PATTERN.test(line), `a non-comment line reading the design document is L3: ${line}`);
  }

  // Numbered IETF documents are ordinary domain knowledge and must survive every scrub,
  // which is why the alternation names the artefacts instead of accepting `RFC-*.md`.
  assert.equal(L3_PATTERN.test('const standard = "RFC-4733.md";'), false);
  assert.equal(L1_PATTERNS.some((pattern) => pattern.test('// RFC 4733 defines DTMF.')), false);
});
