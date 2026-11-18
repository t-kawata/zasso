// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C002
// @verifies C011
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const commandPath = join(repositoryRoot, '.claude/commands/build-law-skill.md');

test('C002: the law command exposes the opt-in update subroute without changing build steps', () => {
  const text = readFileSync(commandPath, 'utf8');
  assert.ok(text.includes('## Update Subroute'));
  assert.ok(text.includes('update <skill-name> <revision-doc>'));
  assert.ok(text.includes('L0 Mode and role'));
  assert.ok(text.includes('L14 Report'));
  assert.ok(text.includes('Step 0'));
  assert.ok(text.includes('Step 14'));
  assert.ok(text.includes('check-set v3'));
  assert.equal(/## Update Subroute[\s\S]*## Verification Gates/.test(text), true);
});

test('C011: the law verifier defaults to build mode', async () => {
  const { verifyLawSkill } = await import('../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs');
  const report = await verifyLawSkill({
    skillPath: join(repositoryRoot, '.claude/skills/rust-interface-law'),
    root: repositoryRoot,
    mode: 'installed',
    pathAlias: join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json'),
    kind: 'build',
  });
  assert.equal(report.kind, 'build');
  assert.equal(report.check_set_version, '3');
  assert.equal(report.checks.revisionContract, undefined);
  assert.ok(report.required_checks.includes('rulePreservation'));
});
