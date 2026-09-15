// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
// @verifies C001
/**
 * derived-artefacts — the files a run produces stop being tracked, and the removal
 * is proven to have taken nothing with it.
 *
 * `tools/conver/tmp/` was placed under version control by the release-branch commit
 * 5c08ac3e (2026-09-14), carrying three `.txt` logs among its 37 paths. The
 * extension census reads `git ls-files`, so tracking them turned `make test` red
 * three days after the census was written. Three bytecode caches are tracked the
 * same way, and a test run rewrites them, so the working tree dirties itself.
 *
 * A fourth cache sits inside `siprs-with-4layers/` and stays tracked. That tree is
 * the answer key, three tests assert nothing writes into it, and a cache being
 * rewritten there is the signal they exist to give rather than dirt to hide. The
 * decision is data (`FROZEN_BYTECODE_CACHE_PATHS`) and is asserted below, so the
 * one cache that is left alone is not left alone by omission.
 *
 * The digest is not decoration, for the reason `repo-hygiene.mjs` records: `git rm`
 * without `--cached` deletes the working-tree file, and every other assertion here
 * would still pass — the path would be untracked and ignored either way. The digest
 * is what makes that mistake fail loudly instead of surfacing as a missing file
 * days later.
 *
 * The opposite asymmetry is recorded rather than glossed: the caches are rewritten
 * by the next test run, so no digest is frozen for them. Absence from the index and
 * presence on disk is the whole of what can be asserted about them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BYTECODE_CACHE_PATHS,
  DERIVED_ARTEFACT_PREFIXES,
  FROZEN_BYTECODE_CACHE_PATHS,
  FROZEN_DERIVED_ARTEFACT_DIGEST,
  decidingIgnoreRule,
  isGitRepository,
  measureDerivedArtefacts,
  repositoryRootFrom,
  trackedPaths,
} from '../lib/repo-hygiene.mjs';

const REPOSITORY_ROOT = repositoryRootFrom(dirname(fileURLToPath(import.meta.url)));

const measure = () => measureDerivedArtefacts({ repositoryRoot: REPOSITORY_ROOT });

// ---------------------------------------------------------------------------
// The declaration itself
// ---------------------------------------------------------------------------

test('C001 the derived artefacts are declared by name, and every name exists on disk', () => {
// [::TICKET::] P25-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-5 --for-spec --no-implementation-order`.
  assert.ok(REPOSITORY_ROOT, 'the tree under test belongs to a repository, or nothing here can be measured');
  assert.deepStrictEqual(DERIVED_ARTEFACT_PREFIXES, ['tools/conver/tmp/'], 'one directory of run output');
  assert.strictEqual(BYTECODE_CACHE_PATHS.length, 3, 'three trees outside the answer key carry a bytecode cache');
  for (const path of BYTECODE_CACHE_PATHS) {
    assert.ok(path.endsWith('.pyc'), path + ' is a bytecode cache');
    assert.ok(!path.startsWith('tools/conver/siprs-with-4layers/'), 'the answer key is handled separately, not by omission');
    assert.ok(existsSync(join(REPOSITORY_ROOT, path)), path + ' must be present before its index state means anything');
  }
  assert.ok(isGitRepository(REPOSITORY_ROOT), 'the repository root is a git repository');
});

test('C001 the bytecode cache inside the answer key stays tracked, and that decision is data', () => {
  // `siprs-with-4layers/` is the frozen forward-rotation tree. Three tests in
  // tests/workspacify-reverse/spike/reconcile-slice.test.mjs read
  // `git status --porcelain -- siprs-with-4layers/` to assert that nothing writes
  // into it, and untracking a path inside it makes the answer key read as modified.
  // The rewrite this cache receives is the signal those tests exist to give, so it
  // is part of what was frozen rather than debris to be hidden.
  assert.strictEqual(FROZEN_BYTECODE_CACHE_PATHS.length, 1);

  const tracked = trackedPaths(REPOSITORY_ROOT);
  for (const path of FROZEN_BYTECODE_CACHE_PATHS) {
    assert.ok(path.startsWith('tools/conver/siprs-with-4layers/'), path + ' is inside the answer key, which is why it is not in the list above');
    assert.ok(existsSync(join(REPOSITORY_ROOT, path)), path + ' is present on disk');
    assert.ok(tracked.includes(path), path + ' must stay tracked: removing it from the index is a change to the measuring instrument');
  }
});

// ---------------------------------------------------------------------------
// The removal
// ---------------------------------------------------------------------------

test('C001 no path under a derived-artefact prefix is tracked, and none was deleted', () => {
  const report = measure();

  assert.deepStrictEqual(report.trackedPrefixPaths, [], 'run output is not source');
  assert.deepStrictEqual(report.trackedCachePaths, [], 'a cache rewritten by the next test run cannot be tracked');
  assert.deepStrictEqual(report.missingOnDisk, [], 'untracking removes the index entry, never the file');
  assert.ok(report.prefixFiles > 0, 'the prefix is measured on a non-empty directory, not an absent one');
});

test('C001 the removal took none of the recorded bytes with it', () => {
  assert.strictEqual(
    measure().prefixDigest,
    FROZEN_DERIVED_ARTEFACT_DIGEST,
    'a digest that moved means a working-tree file changed or left; re-run and record the measurement, never adjust the constant',
  );
});

// ---------------------------------------------------------------------------
// The rule that keeps them out, and where it has to live
// ---------------------------------------------------------------------------

test('C001 the rule that decides a run-output path is the toolchain ignore file', () => {
  const rule = decidingIgnoreRule({ repositoryRoot: REPOSITORY_ROOT, path: 'tools/conver/tmp/test-baseline.txt' });

  assert.ok(rule, 'the path is ignored');
  assert.strictEqual(rule.file, 'tools/conver/.gitignore', 'the rule belongs to the toolchain that produces the output');
  assert.strictEqual(rule.pattern, 'tmp/');
});

test('C001 the rule that decides a bytecode cache is the repository ignore file, because four trees carry one', () => {
  for (const path of BYTECODE_CACHE_PATHS) {
    const rule = decidingIgnoreRule({ repositoryRoot: REPOSITORY_ROOT, path });
    assert.ok(rule, path + ' is ignored');
    assert.strictEqual(
      rule.file,
      '.gitignore',
      path + ' lives in a tree the toolchain ignore file cannot reach, which is why the rule is at the root',
    );
    assert.strictEqual(rule.pattern, '__pycache__/');
  }
});

test('C001 the root ignore file states both halves of the bytecode rule', () => {
  const pyc = decidingIgnoreRule({ repositoryRoot: REPOSITORY_ROOT, path: BYTECODE_CACHE_PATHS[0] });
  assert.strictEqual(pyc.pattern, '__pycache__/', 'the directory rule is the load-bearing one');

  // `*.pyc` is the companion, so a cache that escapes its directory is still
  // ignored. It is asserted against a path that does not exist yet, which is the
  // point: the rule must decide before the file does.
  const escaped = decidingIgnoreRule({ repositoryRoot: REPOSITORY_ROOT, path: 'crates/siprs/tools/cache.pyc' });
  assert.ok(escaped, 'a .pyc outside a __pycache__ directory is still covered');
  assert.strictEqual(escaped.pattern, '*.pyc');
});

// ---------------------------------------------------------------------------
// Failure mode — silence must not read as clean
// ---------------------------------------------------------------------------

test('C001 a tree with no git repository is reported unavailable rather than clean', () => {
  // Every path inside this repository is inside the repository, so the fixture has
  // to be a directory that is genuinely outside it. An empty list would read as
  // "nothing is tracked here", which is the false negative this module removes.
  const outside = mkdtempSync(join(tmpdir(), 'derived-artefacts-'));
  try {
    const report = measureDerivedArtefacts({ repositoryRoot: outside });

    assert.strictEqual(report.unavailable, 'not-a-repository');
    assert.strictEqual(report.trackedPrefixPaths, null, 'null is not an empty list; nothing can be said about this tree');
    assert.strictEqual(report.prefixDigest, null);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
