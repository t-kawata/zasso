// @verifies C002
// @verifies C003
// @verifies C005
// @verifies C006
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// Removal is line-scoped and must never damage code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { detectForwardTraces } from '../../../.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs';
import {
  planScrub,
  scrubForwardTraces,
} from '../../../.claude/scripts/workspacify-reverse/lib/scrub-forward-traces.mjs';
import {
  createScratchProject,
  createScratchFrom,
  FIXTURE_MIXED_L3,
  FIXTURE_UNCLOSED_HEADER,
  nonCommentLines,
  readLines,
} from '../helpers/scratch.mjs';

// UT-6
test('planScrub selects only L1 and L2 lines', () => {
  const scratch = createScratchProject();
  try {
    const plan = planScrub(detectForwardTraces(scratch.root));
    assert.ok(plan.removals.length > 0);
    for (const removal of plan.removals) {
      assert.ok(removal.layer === 'L1' || removal.layer === 'L2', removal.layer);
    }
  } finally {
    scratch.dispose();
  }
});

// UT-7
test('header block removal is block-scoped and leaves surrounding comments intact', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    const lines = readLines(path.join(scratch.root, 'src', 'lib.rs'));
    assert.ok(!lines.some((line) => line.includes('Initial Design Artifact')));
    assert.ok(!lines.some((line) => line.includes('NODE_ID=')));
    assert.ok(!lines.some((line) => line.includes('RFC-ROOT')));
    assert.ok(lines.some((line) => line.includes('pub mod client;')));
  } finally {
    scratch.dispose();
  }
});

// UT-11
test('dry-run changes nothing', () => {
  const scratch = createScratchProject();
  try {
    const before = readFileSync(path.join(scratch.root, 'src', 'lib.rs'), 'utf8');
    const result = scrubForwardTraces(scratch.root, { dryRun: true });
    assert.deepEqual(result.writes, []);
    assert.equal(readFileSync(path.join(scratch.root, 'src', 'lib.rs'), 'utf8'), before);
  } finally {
    scratch.dispose();
  }
});

// UT-12
test('a tree with zero provenance reports a clean, successful run', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    const second = scrubForwardTraces(scratch.root, { apply: true });
    assert.equal(second.removed, 0);
    assert.deepEqual(second.warnings, []);
  } finally {
    scratch.dispose();
  }
});

// UT-13
test('a zero-byte file is handled safely', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    assert.equal(readFileSync(path.join(scratch.root, 'src', 'empty.rs'), 'utf8'), '');
  } finally {
    scratch.dispose();
  }
});

// UT-14
test('a header-only file survives as a valid, smaller file', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    const body = readFileSync(path.join(scratch.root, 'src', 'header_only.rs'), 'utf8');
    assert.equal(body.includes('Initial Design Artifact'), false);
  } finally {
    scratch.dispose();
  }
});

// UT-15
test('an unclosed header block passes through unchanged and raises a warning', () => {
  const scratch = createScratchFrom(FIXTURE_UNCLOSED_HEADER);
  try {
    const target = path.join(scratch.root, 'src', 'unclosed_header.rs');
    const before = readFileSync(target, 'utf8');
    const result = scrubForwardTraces(scratch.root, { apply: true });
    assert.equal(readFileSync(target, 'utf8'), before);
    assert.ok(result.warnings.some((warning) => warning.file.endsWith('unclosed_header.rs')));
  } finally {
    scratch.dispose();
  }
});

// UT-16
test('CRLF line endings are preserved for untouched lines', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    const body = readFileSync(path.join(scratch.root, 'src', 'crlf.rs'), 'utf8');
    assert.ok(body.includes('pub fn crlf_marker() -> bool {'));
    assert.ok(body.includes('\r\n'));
  } finally {
    scratch.dispose();
  }
});

// UT-17 — C002 postcondition
test('IETF standard references survive the scrub byte for byte', () => {
  const scratch = createScratchProject();
  try {
    const target = path.join(scratch.root, 'src', 'ietf.rs');
    const before = readFileSync(target, 'utf8');
    scrubForwardTraces(scratch.root, { apply: true });
    assert.equal(readFileSync(target, 'utf8'), before);
  } finally {
    scratch.dispose();
  }
});

