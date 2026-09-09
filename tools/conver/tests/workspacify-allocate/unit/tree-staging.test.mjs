// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import {
  checkExistingOutputPolicy,
  createStagingRoot,
  materializeDirectories,
  verifyStaging,
  publishStagedTree,
  verifyDirectorySet,
  STAGING_PREFIX,
} from '../../../.claude/scripts/workspacify-allocate/lib/tree-staging.mjs';

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), label));
}

const PLAN = ['crates/protocol/alpha'];

test('C005 checkExistingOutputPolicy passes on a fresh workspace', () => {
  const dir = tempDir('wt-189-pol-');
  try {
    const policy = checkExistingOutputPolicy(dir, PLAN);
    assert.equal(policy.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 checkExistingOutputPolicy BLOCKs when a planned path is a file, symlink, or non-empty dir', () => {
  const dir = tempDir('wt-189-pol2-');
  const outside = tempDir('wt-189-out-');
  try {
    // file at leaf
    mkdirSync(join(dir, 'crates', 'protocol'), { recursive: true });
    writeFileSync(join(dir, 'crates', 'protocol', 'alpha'), 'blocker');
    assert.equal(checkExistingOutputPolicy(dir, PLAN).ok, false);

    // non-empty directory at leaf (replace the file first)
    rmSync(join(dir, 'crates', 'protocol', 'alpha'), { force: true });
    mkdirSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    writeFileSync(join(dir, 'crates', 'protocol', 'alpha', 'file.txt'), 'x');
    assert.equal(checkExistingOutputPolicy(dir, PLAN).ok, false);

    // symlink at leaf (replace the directory first)
    rmSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true, force: true });
    symlinkSync(outside, join(dir, 'crates', 'protocol', 'alpha'), 'dir');
    assert.equal(checkExistingOutputPolicy(dir, PLAN).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('C005 empty pre-existing directory at the leaf is allowed', () => {
  const dir = tempDir('wt-189-pol3-');
  try {
    mkdirSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    const policy = checkExistingOutputPolicy(dir, PLAN);
    assert.equal(policy.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 an ancestor that is a file BLOCKs', () => {
  const dir = tempDir('wt-189-pol4-');
  try {
    writeFileSync(join(dir, 'crates'), 'file-blocker');
    assert.equal(checkExistingOutputPolicy(dir, PLAN).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 staging root lives inside the workspace with the reserved prefix', () => {
  const dir = tempDir('wt-189-stage-');
  try {
    const staging = createStagingRoot(dir);
    assert.ok(basename(staging.path).startsWith(STAGING_PREFIX));
    assert.ok(existsSync(staging.path));
    assert.ok(staging.path.startsWith(dir));
    rmSync(staging.path, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 materialize + verify + publish creates exactly the planned dirs and reload-verifies', () => {
  const dir = tempDir('wt-189-pub-');
  const staging = createStagingRoot(dir);
  try {
    materializeDirectories(staging.path, PLAN);
    const staged = verifyStaging(staging.path, PLAN);
    assert.ok(staged.ok, JSON.stringify({ missing: staged.missing, unexpected: staged.unexpected }));

    const result = publishStagedTree(staging.path, dir, PLAN);
    assert.ok(result.published, result.reason);
    assert.ok(existsSync(join(dir, 'crates', 'protocol', 'alpha')));
    assert.equal(existsSync(staging.path), false, 'staging root must be removed');

    const reload = verifyDirectorySet(dir, PLAN);
    assert.ok(reload.ok, JSON.stringify({ missing: reload.missing, unexpected: reload.unexpected }));
    assert.deepEqual(reload.unexpected, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 publish failure rolls back already-published top-level dirs', () => {
  const dir = tempDir('wt-189-rb-');
  const plan = ['aa/pkg', 'bb/pkg'];
  const staging = createStagingRoot(dir);
  try {
    // Pre-existing non-empty top-level dir "bb" blocks the second rename.
    mkdirSync(join(dir, 'bb'), { recursive: true });
    writeFileSync(join(dir, 'bb', 'existing.txt'), 'keep');

    materializeDirectories(staging.path, plan);
    const result = publishStagedTree(staging.path, dir, plan);
    assert.equal(result.published, false);
    // The already-renamed "aa" directory was rolled back.
    assert.equal(existsSync(join(dir, 'aa')), false);
    // Pre-existing content is untouched.
    assert.equal(readdirSync(join(dir, 'bb')).length, 1);
    // Staging is cleaned up.
    assert.equal(existsSync(staging.path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 verifyStaging reports missing directories and unexpected files', () => {
  const dir = tempDir('wt-189-ver-');
  const staging = createStagingRoot(dir);
  try {
    materializeDirectories(staging.path, ['crates']);
    writeFileSync(join(staging.path, 'crates', 'unexpected.txt'), 'x');
    const staged = verifyStaging(staging.path, PLAN);
    assert.equal(staged.ok, false);
    assert.ok(staged.unexpected.some((entry) => entry.includes('unexpected.txt')));
    assert.ok(staged.missing.includes('crates/protocol/alpha'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C005 empty plan publishes nothing but still verifies', () => {
  const dir = tempDir('wt-189-empty-');
  const staging = createStagingRoot(dir);
  try {
    materializeDirectories(staging.path, []);
    assert.ok(verifyStaging(staging.path, []).ok);
    const result = publishStagedTree(staging.path, dir, []);
    assert.ok(result.published);
    assert.ok(verifyDirectorySet(dir, []).ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
