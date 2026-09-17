// @verifies C001
// @verifies C002
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
/**
 * Staleness propagation, end to end.
 *
 * The five tests that exercised the comparison against real bytes of
 * `siprs-for-reverse` retired with the tree: they read the artefact's hash as it
 * stood and applied the change to a copy outside it, and there is no artefact to
 * read. What is left is the command's own surface — a usage error and an
 * unreadable input reported in words rather than as a stack trace — and the two
 * baseline checks the reverse rotation owes the forward one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REEXAMINATION_FILE_NAME,
  STALENESS_INDEX_FILE_NAME,
  emitReexaminationConditions,
  propagateStaleness,
} from '../../../.claude/scripts/workspacify-reverse/lib/staleness.mjs';
import {
  compareDigests,
  digestCommandFiles,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_SCRIPT_DIR = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse');
const BASELINE_PATH = join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json');
const STALENESS_SCRIPT = join(REVERSE_SCRIPT_DIR, 'lib/staleness.mjs');


test('a usage error is reported in words rather than as a stack trace', () => {
  const run = spawnSync(
    process.execPath,
    [STALENESS_SCRIPT, '--claim-ledger=/tmp', '--changed=graph=/tmp/x', '--bogus'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.equal(run.status, 2, 'a usage error is not a crash');
  assert.match(run.stderr, /--bogus/);
  assert.doesNotMatch(run.stderr, /^\s+at .*\(/m, 'no stack frames should reach the operator');
});

test('a changed input with no artefact is reported in words too', () => {
  const run = spawnSync(
    process.execPath,
    [STALENESS_SCRIPT, '--claim-ledger=/tmp', '--changed=graph'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.equal(run.status, 2);
  assert.match(run.stderr, /graph/);
  assert.doesNotMatch(run.stderr, /^\s+at .*\(/m);
});

test('IT-3 — the command digest matches the frozen baseline', () => {
  const frozen = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  const findings = compareDigests(frozen.commandFileDigests, digestCommandFiles(PROJECT_ROOT));

  assert.deepEqual(findings, []);
  assert.ok(Object.keys(frozen.commandFileDigests).includes('drill-rfc-down'));
});

test('IT-4 — the forward regression gate exits 0', () => {
  // The gate measures the project the operator stands in, so the cwd is the root.
  const gate = spawnSync(process.execPath, [join(REVERSE_SCRIPT_DIR, 'run.mjs'), 'regression', 'check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(gate.status, 0, `${gate.stdout}${gate.stderr}`);
  assert.match(gate.stdout, /proved/);
});
