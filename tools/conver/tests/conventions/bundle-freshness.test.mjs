// @verifies C004
/**
 * bundle-freshness — the committed `conver.js` is provably the one its source
 * produces.
 *
 * Measured 2026-09-11, `npm run build` reproduces the committed artefact
 * byte-for-byte (427,025 bytes), so there is nothing stale to repair. What is
 * missing is the guard: nothing compares the two, so the first person to edit
 * `src/` without running `make build-conver` ships a stale bundle silently.
 *
 * The esbuild invocation is read from the `build` script in package.json rather
 * than re-spelled here. A second spelling is a second thing to drift, and the
 * check would then be measuring something other than the build it claims to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUNDLE_ENTRY,
  COMMITTED_BUNDLE_PATH,
  readBundleComparison,
  resolveEsbuildVersion,
} from '../lib/bundle-freshness.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function digestTree(root) {
  const digest = createHash('sha256');
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else digest.update(readFileSync(full));
    }
  };
  walk(root);
  return digest.digest('hex');
}

test('C004 the entry point, the artefact and the build script all exist', () => {
  assert.equal(existsSync(join(PROJECT_ROOT, BUNDLE_ENTRY)), true, BUNDLE_ENTRY + ' must exist');
  assert.equal(existsSync(join(PROJECT_ROOT, COMMITTED_BUNDLE_PATH)), true, COMMITTED_BUNDLE_PATH + ' must exist');

  const scripts = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(typeof scripts.build, 'string', 'the check runs the declared build rather than its own spelling');
  assert.match(scripts.build, /esbuild/, 'and that build must be the one that produces the bundle');
});

test('C004 esbuild is resolvable, and its absence is reported rather than assumed', () => {
  // Resolved from the tree being measured, not from the process's working
  // directory: a check that answered about wherever it happened to be run from
  // would report the bundler missing while standing next to it.
  const version = resolveEsbuildVersion(PROJECT_ROOT);
  assert.match(version, /^\d+\.\d+\.\d+/, 'the bundler version is recorded because it decides the output bytes');
  assert.equal(resolveEsbuildVersion(join(PROJECT_ROOT, 'tests')), null, 'a tree without the bundler reports it absent');
});

test('C004 the committed bundle is byte-identical to a fresh build', () => {
  const comparison = readBundleComparison({ projectRoot: PROJECT_ROOT });

  assert.equal(comparison.unavailable, undefined, 'the comparison must have been possible');
  assert.equal(comparison.identical, true, 'HEAD must be fresh; if this fails, run make build-conver deliberately');
  assert.match(comparison.committedDigest, /^[0-9a-f]{64}$/);
  assert.equal(comparison.committedDigest, comparison.builtDigest);
  assert.equal(comparison.byteSizeDelta, 0);
});

test('C004 a one-byte difference is reported with both digests and the size delta', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'px205-bundle-'));
  const tampered = join(scratch, 'conver.js');
  try {
    copyFileSync(join(PROJECT_ROOT, COMMITTED_BUNDLE_PATH), tampered);
    writeFileSync(tampered, '\n', { flag: 'a' });

    const comparison = readBundleComparison({ projectRoot: PROJECT_ROOT, committedPath: tampered });
    assert.equal(comparison.identical, false);
    assert.notEqual(comparison.committedDigest, comparison.builtDigest);
    assert.equal(comparison.byteSizeDelta, 1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('C004 the check writes nothing into the tracked tree and leaves no temporary output', () => {
  const bundleDirectory = join(PROJECT_ROOT, dirname(COMMITTED_BUNDLE_PATH));
  const before = digestTree(bundleDirectory);

  // The entries this check owns, by name, before and after — not the size of the
  // shared temporary directory. Counting that directory's entries measures every
  // other test running beside this one, so under a suite that runs files in
  // parallel the assertion reports their scratch as this check's leak.
  const ownScratch = () => new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('px205-bundle-')));
  const before_ = ownScratch();

  readBundleComparison({ projectRoot: PROJECT_ROOT });

  assert.equal(digestTree(bundleDirectory), before, 'the committed artefact must not be rewritten by a check');
  assert.deepEqual([...ownScratch()], [...before_], 'this check must leave no temporary build output of its own');
});

test('C004 a missing entry point is reported by path rather than thrown raw', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'px205-noentry-'));
  try {
    assert.throws(
      () => readBundleComparison({ projectRoot: scratch }),
      /entry|not found|absent/i,
      'a tree without src/entry.ts must say so',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
