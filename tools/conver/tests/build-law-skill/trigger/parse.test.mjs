/**
 * `/build-law-skill` accepts a source list and an optional free-form block.
 *
 * The first blank line is the mechanical boundary: everything before it is the
 * positional source grammar, everything after it is the instruction candidate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { splitInvocationArgument } from '../../../.claude/scripts/amend-rfc-up/law-integration/applicability.mjs';

test('the source list and the free-form block split at the first blank line', () => {
  const result = splitInvocationArgument(
    'rust-law=docs/law.md\n\nApply only when changed/target path matches `crates/**`.',
  );
  assert.equal(result.sources, 'rust-law=docs/law.md');
  assert.equal(result.instruction, 'Apply only when changed/target path matches `crates/**`.');
});

test('an invocation without a blank line carries no instruction', () => {
  const result = splitInvocationArgument('rust-law=docs/law.md other-law=docs/other.md');
  assert.equal(result.sources, 'rust-law=docs/law.md other-law=docs/other.md');
  assert.equal(result.instruction, '');
});

test('a blank tail is treated as no instruction', () => {
  const result = splitInvocationArgument('rust-law=docs/law.md\n\n   \n');
  assert.equal(result.instruction, '');
});

test('CRLF normalizes before splitting', () => {
  const result = splitInvocationArgument('rust-law=docs/law.md\r\n\r\nUse only for REST.');
  assert.equal(result.sources, 'rust-law=docs/law.md');
  assert.equal(result.instruction, 'Use only for REST.');
});
