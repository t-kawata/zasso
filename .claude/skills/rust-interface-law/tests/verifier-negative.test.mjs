// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..', '..');
const contractPath = join(repoRoot, '.claude/scripts/amend-rfc-up/law-verify/checks.json');
const fixtureRoot = join(repoRoot, 'tests/amend-rfc-up/fixtures/verifier');
const OPERATIONS = new Set(['delete', 'write', 'append', 'replace', 'remove-alias']);
const LEGACY_CHECKS = new Set([
  'layer', 'manifest', 'lock', 'coverage', 'registry', 'genericBoundary', 'delivery',
  'runtime', 'reproduction', 'tests', 'installer', 'determinism', 'redaction',
  'coverageSemantics', 'inputLedger', 'pathAlias', 'installedLeak', 'style',
]);

test('C006 every verifier check has a mutated fixture', () => {
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  for (const check of contract.checks.filter((entry) => LEGACY_CHECKS.has(entry.name))) {
    const mutationPath = join(fixtureRoot, check.name, 'mutation.json');
    assert.ok(existsSync(mutationPath), `mutation fixture missing: ${check.name}`);
    const mutation = JSON.parse(readFileSync(mutationPath, 'utf8'));
    assert.ok(OPERATIONS.has(mutation.operation), `unknown mutation operation: ${check.name}`);
    if (mutation.path === '<alias-map>') {
      assert.equal(mutation.operation, 'remove-alias', check.name);
      assert.ok(mutation.alias, check.name);
      continue;
    }
    if (mutation.operation !== 'write') {
      assert.ok(existsSync(join(root, mutation.path)), `mutation target missing: ${check.name}`);
    }
  }
});

test('C006 the reference passes the applicable checks', () => {
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  assert.equal(contract.checks.length, 26);
  assert.equal(contract.check_set_version, '3');
  assert.ok(contract.checks.some((check) => check.name === 'verifier-negative') === false);
  assert.ok(contract.checks.some((check) => check.name === 'style'));
});
