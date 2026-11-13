// @verifies C008
// @verifies C010
/**
 * PX-424 — mutation tests for the command audit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditOkfCommand } from './lib/command-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const COMMAND = readFileSync(join(repositoryRoot, '.claude/commands/build-okf-skill.md'), 'utf8');

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function mutated(from, to) {
  const output = COMMAND.replace(from, to);
  assert.notEqual(output, COMMAND, `mutation did not apply: ${from}`);
  return output;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function codes(text) {
  return new Set(auditOkfCommand(text).map((finding) => finding.code));
}

test('C010: a missing required section is rejected', () => {
  assert.ok(codes(mutated('## Arguments', '## Argument Notes')).has('MISSING_SECTION'));
});

test('C010: a missing required script is rejected', () => {
  assert.ok(codes(COMMAND.replaceAll('verify-okf-skill.mjs', 'verify-other.mjs')).has('MISSING_SCRIPT'));
});

test('C008: an integration section is rejected', () => {
  assert.ok(codes(mutated('## Completion', '## Integration Contract\n\n## Completion')).has('INTEGRATION_PRESENT'));
});

test('C010: a reference to the law command is rejected', () => {
  assert.ok(codes(mutated('## Procedure', '## Procedure\n\nRead build-law-skill.md.')).has('INTEGRATION_PRESENT'));
});

test('C010: an external URL is rejected', () => {
  assert.ok(codes(mutated('## Procedure', '## Procedure\n\nSee https://example.com.')).has('EXTERNAL_REFERENCE'));
});

test('C010: a ticket id and an absolute path are rejected', () => {
  assert.ok(codes(mutated('## Procedure', '## Procedure\n\nPX-424')).has('TICKET_ID'));
  assert.ok(codes(mutated('## Procedure', '## Procedure\n\n/Users/example/tree')).has('ABSOLUTE_PATH'));
});
