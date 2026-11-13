// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// @verifies C008
// @verifies C010
/**
 * PX-424 — static contract for `/build-okf-skill`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ArgumentError,
  CHECK_NAMES,
  CHECK_SET_VERSION,
  COMMAND_SECTIONS,
  auditOkfCommand,
  parseOkfInvocation,
} from './lib/command-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const commandPath = join(repositoryRoot, '.claude/commands/build-okf-skill.md');

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function readCommand() {
  return readFileSync(commandPath, 'utf8');
}

test('C010: positional grammar accepts both forms and rejects flags', () => {
  const single = parseOkfInvocation(['example-okf', 'docs/a.md']);
  assert.deepEqual(single, [{ name: 'example-okf', sources: ['docs/a.md'] }]);
  const paired = parseOkfInvocation(['a-okf=docs/a.md', 'b-okf=docs/b.md', 'a-okf=docs/c.md']);
  assert.deepEqual(paired.map((unit) => unit.sources.length), [2, 1]);
  assert.throws(() => parseOkfInvocation(['example-okf', '--write']), (error) => error instanceof ArgumentError && error.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseOkfInvocation(['a-okf=docs/a.md', 'b-okf', 'docs/b.md']), (error) => error.code === 'MIXED_ARGUMENT_FORMS');
  assert.throws(() => parseOkfInvocation([]), (error) => error.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseOkfInvocation(['example-law', 'docs/a.md']), (error) => error.code === 'INVALID_ARGUMENT');
});

test('C008/C010: the command carries the required sections and no integration step', () => {
  const text = readCommand();
  assert.deepEqual(auditOkfCommand(text), []);
  for (const section of COMMAND_SECTIONS) assert.ok(text.includes(section), section);
  assert.equal(text.includes('## Integration Contract'), false);
  assert.equal(text.includes('Step 12.5'), false);
  assert.equal(text.includes('verify-law-integration.mjs'), false);
});

test('C008: the check contract is okf v2 with named checks', () => {
  assert.equal(CHECK_SET_VERSION, '2');
  assert.equal(CHECK_NAMES.length, 30);
  assert.deepEqual(new Set(CHECK_NAMES).size, CHECK_NAMES.length);
});
