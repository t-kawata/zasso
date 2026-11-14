/**
 * /build-okf-skill must point at the bundled natenv-okf skill as the ideal
 * exemplar and must always place the pre-OKF original beside it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditOkfCommand } from './lib/command-contract.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const command = readFileSync(join(here, '../../.claude/commands/build-okf-skill.md'), 'utf8');

test('the command names natenv-okf as the reference exemplar', () => {
  assert.match(command, /^## Reference Exemplars$/m);
  assert.match(command, /\.claude\/skills\/natenv-okf/);
  assert.match(command, /exemplar/i);
});

test('the exemplar reference does not break the command audit', () => {
  assert.deepEqual(auditOkfCommand(command), []);
});

test('the pre-OKF original is a layout, placement, and verification obligation', () => {
  assert.match(command, /PRE-OKF-ORIGINAL\.md/);
  assert.match(command, /source\/pre-okf-original\.json/);
  assert.match(command, /PRE_OKF_ORIGINAL_MISSING/);
  assert.match(command, /PRE_OKF_ORIGINAL_DRIFT/);
  const layout = command.slice(command.indexOf('## Generated Skill Layout'));
  assert.match(layout.slice(0, 2500), /PRE-OKF-ORIGINAL\.md/);
});
