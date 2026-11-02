// [::TICKET::] PX-345 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-345 --for-spec --no-implementation-order`.
/**
 * The argument-free contract of `/explain-seed`.
 *
 * The command used to take one seed path from the operator. The seed is placed exactly
 * once per package directory, so the operator argument was a second spelling of a fact
 * the current directory already carries. These tests pin the new contract: the command
 * resolves `RFC-SEED.md` from the current directory, never walks up, and passes that one
 * path to every operation. The three installed copies must stay one text because a run
 * from one install must ask the same way as a run from another.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryRootFrom } from '../../lib/repo-hygiene.mjs';
import { materializeExplainSeedWorkspace } from '../helpers/explain-seed-workspace.mjs';
import { parseArguments } from '../../../.claude/scripts/explain-seed/run.mjs';
import { groundHandoff } from '../../../.claude/scripts/regeneration/lib/transaction.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REPOSITORY_ROOT = repositoryRootFrom(PROJECT_ROOT);
const INSTALLS = [PROJECT_ROOT, join(REPOSITORY_ROOT, 'crates/siprs'), REPOSITORY_ROOT];
const COMMAND_FILES = INSTALLS.map((root) => join(root, '.claude/commands/explain-seed.md'));
const TRANSACTION_FILES = INSTALLS.map((root) =>
  join(root, '.claude/scripts/regeneration/lib/transaction.mjs'));
const README = join(PROJECT_ROOT, 'README.md');
const RUN = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/run.mjs', import.meta.url));

/** Run one operation of the seed command, keeping both sinks as bytes. */
// [::TICKET::] PX-345 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-345 --for-spec --no-implementation-order`.
function runExplainSeed(argv, { cwd } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], { cwd, encoding: 'buffer' });
}

/** The text of one question-gate block, so agreement is compared rather than assumed. */
// [::TICKET::] PX-345 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-345 --for-spec --no-implementation-order`.
function questionGateBlock(text) {
  const start = text.indexOf('<!-- question-gate:begin -->');
  const end = text.indexOf('<!-- question-gate:end -->');
  return text.slice(start, end);
}

test('C001/C002 the command installs declare no argument and pass one seed path', () => {
  for (const file of COMMAND_FILES) {
    const text = readFileSync(file, 'utf8');

    assert.match(text, /^argument-hint: ""$/m, `${file} declares an empty argument hint`);
    assert.doesNotMatch(text, /\$ARGUMENTS/, `${file} carries no shell argument placeholder`);

    const callSites = text
      .split('\n')
      .filter((line) => line.includes('run.mjs') && line.includes('"$SEED_PATH"'));
    assert.equal(callSites.length, 9, `${file} passes the resolved seed at nine call sites`);
  }
});

test('C001 the command resolves the current directory seed and never walks up', () => {
  const command = readFileSync(COMMAND_FILES[0], 'utf8');

  assert.match(command, /RFC-SEED\.md`? in the current directory/);
  assert.match(command, /printf '%s\/RFC-SEED\.md\\n' "\$\(pwd\)"/);
  assert.match(command, /never search(?:es)? a parent directory/i);
  assert.match(command, /-f "\$SEED_PATH"/);
});

test('C003 G0 stops before any write on a missing seed', () => {
  const command = readFileSync(COMMAND_FILES[0], 'utf8');

  assert.match(command, /^G0 seed\s*:.*RFC-SEED\.md.*fail: stop/m);
});

test('C002 the three command installs are one text', () => {
  const texts = COMMAND_FILES.map((file) => readFileSync(file, 'utf8'));

  assert.equal(new Set(texts).size, 1);
});

test('C002 the three transaction installs are one text', () => {
  const texts = TRANSACTION_FILES.map((file) => readFileSync(file, 'utf8'));

  assert.equal(new Set(texts).size, 1);
});

test('C004 run.mjs still owns the missing seed refusal, not current-directory resolution', () => {
  assert.throws(
    () => parseArguments(['info']),
    (error) => error.field === 'arguments',
    'a missing seed path is still an arguments error inside the script',
  );
  assert.equal(parseArguments(['info', 'RFC-SEED.md']).seedPath, resolve('RFC-SEED.md'));
});

test('C005 the shared question-gate block is unchanged across the three command files', () => {
  const explain = readFileSync(join(PROJECT_ROOT, '.claude/commands/explain-seed.md'), 'utf8');
  const grill = readFileSync(join(PROJECT_ROOT, '.claude/commands/grill-me-for-rfc.md'), 'utf8');
  const drill = readFileSync(join(PROJECT_ROOT, '.claude/commands/drill-rfc-down.md'), 'utf8');

  assert.equal(questionGateBlock(explain), questionGateBlock(grill));
  assert.equal(questionGateBlock(explain), questionGateBlock(drill));
});

test('the README section names no path', () => {
  const readme = readFileSync(README, 'utf8');

  assert.doesNotMatch(readme, /\/explain-seed <path-to-RFC-SEED\.md>/);
  assert.match(readme, /^#### `\/explain-seed`$/m);
});

test('the regeneration handoff names the seed directory', () => {
  for (const file of TRANSACTION_FILES) {
    const text = readFileSync(file, 'utf8');

    assert.match(text, /from the directory holding the RFC seed/);
    assert.doesNotMatch(text, /takes one RFC-SEED\.md path/);
  }

  const handoff = groundHandoff({
    stagingRoot: '/tmp/staging',
    reason: 'RFC-SEED.md line 12 has no evidence',
  });
  assert.match(handoff, /from the directory holding the RFC seed/);
});

test('C001 the documented anchor resolves the package-directory seed and info succeeds', () => {
  const command = readFileSync(COMMAND_FILES[0], 'utf8');
  assert.match(command, /printf '%s\/RFC-SEED\.md\\n' "\$\(pwd\)"/, 'the anchor is documented');

  const workspace = materializeExplainSeedWorkspace();
  const packageDir = dirname(workspace.seedPath);
  const anchor = spawnSync(
    'sh',
    ['-c', `cd '${packageDir}' && printf '%s/RFC-SEED.md\\n' "$(pwd)"`],
    { encoding: 'utf8' },
  );
  assert.equal(anchor.stdout.trim(), join(packageDir, 'RFC-SEED.md'));

  const run = runExplainSeed(['info', 'RFC-SEED.md'], { cwd: packageDir });
  assert.equal(run.status, 0, run.stderr.toString('utf8'));
  assert.ok(existsSync(join(packageDir, 'INFO-RFC-SEED.md')));
  assert.ok(existsSync(join(packageDir, 'EXPLAIN-RFC-SEED.md')));
});

test('C003 a subdirectory without a seed refuses and writes nothing', () => {
  const command = readFileSync(COMMAND_FILES[0], 'utf8');
  assert.match(command, /never search(?:es)? a parent directory/i);

  const workspace = materializeExplainSeedWorkspace();
  const packageDir = dirname(workspace.seedPath);
  const subdirectory = join(packageDir, 'nested');
  mkdirSync(subdirectory);

  const run = runExplainSeed(['info', 'RFC-SEED.md'], { cwd: subdirectory });
  assert.notEqual(run.status, 0);
  assert.equal(existsSync(join(subdirectory, 'INFO-RFC-SEED.md')), false);
});