// UT-18 — C006
test('ticket-keyed test files are renamed to remove the key', () => {
  const scratch = createScratchProject();
  try {
    const result = scrubForwardTraces(scratch.root, { apply: true, renameTicketKeyedFiles: true });
    assert.ok(result.renames.length > 0);
    for (const renamed of result.renames) {
      assert.match(renamed.to, /verify_spec_[a-z0-9_]+\.rs$/);
      assert.equal(/p\d+_\d+/.test(renamed.to), false);
    }
  } finally {
    scratch.dispose();
  }
});

// UT-18b — C006: two keyed files must never collapse onto one name
test('every renamed test file keeps its own name and content', () => {
  const scratch = createScratchProject();
  try {
    const result = scrubForwardTraces(scratch.root, { apply: true, renameTicketKeyedFiles: true });
    const targets = result.renames.map((renamed) => renamed.to);
    assert.equal(new Set(targets).size, targets.length, `collision among: ${targets.join(', ')}`);
    for (const renamed of result.renames) {
      assert.ok(existsSync(path.join(scratch.root, renamed.to)), renamed.to);
    }
  } finally {
    scratch.dispose();
  }
});

// UT-15b — a mixed file must lose its design-document test but keep production code
test('a mixed file drops the test that reads the design document only', () => {
  const scratch = createScratchFrom(FIXTURE_MIXED_L3);
  try {
    const target = path.join(scratch.root, 'src', 'mixed.rs');
    const result = scrubForwardTraces(scratch.root, { apply: true });
    const body = readFileSync(target, 'utf8');
    assert.equal(body.includes('[::TICKET::]'), false, 'L1 must be removed');
    assert.equal(body.includes('@verifies'), false, 'L2 must be removed');
    assert.equal(body.includes('RFC-ROOT.md'), false, 'the L3 test function must be removed');
    assert.ok(body.includes('pub fn start()'), 'production code must survive');
    assert.equal(result.warnings.length, 0);
  } finally {
    scratch.dispose();
  }
});

// UT-15c — a broken compile-time embedding is an L3 trace, not a comment layer
test('a test embedding a missing document is treated as L3 and removed', () => {
  const scratch = createScratchFrom(FIXTURE_MIXED_L3);
  try {
    const target = path.join(scratch.root, 'src', 'missing_include.rs');
    scrubForwardTraces(scratch.root, { apply: true });
    const body = readFileSync(target, 'utf8');
    assert.equal(body.includes('include_str!'), false, 'the broken embedding must be removed');
    assert.equal(body.includes('ABSENT-DESIGN-DOC'), false);
    assert.ok(body.includes('pub fn helper()'), 'production code must survive');
  } finally {
    scratch.dispose();
  }
});

// UT-20b — C003: the TS-### contract family must not survive either
test('an @verifies annotation naming a TS contract is removed', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true });
    const body = readFileSync(path.join(scratch.root, 'src', 'plain.rs'), 'utf8');
    assert.equal(body.includes('@verifies'), false);
    assert.equal(body.includes('TS-003'), false);
    assert.ok(body.includes('pub fn legacy()'), 'code must survive');
  } finally {
    scratch.dispose();
  }
});

// C002 invariant — non-comment lines of every surviving file are untouched
test('non-comment lines are never modified or deleted in the files the scrub keeps', () => {
  const scratch = createScratchProject();
  try {
    const scrubbed = ['lib.rs', 'error.rs', 'ietf.rs'];
    const before = {};
    for (const name of scrubbed) {
      before[name] = nonCommentLines(readLines(path.join(scratch.root, 'src', name)));
    }
    scrubForwardTraces(scratch.root, { apply: true });
    for (const [name, lines] of Object.entries(before)) {
      const after = nonCommentLines(readLines(path.join(scratch.root, 'src', name)));
      assert.deepEqual(after, lines, name);
    }
    // L3 is a whole-file removal, not a line removal, so it is asserted apart.
    assert.equal(existsSync(path.join(scratch.root, 'src', 'spec_dependent.rs')), false);
  } finally {
    scratch.dispose();
  }
});

// C005 invariant — writes stay inside the target root
test('scrubber writes only under the target root', () => {
  const scratch = createScratchProject();
  try {
    const result = scrubForwardTraces(scratch.root, { apply: true });
    assert.ok(result.writes.length > 0);
    for (const written of result.writes) {
      assert.ok(written.startsWith(scratch.root), written);
    }
  } finally {
    scratch.dispose();
  }
});
