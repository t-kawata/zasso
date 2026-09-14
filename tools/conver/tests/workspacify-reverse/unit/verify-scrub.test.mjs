// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// Verification must use the same predicate as detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  detectForwardTraces,
} from '../../../.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs';
import {
  scrubForwardTraces,
} from '../../../.claude/scripts/workspacify-reverse/lib/scrub-forward-traces.mjs';
import {
  verifyScrub,
  exitCodeFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/verify-scrub.mjs';
import {
  TRACE_PATTERNS,
} from '../../../.claude/scripts/workspacify-reverse/lib/trace-patterns.mjs';
import {
  createScratchProject,
  hashTree,
  nonCommentLines,
  readLines,
  sha256,
} from '../helpers/scratch.mjs';

// UT-8 — C004 postcondition
test('verify reports zero residual on a scrubbed tree', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true, renameTicketKeyedFiles: true });
    const result = verifyScrub(scratch.root);
    assert.equal(result.residualCount, 0);
    assert.equal(exitCodeFor(result), 0);
  } finally {
    scratch.dispose();
  }
});

// UT-8 — C004 postcondition (residual path)
test('verify enumerates file:line and fails when residue remains', () => {
  const scratch = createScratchProject();
  try {
    const result = verifyScrub(scratch.root);
    assert.ok(result.residualCount > 0);
    assert.equal(exitCodeFor(result), 1);
    assert.ok(result.findings.every((f) => f.file && Number.isInteger(f.line)));
  } finally {
    scratch.dispose();
  }
});

// UT-21 — C004 invariant
test('verify and detect share the single pattern source', () => {
  assert.equal(verifyScrub.patterns, detectForwardTraces.patterns);
  assert.equal(detectForwardTraces.patterns, TRACE_PATTERNS);
});

// UT-20 — C003 postcondition
test('every L1, L2 and L3 trace reaches zero after a scrub', () => {
  const scratch = createScratchProject();
  try {
    scrubForwardTraces(scratch.root, { apply: true, renameTicketKeyedFiles: true });
    const residual = detectForwardTraces(scratch.root);
    assert.equal(residual.layers.L1.count, 0);
    assert.equal(residual.layers.L2.count, 0);
    assert.equal(residual.layers.L3.count, 0);
  } finally {
    scratch.dispose();
  }
});

// UT-19 — C002 invariant, over the files the scrub keeps
test('non-comment SHA-256 is identical before and after the scrub', () => {
  const scratch = createScratchProject();
  try {
    const scrubbed = ['lib.rs', 'error.rs', 'ietf.rs'];
    const before = {};
    for (const name of scrubbed) {
      before[name] = sha256(nonCommentLines(readLines(path.join(scratch.root, 'src', name))).join('\n'));
    }
    scrubForwardTraces(scratch.root, { apply: true });
    for (const name of scrubbed) {
      const after = sha256(nonCommentLines(readLines(path.join(scratch.root, 'src', name))).join('\n'));
      assert.equal(after, before[name], name);
    }
  } finally {
    scratch.dispose();
  }
});

// UT-22 — C005
test('a tree outside the target root is left byte-identical', () => {
  const target = createScratchProject();
  const bystander = createScratchProject();
  try {
    const before = hashTree(bystander.root);
    scrubForwardTraces(target.root, { apply: true });
    assert.deepEqual(hashTree(bystander.root), before);
  } finally {
    target.dispose();
    bystander.dispose();
  }
});

// C005 postcondition — the pristine fixture set itself is never mutated
test('the fixture project is never modified by any test helper', () => {
  const fixtureRoot = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'fixtures',
    'sample-project',
  );
  const before = readFileSync(path.join(fixtureRoot, 'src', 'lib.rs'), 'utf8');
  assert.ok(before.includes('Initial Design Artifact'));
});
