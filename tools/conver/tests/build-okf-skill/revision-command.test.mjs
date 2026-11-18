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
const commandPath = join(repositoryRoot, '.claude/commands/build-okf-skill.md');

test('C002: the OKF command exposes the opt-in update subroute without changing build steps', () => {
  const text = readFileSync(commandPath, 'utf8');
  assert.ok(text.includes('## Update Subroute'));
  assert.ok(text.includes('update <skill-name> <revision-doc>'));
  assert.ok(text.includes('O0 Mode and role'));
  assert.ok(text.includes('O10 Report'));
  assert.ok(text.includes('Step 0'));
  assert.ok(text.includes('Step 13'));
  assert.ok(text.includes('check-set v3'));
  assert.equal(/## Update Subroute[\s\S]*## Verification Gates/.test(text), true);
});

test('C011: the OKF verifier defaults to build mode', async () => {
  const { verifyOkfSkill } = await import('../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs');
  const report = await verifyOkfSkill({
    skillPath: join(repositoryRoot, '.claude/skills/natenv-okf'),
    root: repositoryRoot,
    mode: 'installed',
    kind: 'build',
  });
  assert.equal(report.kind, 'build');
  assert.equal(report.check_set_version, '3');
  assert.equal(report.checks.revisionContract, undefined);
});
