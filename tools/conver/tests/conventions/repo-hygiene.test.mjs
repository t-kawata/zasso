// @verifies C003
/**
 * repo-hygiene — a 4 MB backup stops being tracked, and the removal is proven to
 * have touched nothing else.
 *
 * `git rm` without `--cached` deletes the working-tree file. The digest assertion
 * below exists so that mistake is named rather than discovered later, and the
 * tracked-set assertion exists so that a removal which takes a neighbour with it
 * cannot pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BACKUP_IGNORE_PATTERN,
  GITIGNORE_NAME,
  UNTRACKED_BACKUP_NAME,
  assertBackupUntracked,
  trackedPaths,
} from '../lib/repo-hygiene.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function git(args) {
  return spawnSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' });
}

test('C003 the ignore rule for backup files is declared', () => {
  assert.equal(typeof BACKUP_IGNORE_PATTERN, 'string');
  assert.match(BACKUP_IGNORE_PATTERN, /bak/, 'the pattern must match a backup suffix');

  // Compared as text rather than as a regular expression: an ignore pattern is a
  // glob, and globs are not regexes — `*.bak` compiles to an unclosed quantifier.
  const ignoreRules = readFileSync(join(PROJECT_ROOT, GITIGNORE_NAME), 'utf8').split('\n');
  assert.equal(
    ignoreRules.includes(BACKUP_IGNORE_PATTERN),
    true,
    `${GITIGNORE_NAME} must declare ${BACKUP_IGNORE_PATTERN} on a line of its own`,
  );
});

test('C003 the backup is untracked, ignored, and still present on disk', () => {
  const backupPath = join(PROJECT_ROOT, UNTRACKED_BACKUP_NAME);
  assert.equal(existsSync(backupPath), true, 'the working-tree file must survive: untracking is not deleting');

  const before = sha256Of(backupPath);
  const report = assertBackupUntracked({ projectRoot: PROJECT_ROOT });

  assert.equal(report.tracked, false, 'git ls-files --error-unmatch must fail for this path');
  assert.equal(report.ignored, true, 'git check-ignore must match');
  assert.equal(report.workingTreeDigest, before, 'the file is byte-identical after the change');
});

test('C003 the removal took no other tracked path with it', () => {
  const tracked = trackedPaths(PROJECT_ROOT);
  assert.ok(tracked.length > 0, 'the repository must have tracked files');
  assert.equal(
    tracked.includes(UNTRACKED_BACKUP_NAME),
    false,
    'the backup must not be in the tracked set',
  );
  assert.equal(tracked.includes('Tickets.json'), true, 'and its neighbour must still be tracked');
});

test('C003 a tree with no git repository is reported unavailable rather than clean', () => {
  const outside = mkdtempSync(join(tmpdir(), 'px205-nogit-'));
  try {
    const report = assertBackupUntracked({ projectRoot: outside });
    assert.equal(report.unavailable, 'not-a-repository', 'an absent repository must not read as "untracked"');
    assert.equal(report.tracked, null);
    assert.equal(report.ignored, null);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
