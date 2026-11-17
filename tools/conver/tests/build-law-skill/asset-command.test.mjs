// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const command = readFileSync(join(here, '../../.claude/commands/build-law-skill.md'), 'utf8');

test('the law command teaches asset discovery and zero-asset handling', () => {
  assert.match(command, /^## Execution Assets$/m);
  assert.match(command, /No execution assets/);
  assert.match(command, /rule link/i);
  assert.match(command, /delivery/i);
});

test('the law command names the asset helper and ledgers', () => {
  assert.match(command, /law-asset\/index\.mjs/);
  assert.match(command, /source\/asset-manifest\.toml/);
  assert.match(command, /source\/asset-inventory\.json/);
  assert.match(command, /source\/asset-coverage\.json/);
});

test('the law command names the asset failure codes', () => {
  for (const code of [
    'ASSET_RULE_UNLINKED',
    'ASSET_DELIVERY_OMISSION',
    'ASSET_COVERAGE_GAP',
    'ASSET_INSTALL_MISSING',
    'ASSET_HASH_MISMATCH',
  ]) {
    assert.ok(command.includes(code), code);
  }
});

test('the law command does not hardcode EXEC_ASSETS', () => {
  assert.equal(command.includes('EXEC_ASSETS'), false);
});
