// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { classifyUnsafePath, isPathContained, resolvePackagePath, checkPlannedPathSafety } from '../../../.claude/scripts/workspacify-allocate/lib/path-safety.mjs';

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

const NUL_PATH = 'a' + String.fromCharCode(0) + 'b';

test('C003 classifyUnsafePath accepts safe relative POSIX paths', () => {
  assert.deepEqual(classifyUnsafePath('crates/protocol/alpha'), []);
  assert.deepEqual(classifyUnsafePath('alpha'), []);
  assert.deepEqual(classifyUnsafePath('a/b/c/d'), []);
});

test('C003 classifyUnsafePath rejects each unsafe pattern with a reason', () => {
  assert.ok(classifyUnsafePath('').length > 0, 'empty');
  assert.ok(classifyUnsafePath('/abs/path').length > 0, 'absolute');
  assert.ok(classifyUnsafePath('../escape').length > 0, 'parent');
  assert.ok(classifyUnsafePath('a/../b').length > 0, 'embedded parent');
  assert.ok(classifyUnsafePath(NUL_PATH).length > 0, 'NUL byte');
  assert.ok(classifyUnsafePath('a\\b').length > 0, 'backslash separator');
});

test('C003 isPathContained uses path.relative containment', () => {
  const root = '/work/ws';
  assert.equal(isPathContained(root, resolve(root, 'crates/protocol/alpha')), true);
  assert.equal(isPathContained(root, resolve(root, 'crates')), true);
  assert.equal(isPathContained(root, resolve(root)), true); // root itself is contained
  assert.equal(isPathContained(root, '/work/other'), false);
  assert.equal(isPathContained(root, '/work'), false); // parent of root
});

test('C003 resolvePackagePath returns a descendant of root', () => {
  const root = '/work/ws';
  assert.equal(resolvePackagePath(root, 'crates/protocol/alpha'), resolve(root, 'crates/protocol/alpha'));
  assert.throws(() => resolvePackagePath(root, '../escape'), (e) => e.gateId !== undefined);
  assert.throws(() => resolvePackagePath(root, '/etc/passwd'), (e) => e.gateId !== undefined);
});

test('C003 checkPlannedPathSafety flags a symlink ancestor as unsafe', () => {
  const dir = tempDir('wt-189-path-');
  const outside = tempDir('wt-189-out-');
  try {
    // An ancestor "crates" is a symlink pointing outside the root.
    symlinkSync(outside, join(dir, 'crates'), 'dir');
    const report = checkPlannedPathSafety({ root: dir, relativeDirs: ['crates/protocol/alpha'] });
    assert.equal(report.ok, false);
    assert.equal(report.unsafe.length, 1);
    assert.ok(report.unsafe[0].reason.toLowerCase().includes('symlink'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('C003 checkPlannedPathSafety accepts missing directories (no symlink ancestors)', () => {
  const dir = tempDir('wt-189-path2-');
  try {
    const report = checkPlannedPathSafety({ root: dir, relativeDirs: ['crates/protocol/alpha', 'crates/protocol'] });
    assert.equal(report.ok, true);
    assert.deepEqual(report.unsafe, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003 checkPlannedPathSafety flags a leaf that is itself a symlink', () => {
  const dir = tempDir('wt-189-path3-');
  const outside = tempDir('wt-189-out3-');
  try {
    mkdirSync(join(dir, 'crates'), { recursive: true });
    symlinkSync(outside, join(dir, 'crates', 'alpha'), 'dir');
    const report = checkPlannedPathSafety({ root: dir, relativeDirs: ['crates/alpha'] });
    assert.equal(report.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
