// @verifies C001
// @verifies C002
/**
 * shared-run — one pipeline run per (root, stage) per suite run.
 *
 * The integration suite pays for the reverse instrument's honesty by running the
 * whole pipeline inside every test that needs a published run: about 23s over
 * `siprs-for-reverse` and about 70s over `siprs-with-4layers`. `node --test`
 * gives each test file its own process, so a test in one file cannot hand a run
 * to a test in another; the sharing has to be on disk.
 *
 * What is asserted here is not that the cache hits but that a shared run is a
 * measurement: the bytes under it equal the bytes a private run publishes, the
 * run never writes inside the tree it measures, and a directory that was not
 * finished is never read as though it were.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MARKER_FILE_NAME,
  instrumentDigest,
  readSharedRun,
  requestPipelineRun,
  resetSharedRunCounters,
  sharedRoot,
  sharedRunCounters,
} from '../helpers/shared-run.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';

/** A crate small enough to analyse in milliseconds, with the shape a run needs. */
const SYNTHETIC_TREE_FILES = Object.freeze({
  'Cargo.toml': ['[package]', 'name = "shared-run-subject"', ''].join('\n'),
  'src/lib.rs': ['pub fn a() -> u8 { 1 }', ''].join('\n'),
  'tests/verify_feature.rs': ['pub fn b() -> u8 { 2 }', ''].join('\n'),
});

const EARLY_STAGE = 'r0.5';
const LATE_STAGE = 'r2.5';

/** The names of the entries the shared root holds for one measured root. */
// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
function entriesNaming(root) {
  const directory = sharedRoot();
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => {
      const marker = join(directory, name, MARKER_FILE_NAME);
      if (!existsSync(marker)) return false;
      try {
        return JSON.parse(readFileSync(marker, 'utf8')).root === root;
      } catch {
        return false;
      }
    })
    .sort();
}

/** The tree's own bytes, with no entry for the marker a shared run adds. */
// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
function publishedBytes(directory) {
  const hashes = hashTree(directory);
  delete hashes[MARKER_FILE_NAME];
  return hashes;
}

/** Ask for a run from a worker thread, so two requests overlap for real. */
const REQUEST_IN_WORKER = `
  import { parentPort, workerData } from 'node:worker_threads';
  const { requestPipelineRun } = await import(workerData.helper);
  const run = await requestPipelineRun({ root: workerData.root, through: workerData.through });
  parentPort.postMessage(run.root);
`;

// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
function requestFromWorker(root, through) {
  const helper = new URL('../helpers/shared-run.mjs', import.meta.url).href;
  const source = new URL(`data:text/javascript,${encodeURIComponent(REQUEST_IN_WORKER)}`);
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, { workerData: { root, through, helper } });
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

test('a second request for the same pair reuses the first run', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    resetSharedRunCounters();
    const first = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });
    const second = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });

    assert.equal(second.root, first.root, 'the second request reads the first run rather than making one');
    assert.deepEqual(sharedRunCounters(), { created: 1, reused: 1 });
  } finally {
    tree.dispose();
  }
});

test('the bytes under a shared run equal the bytes a private run publishes', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  const privateOut = mkdtempSync(join(tmpdir(), 'wsp-fresh-'));
  try {
    const shared = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });
    await analyzeProject({ root: tree.root, out: privateOut, through: EARLY_STAGE });

    assert.deepEqual(
      publishedBytes(shared.root),
      publishedBytes(privateOut),
      'a shared run that differs from a fresh one has turned a measurement into an assumption',
    );
  } finally {
    rmSync(privateOut, { recursive: true, force: true });
    tree.dispose();
  }
});

test('a run reports the value it published, so a shared read stands in for the return value', async () => {
  // A run this process did not execute has no in-memory outcome, so every
  // integration reading comes from a published artefact. That substitution is
  // only sound while the two agree, and this is where that is checked — on a
  // synthetic tree, so it holds on every routine run rather than only in the
  // deferred suite.
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  const privateOut = mkdtempSync(join(tmpdir(), 'wsp-report-'));
  try {
    const outcome = await analyzeProject({ root: tree.root, out: privateOut, through: EARLY_STAGE });
    const published = JSON.parse(readFileSync(join(privateOut, 'PATTERN.json'), 'utf8'));

    assert.equal(outcome.pattern.pattern, published.pattern);
    assert.equal(outcome.pattern.root, published.root);
  } finally {
    rmSync(privateOut, { recursive: true, force: true });
    tree.dispose();
  }
});

test('a request that cannot produce a run fails by name and leaves no directory', async () => {
  const absent = join(tmpdir(), 'wsp-absent-does-not-exist');
  await assert.rejects(
    () => requestPipelineRun({ root: absent, through: EARLY_STAGE }),
    /wsp-absent-does-not-exist/,
  );

  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    await assert.rejects(() => requestPipelineRun({ root: tree.root, through: 'r9' }), /r9/);
    assert.deepEqual(
      entriesNaming(tree.root),
      [],
      'a refused stage leaves no directory a later request could read',
    );
  } finally {
    tree.dispose();
  }
});

test('two stages over one root yield two directories, and the earlier one survives the later', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    const early = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });
    const late = await requestPipelineRun({ root: tree.root, through: LATE_STAGE });

    assert.notEqual(late.root, early.root, 'the two stages publish into different directories');
    assert.equal(existsSync(join(late.root, 'DEPENDENCIES.json')), true, 'the later stage publishes more');
    assert.equal(
      existsSync(join(late.root, 'SCOPE-BOUNDARY.json')),
      true,
      'and everything the earlier one published',
    );

    const again = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });
    assert.equal(again.root, early.root, 'the earlier stage still answers for the earlier stage');
  } finally {
    tree.dispose();
  }
});

test('the shared root is outside the measured root and an unmarked directory is refused', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    const before = hashTree(tree.root);
    const run = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });

    assert.equal(
      run.root.startsWith(tree.root + '/'),
      false,
      'every path the helper writes lies outside every path it reads',
    );
    assert.deepEqual(hashTree(tree.root), before, 'a run must not change what it measures');

    const orphan = join(sharedRoot(), 'orphan-with-no-marker');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'SCOPE-BOUNDARY.json'), '{}');
    assert.throws(
      () => readSharedRun(orphan),
      /marker/,
      'a directory whose marker is absent is not a completed run',
    );
  } finally {
    tree.dispose();
  }
});

test('two concurrent requests yield one directory and identical bytes', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    const [first, second] = await Promise.all([
      requestFromWorker(tree.root, EARLY_STAGE),
      requestFromWorker(tree.root, EARLY_STAGE),
    ]);

    assert.equal(first, second, 'both callers observe the same published directory');
    assert.deepEqual(publishedBytes(first), publishedBytes(second));
    assert.equal(
      entriesNaming(tree.root).length,
      1,
      'exactly one entry directory exists for the key, and no half-built sibling survives',
    );
  } finally {
    tree.dispose();
  }
});

test('the marker names the stage the directory was created for', async () => {
  const tree = createSyntheticTree(SYNTHETIC_TREE_FILES);
  try {
    const run = await requestPipelineRun({ root: tree.root, through: EARLY_STAGE });
    const marker = readSharedRun(run.root);

    assert.equal(marker.through, EARLY_STAGE);
    assert.equal(marker.root, tree.root);
    assert.equal(
      marker.instrumentDigest,
      instrumentDigest(),
      'a run produced by different library sources is not this run',
    );
    await assert.rejects(
      () => requestPipelineRun({ root: tree.root, through: 'not-a-stage' }),
      /not-a-stage/,
    );
  } finally {
    tree.dispose();
  }
});
