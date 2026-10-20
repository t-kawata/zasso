// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
// The workspace slice: one invocation reaching every package the allocation names (PX-264).
//
// The single-package projection is what the grill command calls per directory, so it stays
// exactly as it was. What did not exist was a form that reaches the packages nobody ran the
// command in: on a live workspace three of twenty-nine carried no view, and no surface said
// which. This file holds the rule that the workspace form is additive — every allocated
// package the material can carry gains a view, every package already carrying one is left
// byte-identical, and an inability is reported rather than fatal.
//
// @verifies C003
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { RUN, changedPaths, digestDirectory } from '../grill-me-for-rfc/sequences-material/fixtures/session-tree.mjs';
import { DISTRIBUTIONS_FILE_NAME, readDistributionRecord } from '../../.claude/scripts/sequences-slice/lib/distribution-record.mjs';
import { buildSyntheticTriple, removeSyntheticTriple } from './fixtures/synthetic-workspace.mjs';

const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';
const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** The workspace form is the one-argument form: the artifact path names the workspace. */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function runWorkspace(root) {
  const result = spawnSync(process.execPath, [RUN, path.join(root, ARTIFACT_FILENAME)], { encoding: 'utf8' });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

/** The packages the tree manifest names, which is the set the workspace form must reach. */
// [::TICKET::] PX-264 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-264 --for-spec --no-implementation-order`.
function allocatedPackages(root) {
  return JSON.parse(fs.readFileSync(path.join(root, TREE_MANIFEST_FILENAME), 'utf8')).workspace.packages;
}

test('PX-264 C003 the workspace form projects every allocated package that carries no view', () => {
  const root = buildSyntheticTriple();
  try {
    const packages = allocatedPackages(root);

    const { status, report } = runWorkspace(root);

    assert.equal(status, 0);
    assert.notEqual(report, null, 'the workspace form reports as JSON');
    assert.deepEqual(report.present, [], 'nothing carried a view before the first run');
    assert.deepEqual(report.projected, packages.map((entry) => entry.id).sort());
    for (const entry of packages) {
      assert.ok(fs.existsSync(path.join(root, entry.path, 'SEQUENCES.json')), `${entry.id} carries SEQUENCES.json`);
      assert.ok(fs.existsSync(path.join(root, entry.path, 'SEQUENCES.md')), `${entry.id} carries SEQUENCES.md`);
    }
  } finally {
    removeSyntheticTriple(root);
  }
});

test('PX-264 C003 C005 a package that already carries a view is left byte-identical', () => {
  const root = buildSyntheticTriple();
  try {
    runWorkspace(root);
    const before = digestDirectory(root);

    const second = runWorkspace(root);

    assert.deepEqual(changedPaths(before, digestDirectory(root)), [], 'a re-run rewrites nothing');
    assert.deepEqual(second.report.projected, [], 'no package is projected twice');
    assert.equal(second.report.present.length, allocatedPackages(root).length, 'every package reads as already present');
  } finally {
    removeSyntheticTriple(root);
  }
});

test('PX-264 C003 projected plus present is exactly the set the tree manifest names', () => {
  const root = buildSyntheticTriple();
  try {
    const packages = allocatedPackages(root).map((entry) => entry.id);

    const report = runWorkspace(root).report;

    const seen = [...report.projected, ...report.present];
    assert.equal(seen.length, new Set(seen).size, 'no package is reported twice');
    assert.deepEqual([...seen].sort(), [...packages].sort(), 'no package is lost between the lists');
  } finally {
    removeSyntheticTriple(root);
  }
});

test('PX-264 C003 a workspace whose material cannot be read is reported, and nothing is written', () => {
  const root = buildSyntheticTriple({ omitCratesTree: true });
  try {
    const before = digestDirectory(root);

    const { status, report } = runWorkspace(root);

    assert.equal(status, 0, 'a projection never stops the pipeline it runs in');
    assert.deepEqual(report.projected, []);
    assert.match(report.reason, /could not be read|no package seed/);
    assert.deepEqual(changedPaths(before, digestDirectory(root)), [], 'a refused run leaves the tree as it found it');
  } finally {
    removeSyntheticTriple(root);
  }
});

// PX-282 — the workspace form leaves a package it reports as present untouched, including
// its distribution record. A re-run that rewrote a record would turn "already present" into
// a new distribution claim.

// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
test('C003 invariant: a second workspace run reports every package present and changes no record', () => {
  const root = buildSyntheticTriple();
  try {
    const first = runWorkspace(root);
    assert.equal(first.status, 0);
    const packages = allocatedPackages(root);
    const recordPath = (entry) => path.join(root, entry.path, DISTRIBUTIONS_FILE_NAME);
    const before = new Map(packages.map((entry) => [entry.id, fs.readFileSync(recordPath(entry), 'utf8')]));

    const second = runWorkspace(root);

    assert.equal(second.status, 0);
    assert.deepEqual(second.report.projected, []);
    assert.deepEqual(second.report.present, packages.map((entry) => entry.id).sort());
    for (const entry of packages) {
      assert.equal(fs.readFileSync(recordPath(entry), 'utf8'), before.get(entry.id), entry.id);
      assert.equal(readDistributionRecord(path.join(root, entry.path)).distributions, 1, entry.id);
    }
  } finally {
    removeSyntheticTriple(root);
  }
});
