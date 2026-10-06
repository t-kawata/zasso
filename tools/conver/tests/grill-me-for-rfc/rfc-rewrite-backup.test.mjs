// PX-238 @verifies C003
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * The copy STEP 5 leaves behind.
 *
 * The grill writes the whole RFC from its settled tree, so the document is
 * regenerated rather than appended to. What the tree holds is the decisions; what
 * it does not hold is the prose and the code examples that carry them. A copy taken
 * before the write is what makes an unfaithful rewrite diffable instead of silent,
 * and it is the only artifact of this ticket that exists to be read by a human
 * afterwards. The timestamp spelling is the one generate-checklist.js already uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { GRILL_BACKUP_RFC, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

const RFC_BACKUP_PATTERN = /^RFC\..+\.bak\.md$/;
const PRE_REWRITE_RFC = '# RFC\n\n## Abstract\nThe settled design.\n\n```js\nconst a = 1;\n```\n';

/** A directory holding an RFC with content worth losing. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function makeRfcDir() {
  const dir = mkdtempSync(join(tmpdir(), 'px238-backup-'));
  const rfcPath = join(dir, 'RFC.md');
  writeFileSync(rfcPath, PRE_REWRITE_RFC, 'utf8');
  return { dir, rfcPath };
}

test('C003 postcondition: the pre-rewrite bytes survive in a timestamped sibling', () => {
  const { rfcPath } = makeRfcDir();

  const result = runCommand(GRILL_BACKUP_RFC, [rfcPath]);

  assert.equal(result.status, 0, result.stderr);
  const backupPath = result.stdout.trim();
  assert.match(basename(backupPath), RFC_BACKUP_PATTERN, 'the copy is named the way the checklist backup is');
  assert.equal(readFileSync(backupPath, 'utf8'), PRE_REWRITE_RFC, 'the copy holds the pre-rewrite bytes');
});

test('C003 invariant: taking the copy leaves the RFC itself untouched', () => {
  const { rfcPath } = makeRfcDir();

  const result = runCommand(GRILL_BACKUP_RFC, [rfcPath]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(rfcPath, 'utf8'), PRE_REWRITE_RFC, 'RFC.md is not the backup target');
  assert.notEqual(basename(result.stdout.trim()), 'RFC.md');
  assert.match(basename(result.stdout.trim()), RFC_BACKUP_PATTERN, 'the copy is a separate file');
});

test('C003 invariant: the copy is a second file, never a replacement', () => {
  const { dir } = makeRfcDir();

  runCommand(GRILL_BACKUP_RFC, [join(dir, 'RFC.md')]);

  assert.equal(readdirSync(dir).filter((name) => RFC_BACKUP_PATTERN.test(name)).length, 1);
  assert.equal(readdirSync(dir).includes('RFC.md'), true, 'the original is still there');
});

test('C003 precondition: an absent RFC is refused and nothing is created', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px238-backup-empty-'));

  const result = runCommand(GRILL_BACKUP_RFC, [join(dir, 'RFC.md')]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RFC\.md/, 'the path it looked for is named');
  assert.deepEqual(readdirSync(dir), [], 'a refused backup creates no file');
});

test('C003 invariant: the copy is named from the whole path, whatever the extension', () => {
  // An extensionless name is not one the command produces, but the name builder must
  // still be total: slicing off a zero-length extension would empty the path and put
  // the copy somewhere that names nothing.
  const dir = mkdtempSync(join(tmpdir(), 'px238-backup-noext-'));
  const rfcPath = join(dir, 'RFC');
  writeFileSync(rfcPath, PRE_REWRITE_RFC, 'utf8');

  const result = runCommand(GRILL_BACKUP_RFC, [rfcPath]);

  assert.equal(result.status, 0, result.stderr);
  const backupPath = result.stdout.trim();
  assert.equal(backupPath.startsWith(dir), true, 'the copy stays in the directory it copies from');
  assert.match(basename(backupPath), /^RFC\..+\.bak\.md$/);
  assert.equal(readFileSync(backupPath, 'utf8'), PRE_REWRITE_RFC);
});
