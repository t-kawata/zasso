'use strict';

/**
 * Unit tests for the scoped git scan.
 *
 * Covers C002 (empty diff early exit), C003 (missing upstream fails closed),
 * tracked modifications, untracked additions, deletions, and scope isolation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initRepoWithoutUpstream, initRepoWithUpstream } = require('./fixtures.cjs');

const scan = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'scan.js'
));

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function claudeDirOf(workspace) {
  return path.join(workspace, '.claude');
}

test('C002 an empty diff with no untracked file returns skipped:no-changes', () => {
  const { workspace } = initRepoWithUpstream();
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.deepEqual(result, { ok: true, status: 'skipped:no-changes' });
  assert.equal(fs.existsSync(path.join(workspace, 'CONVER-UPDATE-CANDIDATES.json')), false);
  assert.equal(fs.existsSync(path.join(workspace, 'CONVER-UPDATE-CANDIDATES.md')), false);
});

test('C003 a missing upstream branch fails closed and writes nothing', () => {
  const workspace = initRepoWithoutUpstream();
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERROR:upstream-not-configured');
  assert.equal(fs.existsSync(path.join(workspace, 'CONVER-UPDATE-CANDIDATES.json')), false);
});

test('a modified file under .claude is returned with its hunk header and diff', () => {
  const { workspace } = initRepoWithUpstream();
  fs.writeFileSync(path.join(workspace, '.claude', 'scripts', 'sample.js'), 'module.exports = 2;\n');
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'changes');
  const entry = result.files.find((file) => file.file === '.claude/scripts/sample.js');
  assert.ok(entry);
  assert.equal(entry.changeType, 'modified');
  assert.ok(entry.hunkHeader.startsWith('@@'));
  assert.equal(entry.lineStart, 1);
  assert.ok(entry.diff.includes('+module.exports = 2;'));
});

test('an untracked file under .claude is returned as an added change', () => {
  const { workspace } = initRepoWithUpstream();
  fs.writeFileSync(path.join(workspace, '.claude', 'scripts', 'new.js'), 'module.exports = 1;\n');
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.equal(result.ok, true);
  const entry = result.files.find((file) => file.file === '.claude/scripts/new.js');
  assert.ok(entry);
  assert.equal(entry.changeType, 'added');
  assert.ok(entry.diff.includes('+module.exports = 1;'));
});

test('a deletion under .claude is returned as a deleted change', () => {
  const { workspace } = initRepoWithUpstream();
  fs.unlinkSync(path.join(workspace, '.claude', 'scripts', 'sample.js'));
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.equal(result.ok, true);
  const entry = result.files.find((file) => file.file === '.claude/scripts/sample.js');
  assert.ok(entry);
  assert.equal(entry.changeType, 'deleted');
});

test('a change outside .claude is never listed', () => {
  const { workspace } = initRepoWithUpstream();
  fs.writeFileSync(path.join(workspace, 'README.md'), '# changed outside\n');
  const result = scan.scanClaudeDir({ workspace, claudeDir: claudeDirOf(workspace) });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped:no-changes');
});
